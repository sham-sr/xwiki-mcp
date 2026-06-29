# xwiki-mcp — agent search playbook

**[Русский](AGENTS.ru.md)**

MCP is already configured. Do not guess page paths.

## Workflow

`search` → `get_page({ id })` → `get_page_children` / `get_attachments` if needed.

URL from user? `resolve_url` → `get_page({ id })`.

## `search` parameters

| Goal | Call |
|------|------|
| Section by title | `scope:"title"`, `wiki:"…"`, 2–4 keywords |
| Topic keywords | `wiki:"…"`, short `query` |
| Exact phrase from page | `query:"\"фраза из вики\""`, `wiki:"…"` |
| Subsection | add `space:"Parent.Child"` |
| Unknown wiki scope | `list_wikis` first, then set `wiki` |

**Rules:** 2–4 keywords from the user question — not the full sentence (unless quoted). `id` from results → pass unchanged to `get_page`. `engine` in the response = backend that answered, not your request.

**Empty results:** read `_search.suggestions` and `_search.solr_q` → fewer words or `scope:"title"` → `list_spaces` / `wiki_status`.

## Example

User: «How does static navigation work?»

1. `search({ query: "static navigation", scope: "title", wiki: "mywiki" })`
2. `search({ query: "navigation guide", scope: "title", wiki: "mywiki" })`
3. `get_page({ id: "<id from step 2>" })`

Write tools only when the user explicitly asks.
