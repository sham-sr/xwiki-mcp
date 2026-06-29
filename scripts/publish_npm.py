#!/usr/bin/env python3
"""
Publish xwiki-mcp to a private Nexus npm repository.

Uses env vars (no secrets on the command line):
  NPM_REPOSITORY_URL  — e.g. https://nexus.example.com/repository/npm-hosted/
  NEXUS_USER
  NEXUS_PASSWORD

Example:
  set NPM_REPOSITORY_URL=https://nexus.example.com/repository/npm-hosted/
  set NEXUS_USER=deploy
  set NEXUS_PASSWORD=secret
  python scripts/publish_npm.py

  python scripts/publish_npm.py --dry-run
  python scripts/publish_npm.py --skip-build --skip-test
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
from pathlib import Path


def project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def load_dotenv(path: Path) -> None:
    """Load .env into os.environ (existing env vars are not overwritten)."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, sep, value = line.partition("=")
        if not sep:
            continue
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def load_version(root: Path) -> str:
    pkg = json.loads((root / "package.json").read_text(encoding="utf-8"))
    return str(pkg.get("version", "?"))


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"{name} is required")
    return value


def normalize_registry_url(url: str) -> str:
    parsed = urllib.parse.urlparse(url.strip())
    if parsed.scheme not in ("http", "https"):
        raise SystemExit(
            f"NPM_REPOSITORY_URL must be http(s), got: {url!r}"
        )
    if not parsed.netloc:
        raise SystemExit(f"NPM_REPOSITORY_URL has no host: {url!r}")
    path = parsed.path.rstrip("/")
    registry = f"{parsed.scheme}://{parsed.netloc}{path}/"
    lower = registry.lower()
    if "pypi" in lower and "npm" not in lower:
        raise SystemExit(
            f"NPM_REPOSITORY_URL looks like a PyPI repo, not npm: {registry}\n"
            "Use Nexus npm-hosted or npm-group (e.g. .../repository/npm-hosted/)."
        )
    return registry


def registry_auth_key(registry_url: str) -> str:
    parsed = urllib.parse.urlparse(registry_url.rstrip("/"))
    return f"//{parsed.netloc}{parsed.path}/"


def write_npmrc(registry_url: str, username: str, password: str) -> Path:
    auth = base64.b64encode(f"{username}:{password}".encode()).decode("ascii")
    key = registry_auth_key(registry_url)
    content = (
        f"registry={registry_url}\n"
        f"{key}:_auth={auth}\n"
        f"{key}:always-auth=true\n"
    )
    fd, path = tempfile.mkstemp(prefix="xwiki-mcp-npmrc-", suffix=".ini")
    os.close(fd)
    npmrc = Path(path)
    npmrc.write_text(content, encoding="utf-8")
    return npmrc


def run_npm(
    args: list[str],
    *,
    root: Path,
    env: dict[str, str],
    dry_run: bool,
) -> None:
    npm = shutil.which("npm")
    if not npm:
        raise SystemExit("npm not found in PATH — install Node.js 18+")

    cmd = [npm, *args]
    label = " ".join(cmd)
    if dry_run:
        print(f"[dry-run] would run in {root}: {label}")
        return

    print(f"-> {label}")
    subprocess.run(cmd, cwd=root, env=env, check=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build and publish xwiki-mcp to a private Nexus npm registry.",
    )
    parser.add_argument(
        "--registry",
        help="Override NPM_REPOSITORY_URL",
    )
    parser.add_argument(
        "--tag",
        default="latest",
        help='npm dist-tag (default: latest)',
    )
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="Skip npm run build (dist/ must already exist)",
    )
    parser.add_argument(
        "--skip-test",
        action="store_true",
        help="Skip npm test",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print steps and run npm publish --dry-run only",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    root = project_root()
    load_dotenv(root / ".env")
    version = load_version(root)
    registry = normalize_registry_url(
        args.registry or require_env("NPM_REPOSITORY_URL")
    )
    username = require_env("NEXUS_USER")
    password = require_env("NEXUS_PASSWORD")

    print(f"xwiki-mcp v{version}")
    print(f"registry: {registry}")

    npmrc = write_npmrc(registry, username, password)
    env = {**os.environ, "NPM_CONFIG_USERCONFIG": str(npmrc)}

    try:
        if not args.skip_build:
            run_npm(["run", "build"], root=root, env=env, dry_run=args.dry_run)
        elif not (root / "dist" / "index.js").is_file():
            raise SystemExit("dist/index.js missing — run build first or drop --skip-build")

        if not args.skip_test:
            run_npm(["test"], root=root, env=env, dry_run=args.dry_run)

        publish_args = ["publish", f"--registry={registry}", f"--tag={args.tag}"]
        if args.dry_run:
            publish_args.append("--dry-run")

        # prepublishOnly also runs build+test; skip to avoid duplicate work.
        publish_args.append("--ignore-scripts")
        run_npm(publish_args, root=root, env=env, dry_run=False)
    finally:
        npmrc.unlink(missing_ok=True)

    if args.dry_run:
        print("Dry run complete — package was not published.")
    else:
        print(f"Published xwiki-mcp@{version} to {registry}")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as exc:
        raise SystemExit(exc.returncode) from exc
