import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { config } from '../config.js';
import type { XWikiClient } from '../client.js';

export function register(server: McpServer, client: XWikiClient): void {
  server.registerTool(
    'list_pages',
    {
      description:
        'List pages inside a wiki space. Returns titles + URLs for browsing.\n' +
        'Use this when:\n' +
        '  • the user said "show me what is in <space>"\n' +
        '  • `search` returned a space-level hit and you want to dig deeper\n' +
        '  • you need to find a specific page by eyeballing titles rather than searching.\n' +
        'For nested sections: use DOT notation. Example: space="Documentation.API" reads /Documentation/API/.\n' +
        'Returns: {pages: [{id, title, parent, url}], _pagination: {...}}. ' +
        'NEXT STEP: pick a page and call `get_page` with the same space + the page name.',
      inputSchema: {
        space: z
          .string()
          .describe('Space path. Single name like "Sandbox", or nested with dots: "Documentation.API.v2".'),
        start: z.number().int().min(0).optional().default(0).describe('Pagination offset (0 = from the start)'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe('How many pages to return (default 50, max 200)'),
      },
    },
    async ({ space, start, limit }) => {
      try {
        const effectiveLimit = limit ?? config.pageLimit;
        const { pages, pagination } = await client.listPages(space, start, effectiveLimit);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ pages, _pagination: pagination }, null, 2),
          }],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    },
  );
}
