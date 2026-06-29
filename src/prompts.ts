import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { XWikiClient } from './client.js';

const WIKI_RESEARCH_STEPS = `You are researching the corporate XWiki. Follow this workflow strictly:

1. **search** — never guess page paths.
   - Extract 2–4 keywords from the user question; do NOT paste long sentences as plain query.
   - Section / document title: scope:"title" + wiki:"..." (e.g. wiki:"mywiki").
   - Exact phrase from wiki text: wrap in double quotes — "фраза из страницы".
   - Omit engine for auto (Solr, then legacy fallback). Check _search.solr_q if empty.
2. Pick a result and **get_page({ id })** — pass id unchanged from search.
3. If the page is a section index, use **get_page_children({ id })** to go deeper.
4. If empty: read _search.suggestions, shorten query, try scope:"title", then **wiki_status**, **list_wikis**, **list_spaces**.
5. User pasted a URL? **resolve_url** first, then get_page({ id }).
6. Large page? get_page with max_chars + content_offset, read _content.truncated.

Full playbook: AGENTS.md in the xwiki-mcp repository.

Do NOT call create_page or delete_page unless the user explicitly asks to write or delete.`;

export function registerPromptsAndResources(server: McpServer, client: XWikiClient): void {
  server.registerPrompt(
    'wiki_research',
    {
      title: 'XWiki research workflow',
      description:
        'Step-by-step instructions for finding and reading corporate wiki pages. ' +
        'Use when the user asks to find documentation, architecture, or internal knowledge.',
      argsSchema: {
        topic: z.string().describe('What to find on the wiki (pass the user question or keywords).'),
      },
    },
    async ({ topic }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `${WIKI_RESEARCH_STEPS}\n\nTopic to research: ${topic}`,
        },
      }],
    }),
  );

  server.registerResource(
    'wikis-in-scope',
    'xwiki://wikis',
    {
      title: 'XWiki wikis in search scope',
      description:
        'Virtual wikis this MCP server can search. JSON: {wikis, default_wiki, wiki_names_source}.',
      mimeType: 'application/json',
    },
    async () => {
      const wikis = await client.listWikis();
      const payload = JSON.stringify({
        wikis,
        default_wiki: client.getDefaultWiki(),
        wiki_names_source: client.getWikiNamesSource(),
      }, null, 2);
      return {
        contents: [{
          uri: 'xwiki://wikis',
          mimeType: 'application/json',
          text: payload,
        }],
      };
    },
  );
}
