import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { XWikiClient } from '../client.js';

export function register(server: McpServer, client: XWikiClient): void {
  server.registerTool(
    'resolve_url',
    {
      description:
        'Convert a XWiki browser URL into page coordinates for other tools.\n' +
        'Use this when the user pastes a link like:\n' +
        '  • https://wiki.example.com/wiki/mywiki/view/Docs/.../WebHome\n' +
        '  • https://wiki.example.com/bin/view/Main/WebHome\n' +
        'Returns: {wiki, space, page, id, url}. Pass `id` to `get_page`, `get_attachments`, etc.\n' +
        'NEXT STEP: `get_page({ id })`.',
      inputSchema: {
        url: z.string().describe('Full XWiki page URL from the browser address bar.'),
      },
    },
    async ({ url }) => {
      try {
        const resolved = client.resolveViewUrl(url);
        return { content: [{ type: 'text', text: JSON.stringify(resolved, null, 2) }] };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    },
  );
}
