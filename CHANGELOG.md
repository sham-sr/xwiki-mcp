# Changelog

All notable changes to `xwiki-mcp` will be documented here.

## [Unreleased]

## [0.4.1] — 2026-06-25

### Added
- **`AGENTS.md` / `AGENTS.ru.md`** — compact search-only playbook for agents.
- **`_search.solr_q`** in search responses — Solr `q` parameter sent to XWiki (debugging).

### Changed
- **Solr plain queries** — multi-word input uses **OR** wildcards instead of AND; long questions (5+ words or comma/dash phrases) are **auto-quoted** as exact phrases.
- **`search` tool description** — query tips for Russian wiki, keywords vs quotes, link to AGENTS.md.
- **`wiki_research` prompt** — keyword extraction, quoting, `solr_q` hint.
- **Empty-search suggestions** — shorten long queries, use quotes, check `solr_q`.

## [0.4.0] — 2026-06-24

### Added
- **`list_wikis`** — wikis in search scope + default wiki.
- **`resolve_url`** — parse `/wiki/{wiki}/view/...` and `/bin/view/...` URLs into page `id`.
- **`wiki_status`** — Solr indexed document counts per wiki (in-server; complements `npm run check-solr`).
- **`get_attachment`** — download text attachment bodies (.md, .txt, .csv, …).
- **`search.wiki`** — limit search to one virtual wiki.
- **`search` suggestions** — `_search.suggestions` when no results (next steps for agents).
- **`excerpt`** field on search results when Solr provides it.
- **`get_page` chunking** — `max_chars` and `content_offset` with `_content` metadata.
- **`id` support** on `get_attachments` and `get_page_children`; **`wiki`** on `list_pages`.
- MCP **prompt** `wiki_research` and **resource** `xwiki://wikis`.

### Changed
- Tool descriptions updated for multi-wiki research workflow and Russian corporate wiki usage.

## [0.3.4] — 2026-06-24

### Changed
- **Search `engine` semantics** — omit `engine` for auto mode (Solr, then legacy fallback if empty). Explicit `engine: "solr"` runs Solr only with no fallback; `engine: "legacy"` unchanged. Removed Zod default on `engine` so MCP clients can distinguish omitted vs explicit.

## [0.3.3] — 2026-06-24

### Added
- **Auto-discovery of virtual wikis** — when `XWIKI_WIKI_NAMES` is unset, the server calls `GET /rest/wikis` at startup and uses all wikis on the instance for `search` and `list_spaces`.
- Startup log now shows wiki list source: `[env]` (explicit `XWIKI_WIKI_NAMES`) or `[discovered]`.
- Search metadata field `_search.wiki_names_source` (`env` | `discovered`).
- **`scripts/check_solr_index.py`** — Python utility to list login-visible wikis and Solr document counts per wiki (`npm run check-solr`).

### Changed
- **`XWIKI_WIKI_NAME` vs `XWIKI_WIKI_NAMES` clarified** — no longer treated as duplicates:
  - `XWIKI_WIKI_NAMES` — search/browse scope (optional; auto-discovered if unset).
  - `XWIKI_WIKI_NAME` — default wiki for `get_page({ space, page })` and write ops (optional; prefers `xwiki` when discovered, else first wiki).
- `client.initialize()` resolves wiki list before MCP connects.

## [0.3.2] — 2026-06-24

### Added
- **`solr-query.ts`** — plain queries become `text:(*term*)`, multi-word queries use AND with wildcards; advanced Solr syntax passed through unchanged.
- **Solr fan-out** — combined `wikis=a,b,c` first; if empty and multiple wikis configured, queries each wiki separately, merges and dedupes by `id`, sorts by score.
- **Auto-fallback to legacy search** when all Solr attempts return no results (`_search.solr_attempted`, `_search.fallback_reason`).
- **Legacy multi-wiki fan-out** — legacy `/search` iterates all wikis in scope.
- Search metadata: `_search.solr_fan_out`, `_search.wikis_searched`.

### Changed
- `list_spaces` aggregates spaces from all wikis in scope (not just the default wiki).

## [0.3.1] — 2026-06-24

### Fixed
- **REST path segments** for nested spaces — URLs now use real segment names (`2._segment`), not escaped entity-reference notation (`2\._segment`). Backslashes in search-result `id` values are reference serialization only; `get_page({ id })` builds correct `/spaces/.../pages/...` paths.

## [0.3.0] — 2026-06-24

### Added
- **`reference.ts`** — `parsePageId`, `splitEntityReference`, `spacePathFromReference`, `viewUrlFromPageFullName` for XWiki entity references with escaped dots.
- **`get_page` by `id`** — pass the `id` from a search result (e.g. `otherwiki:2\._segment....WebHome`); wiki is taken from the prefix.
- **Multi-wiki config** — `XWIKI_WIKI_NAMES` (comma-separated) scopes Solr/legacy search across several wikis.
- Search results enriched with `wiki`, `page`, `page_full_name`.
- `list_spaces` returns a `wiki` field per space.

### Changed
- Tool descriptions updated for multi-wiki workflow: search → `get_page({ id })`.

## [0.2.0] — 2026-06-03

### Added
- **Solr full-text search** (`engine: 'solr'`, default). Uses `/rest/wikis/query?type=solr`, which actually indexes page content — not just names. Returns proper relevance scores.
- **Write tools** (Phase 2):
  - `create_page` — create or update a page (upsert via PUT). Proper XML escaping for `title`/`content`/`syntax` so special characters (`<`, `&`, etc.) don't break the request.
  - `delete_page` — remove a page.
  - `add_comment` — append a comment to a page.
- Search `engine` param (`solr` | `legacy`) — lets you fall back to the old HQL endpoint on instances where Solr isn't indexed.

### Changed
- **All 9 tool descriptions rewritten** to be friendly for less-capable agents (Gemini, smaller LLMs). Each tool now has:
  - explicit "use this when..." triggers with user-phrase examples (incl. Russian)
  - "next step" hints pointing to the natural follow-up tool
  - concrete syntax examples for `space` / `page` parameters
  - a "do NOT call this for X" warning on destructive tools (`delete_page`)
  - inline XWiki-markup cheatsheet on `create_page` (headings, bold, links, code blocks)
- `search` description marks itself as the PRIMARY entry point and explicitly forbids guessing page paths before searching.
- `search` response now includes the actual `engine` used, so clients can verify which backend answered.
- Search results without a `hierarchy` block (typical for Solr responses) now fall back to a synthesised `/bin/view/...` URL built from `pageFullName`.

### Fixed
- Legacy `/search` endpoint only matched page names — agents kept returning empty results for content-level queries (e.g. searching "Видимость" found nothing even when many pages discussed it). Solr is now the default.

## [0.1.0] — 2026-05

Initial release. Read-only tools: `list_spaces`, `list_pages`, `get_page`, `get_page_children`, `get_attachments`, `search` (legacy endpoint).
