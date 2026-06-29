import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { XWikiError } from '../client.js';
import type { XWikiClient } from '../client.js';
import { pageRefBaseSchema } from './page-ref.js';

const getPageInputSchema = pageRefBaseSchema
  .extend({
    content_offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Start reading body at this character offset (for long pages).'),
    max_chars: z
      .number()
      .int()
      .min(1)
      .max(200_000)
      .optional()
      .describe('Max characters of `content` to return. Omit to return the full page.'),
  })
  .refine(data => data.id || (data.space && data.page), {
    message: 'Provide either `id` (from search) or both `space` and `page`.',
  });

export function register(server: McpServer, client: XWikiClient): void {
  server.registerTool(
    'get_page',
    {
      description:
        'Read the full content of one wiki page (text, formulas, links).\n' +
        'Use this when:\n' +
        '  • `search` returned a relevant result — pass `id` from that result unchanged\n' +
        '  • `resolve_url` returned an `id` for a pasted browser link\n' +
        '  • you need to quote or summarise a page\n' +
        'PREFERRED: `id` from search (includes wiki + escaped dots).\n' +
        'ALTERNATIVE: `space` + `page` (+ optional `wiki`) on the default wiki.\n' +
        'Large pages: use `max_chars` and `content_offset` to read in chunks (`_content.truncated` in response).\n' +
        'Returns: {title, content, syntax, author, modified_date, version, url, _content?}.',
      inputSchema: getPageInputSchema,
    },
    async ({ id, wiki, space, page, content_offset, max_chars }) => {
      try {
        const slice = content_offset != null || max_chars != null
          ? { offset: content_offset, max_chars }
          : undefined;
        const result = id
          ? await client.getPageById(id, slice)
          : await client.getPage(space!, page!, wiki, slice);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
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
