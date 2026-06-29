#!/usr/bin/env python3
"""
Check Solr index coverage per virtual wiki on an XWiki instance.

Uses the same env vars as xwiki-mcp:
  XWIKI_BASE_URL, XWIKI_USERNAME, XWIKI_PASSWORD
  optional: XWIKI_AUTH_TYPE (basic|token|none), XWIKI_REST_PATH

Or load from Cursor mcp.json:
  python scripts/check_solr_index.py --mcp-json ~/.cursor/mcp.json --server xwiki

Example:
  set XWIKI_BASE_URL=https://wiki.example.com
  set XWIKI_USERNAME=user
  set XWIKI_PASSWORD=secret
  python scripts/check_solr_index.py
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


@dataclass
class Config:
    base_url: str
    rest_path: str
    auth_type: str
    username: str
    password: str
    token: str


@dataclass
class WikiIndexRow:
    wiki: str
    indexed: int | None
    status: str
    note: str = ""


def load_from_mcp_json(path: str, server: str) -> Config:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    servers = data.get("mcpServers") or {}
    if server not in servers:
        names = ", ".join(sorted(servers)) or "(none)"
        raise SystemExit(f"Server '{server}' not found in mcp.json. Available: {names}")
    env = servers[server].get("env") or {}
    return load_from_env(env)


def load_from_env(overrides: dict[str, str] | None = None) -> Config:
    env = {**os.environ, **(overrides or {})}
    base_url = env.get("XWIKI_BASE_URL", "").rstrip("/")
    if not base_url:
        raise SystemExit("XWIKI_BASE_URL is required (env or --mcp-json)")

    return Config(
        base_url=base_url,
        rest_path=env.get("XWIKI_REST_PATH", "/rest"),
        auth_type=env.get("XWIKI_AUTH_TYPE", "basic"),
        username=env.get("XWIKI_USERNAME", ""),
        password=env.get("XWIKI_PASSWORD", ""),
        token=env.get("XWIKI_TOKEN", ""),
    )


def auth_header(cfg: Config) -> dict[str, str]:
    headers = {"Accept": "application/json"}
    if cfg.auth_type == "basic":
        raw = f"{cfg.username}:{cfg.password}".encode()
        headers["Authorization"] = f"Basic {base64.b64encode(raw).decode('ascii')}"
    elif cfg.auth_type == "token":
        headers["Authorization"] = f"Bearer {cfg.token}"
    return headers


def request_json(
    cfg: Config,
    path: str,
    params: dict[str, str] | None = None,
    ctx: ssl.SSLContext | None = None,
) -> Any:
    url = f"{cfg.base_url}{cfg.rest_path}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=auth_header(cfg))
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"HTTP {e.code} {url}: {body}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Cannot connect to {cfg.base_url}: {e.reason}") from e


def discover_wikis(cfg: Config, ctx: ssl.SSLContext | None) -> list[str]:
    data = request_json(cfg, "/wikis", {"media": "json"}, ctx)
    names: list[str] = []
    for w in data.get("wikis") or []:
        name = w.get("name")
        if not name and w.get("id"):
            wid = w["id"]
            name = wid.split(":", 1)[0] if ":" in wid else wid
        if name:
            names.append(name)
    return sorted(set(names))


def solr_count(
    cfg: Config,
    ctx: ssl.SSLContext | None,
    wiki: str,
    page_size: int = 1000,
) -> tuple[int | None, str]:
    """Count Solr documents for one wiki via paginated *:* queries."""
    q = f"wiki:{wiki} AND *:*"
    total = 0
    start = 0

    try:
        while True:
            data = request_json(
                cfg,
                "/wikis/query",
                {
                    "type": "solr",
                    "q": q,
                    "wikis": wiki,
                    "start": str(start),
                    "number": str(page_size),
                    "media": "json",
                },
                ctx,
            )
            batch = data.get("searchResults") or []
            batch_len = len(batch)

            # Some XWiki versions expose totalResults; prefer it on first page.
            if start == 0 and data.get("totalResults") is not None:
                return int(data["totalResults"]), "ok"

            total += batch_len
            if batch_len < page_size:
                break
            start += page_size
    except RuntimeError as e:
        return None, str(e)

    if total == 0:
        return 0, "empty"
    if start > 0:
        return total, f"ok ({page_size}+ pages)"
    return total, "ok"


def solr_probe(
    cfg: Config,
    ctx: ssl.SSLContext | None,
    wiki: str,
    q: str,
) -> bool:
    """True if Solr returns at least one hit."""
    try:
        data = request_json(
            cfg,
            "/wikis/query",
            {
                "type": "solr",
                "q": q,
                "wikis": wiki,
                "start": "0",
                "number": "1",
                "media": "json",
            },
            ctx,
        )
    except RuntimeError:
        return False
    if data.get("totalResults"):
        return True
    return len(data.get("searchResults") or []) > 0


def print_table(rows: list[WikiIndexRow], probes: bool) -> None:
    if probes:
        headers = ("wiki", "indexed", "title", "content", "status")
        wiki_w = max(len(headers[0]), max((len(r.wiki) for r in rows), default=0))
        widths = [wiki_w + 2, 10, 6, 8, 12]
    else:
        headers = ("wiki", "indexed", "status", "note")
        wiki_w = max(len(headers[0]), max((len(r.wiki) for r in rows), default=0))
        widths = [wiki_w + 2, 10, 10, 30]

    def line(cols: tuple[str, ...]) -> str:
        return "".join(c.ljust(w) for c, w in zip(cols, widths, strict=True))

    print(line(headers))
    print(line(tuple("-" * (w - 1) for w in widths)))

    for r in rows:
        if probes:
            # title/content filled in note as "Y/N" split — store in row via note hack
            parts = r.note.split("|") if r.note else ["?", "?"]
            t, c = (parts + ["?", "?"])[:2]
            print(line((r.wiki, str(r.indexed if r.indexed is not None else "?"), t, c, r.status)))
        else:
            idx = str(r.indexed) if r.indexed is not None else "?"
            print(line((r.wiki, idx, r.status, r.note)))


def main() -> int:
    parser = argparse.ArgumentParser(description="Solr index coverage per XWiki virtual wiki")
    parser.add_argument("--mcp-json", help="Path to Cursor mcp.json")
    parser.add_argument("--server", default="xwiki", help="mcpServers key (default: xwiki)")
    parser.add_argument("--probes", action="store_true", help="Also test title:* and text:* per wiki (slower)")
    parser.add_argument("--insecure", action="store_true", help="Disable TLS certificate verification")
    args = parser.parse_args()

    if args.mcp_json:
        cfg = load_from_mcp_json(args.mcp_json, args.server)
    else:
        cfg = load_from_env()

    ctx = ssl.create_default_context()
    if args.insecure:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

    print(f"XWiki: {cfg.base_url}{cfg.rest_path}")
    print("Discovering wikis...")
    wikis = discover_wikis(cfg, ctx)
    print(f"Found {len(wikis)} wikis (login-visible)\n")

    rows: list[WikiIndexRow] = []
    total_indexed = 0
    wikis_with_docs = 0

    for wiki in wikis:
        print(f"  {wiki}...", flush=True)
        count, note = solr_count(cfg, ctx, wiki)
        status = "error" if count is None else ("empty" if count == 0 else "ok")
        row_note = note if count is None or "pages" in note else ""

        if args.probes and count is not None and count > 0:
            t_ok = solr_probe(cfg, ctx, wiki, "title:*")
            c_ok = solr_probe(cfg, ctx, wiki, "text:*")
            row_note = f"{'Y' if t_ok else 'N'}|{'Y' if c_ok else 'N'}"

        rows.append(WikiIndexRow(wiki=wiki, indexed=count, status=status, note=row_note))

        if count is not None and count > 0:
            total_indexed += count
            wikis_with_docs += 1

    print_table(rows, args.probes)

    print()
    print(f"Summary: {wikis_with_docs}/{len(wikis)} wikis have Solr documents")
    print(f"Sum of per-wiki indexed docs: {total_indexed}")
    print()
    print("Tips:")
    print("  indexed=0  -> wiki not indexed or not in Solr scope")
    print("  --probes   -> title:* / text:* smoke (content column = body indexed)")
    print("  Compare indexed count with page count in admin → Search → Solr")

    return 0


if __name__ == "__main__":
    sys.exit(main())
