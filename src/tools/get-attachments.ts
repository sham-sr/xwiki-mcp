import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { XWikiError } from '../client.js';
import type { XWikiClient } from '../client.js';
import { pageRefSchema } from './page-ref.js';
import { parsePageId } from '../reference.js';

export function register(server: McpServer, client: XWikiClient): void {
  server.registerTool(
    'get_attachments',
    {
      description:
        'List files attached to a wiki page (screenshots, PDFs, CSVs, etc.).\n' +
        'Use this when:\n' +
        '  • the user asks about files / attachments on a page\n' +
        '  • page content references an image or document by name\n' +
        '  • data may live in a spreadsheet/PDF rather than page text\n' +
        'Prefer `id` from search. For text files follow up with `get_attachment`.\n' +
        'Returns: [{name, size_bytes, mime_type, author, date, download_url}].',
      inputSchema: pageRefSchema,
    },
    async ({ id, wiki, space, page }) => {
      try {
        const ref = id ? parsePageId(id) : { wiki: wiki ?? client.getDefaultWiki(), space: space!, page: page! };
        const attachments = await client.getAttachments(ref.space, ref.page, ref.wiki);
        return { content: [{ type: 'text', text: JSON.stringify(attachments, null, 2) }] };
      } catch (e) {
        const label = id ?? `${wiki ?? 'default'}:${space}/${page}`;
        const msg = e instanceof XWikiError && e.status === 404
          ? `Page not found: ${label}`
          : e instanceof Error ? e.message : String(e);
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    },
  );
}
