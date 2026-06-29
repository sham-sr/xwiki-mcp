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
        '  • you need to find a page by eyeballing titles\n' +
        'Nested sections: dot notation, e.g. space="Docs.01._specification".\n' +
        'Set `wiki` when not using the default virtual wiki.\n' +
        'Returns: {pages: [{id, title, parent, url}], _pagination}. NEXT: get_page({ id }).',
      inputSchema: {
        wiki: z
          .string()
          .optional()
          .describe('Virtual wiki name (default: XWIKI_WIKI_NAME).'),
        space: z
          .string()
          .describe('Space path. Example: "system_overview" or "Docs.01._specification".'),
        start: z.number().int().min(0).optional().default(0).describe('Pagination offset.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe('How many pages (default 50, max 200).'),
      },
    },
    async ({ wiki, space, start, limit }) => {
      try {
        const effectiveLimit = limit ?? config.pageLimit;
        const { pages, pagination } = await client.listPages(space, start, effectiveLimit, wiki);
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
