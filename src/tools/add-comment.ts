import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { XWikiClient } from '../client.js';

export function register(server: McpServer, client: XWikiClient): void {
  server.registerTool(
    'add_comment',
    {
      description:
        'Post a comment underneath a wiki page (appears in the page Comments section).\n' +
        'Use this when:\n' +
        '  • the user says "leave a comment on page X" / "оставь комментарий"\n' +
        '  • you want to record a note/observation without editing the page body itself\n' +
        '  • a discussion thread needs a reply.\n' +
        'Do NOT use this for substantive content — that belongs in the page body via `create_page`.\n' +
        'Returns: {ok: true}.',
      inputSchema: {
        space: z.string().describe('Space path with dots. Example: "Documentation.API".'),
        page: z.string().describe('Page to comment on (the slug, not the display title).'),
        text: z
          .string()
          .describe('Comment body. Plain text or XWiki markup — same syntax as `create_page` content.'),
        author: z
          .string()
          .optional()
          .describe('Optional author override. By default the authenticated user is used — leave empty unless told otherwise.'),
      },
    },
    async ({ space, page, text, author }) => {
      try {
        await client.addComment(space, page, text, author);
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    },
  );
}
