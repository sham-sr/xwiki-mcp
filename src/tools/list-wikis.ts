import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { XWikiClient } from '../client.js';

export function register(server: McpServer, client: XWikiClient): void {
  server.registerTool(
    'list_wikis',
    {
      description:
        'List virtual wikis in search scope and which one is the default for space+page lookups.\n' +
        'Use this when:\n' +
        '  • you need to know which wiki to pass to `search({ wiki })`\n' +
        '  • the user asks "what wikis are available?"\n' +
        '  • search returns results from unexpected wikis\n' +
        'Returns: {wikis: [{name, default, in_scope}], default_wiki, wiki_names_source}.',
    },
    async () => {
      try {
        const wikis = await client.listWikis();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              wikis,
              default_wiki: client.getDefaultWiki(),
              wiki_names_source: client.getWikiNamesSource(),
            }, null, 2),
          }],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    },
  );
}
