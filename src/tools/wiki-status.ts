import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { XWikiClient } from '../client.js';

export function register(server: McpServer, client: XWikiClient): void {
  server.registerTool(
    'wiki_status',
    {
      description:
        'Check Solr index coverage per virtual wiki (how many pages are searchable).\n' +
        'Use this when:\n' +
        '  • `search` returns nothing and you suspect Solr is empty or stale\n' +
        '  • the user asks "is the wiki indexed?" or "проверь индексацию"\n' +
        '  • you need to pick a wiki that actually has Solr documents\n' +
        'Returns per-wiki indexed doc counts. `quick:true` (default) may report "1000+" for large wikis.\n' +
        'NEXT STEP: narrow `search` with `wiki` to a wiki that has indexed > 0.',
      inputSchema: {
        wiki: z
          .string()
          .optional()
          .describe('Check one wiki only (e.g. "mywiki"). Omit to check all wikis in scope.'),
        quick: z
          .boolean()
          .optional()
          .default(true)
          .describe('true = one batch per wiki (fast). false = full pagination (slow, exact counts).'),
      },
    },
    async ({ wiki, quick }) => {
      try {
        const status = await client.getWikiStatus({ wiki, quick });
        return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    },
  );
}
