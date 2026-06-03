import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { XWikiClient } from '../client.js';

export function register(server: McpServer, client: XWikiClient): void {
  server.registerTool(
    'delete_page',
    {
      description:
        'DESTRUCTIVE: delete a page from the wiki. Only an admin can restore it afterwards.\n' +
        'Use ONLY when the user explicitly says: "delete the page", "remove X from the wiki", "удали страницу".\n' +
        'Do NOT call this tool to "clean up", "refactor", or as a side effect of any other request.\n' +
        'If the user asks to "update" or "rewrite" a page, use `create_page` instead (it overwrites).\n' +
        'Returns: {ok, deleted: "Space.Page"}.',
      inputSchema: {
        space: z.string().describe('Space path with dots. Example: "Sandbox" or "Documentation.API".'),
        page: z.string().describe('Page identifier to delete (the slug, not the display title).'),
      },
    },
    async ({ space, page }) => {
      try {
        await client.deletePage(space, page);
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: true, deleted: `${space}.${page}` }) }],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    },
  );
}
