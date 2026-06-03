import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { XWikiError } from '../client.js';
import type { XWikiClient } from '../client.js';

export function register(server: McpServer, client: XWikiClient): void {
  server.registerTool(
    'get_attachments',
    {
      description:
        'List files attached to a wiki page (screenshots, PDFs, CSVs, etc.).\n' +
        'Use this when:\n' +
        '  • the user asks about files / attachments / screenshots on a page\n' +
        '  • the page content references an image or doc by name and you need the URL\n' +
        '  • you suspect data lives in attached spreadsheet/PDF rather than the page text.\n' +
        'Returns: array of {name, size_bytes, mime_type, author, date, download_url}. ' +
        'NOTE: this tool does NOT download file contents — use the `download_url` separately if needed.',
      inputSchema: {
        space: z
          .string()
          .describe('Space path with dots. Example: "Documentation.Releases".'),
        page: z.string().describe('Page name (leaf, e.g. "WebHome").'),
      },
    },
    async ({ space, page }) => {
      try {
        const attachments = await client.getAttachments(space, page);
        return { content: [{ type: 'text', text: JSON.stringify(attachments, null, 2) }] };
      } catch (e) {
        const msg = e instanceof XWikiError && e.status === 404
          ? `Page not found: ${space}/${page}`
          : e instanceof Error ? e.message : String(e);
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    },
  );
}
