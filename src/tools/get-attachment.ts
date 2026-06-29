import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { XWikiError } from '../client.js';
import type { XWikiClient } from '../client.js';
import { pageRefSchema } from './page-ref.js';

export function register(server: McpServer, client: XWikiClient): void {
  const inputSchema = pageRefSchema.and(z.object({
    name: z.string().describe('Attachment file name exactly as returned by get_attachments.'),
    max_bytes: z
      .number()
      .int()
      .min(1)
      .max(2_000_000)
      .optional()
      .describe('Max bytes to return (default 512000).'),
  }));

  server.registerTool(
    'get_attachment',
    {
      description:
        'Download text content of a page attachment (.md, .txt, .csv, .json, etc.).\n' +
        'Use after `get_attachments` when the file is text-based.\n' +
        'Does NOT download binary (PDF, images) — use download_url from get_attachments.\n' +
        'Prefer `id` from search when addressing the page.',
      inputSchema,
    },
    async ({ id, wiki, space, page, name, max_bytes }) => {
      try {
        const result = await client.getAttachmentContent({
          id,
          wiki,
          space,
          page,
          name,
          max_bytes,
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        const label = id ?? `${wiki ?? 'default'}:${space}/${page}`;
        const msg = e instanceof XWikiError && e.status === 404
          ? `Not found: ${label} attachment ${name}`
          : e instanceof Error ? e.message : String(e);
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    },
  );
}
