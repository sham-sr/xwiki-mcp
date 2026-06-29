import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { XWikiClient } from '../client.js';

export function register(server: McpServer, client: XWikiClient): void {
  server.registerTool(
    'list_spaces',
    {
      description:
        'List top-level sections ("spaces") across all wikis in scope (XWIKI_WIKI_NAMES or auto-discovered via /rest/wikis). ' +
        'A "space" is like a folder — e.g. "Documentation", "Sandbox", "integratsii". ' +
        'Use this when:\n' +
        '  • the user asks "what is on the wiki?" or "show me the wiki structure"\n' +
        '  • `search` returned nothing — check `_search.suggestions`, then `wiki_status` or `list_wikis`\n' +
        '  • you need a valid space name before calling `list_pages` or `get_page`.\n' +
        'Returns: array of {id, name, wiki, home_url}. ' +
        'NEXT STEP: pick a relevant `name` and pass it to `list_pages` to see what is inside.',
    },
    async () => {
      try {
        const spaces = await client.listSpaces();
        return { content: [{ type: 'text', text: JSON.stringify(spaces, null, 2) }] };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    },
  );
}
