# Changelog

All notable changes to `xwiki-mcp` will be documented here.

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
