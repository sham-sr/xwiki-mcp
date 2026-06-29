import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { XWikiError } from '../client.js';
import type { XWikiClient } from '../client.js';
import { pageRefSchema } from './page-ref.js';
import { parsePageId } from '../reference.js';

export function register(server: McpServer, client: XWikiClient): void {
  server.registerTool(
    'get_page_children',
    {
      description:
        'List direct child pages of a parent page (one level deep).\n' +
        'Use this when:\n' +
        '  • you landed on a section index (often "WebHome") and want subpages\n' +
        '  • the user asked "what subpages does X have?"\n' +
        '  • you are mapping a documentation tree\n' +
        'Prefer `id` from search. Returns: [{id, title, parent, url}].\n' +
        'NEXT: get_page({ id }) or recurse get_page_children.',
      inputSchema: pageRefSchema,
    },
    async ({ id, wiki, space, page }) => {
      try {
        const ref = id ? parsePageId(id) : { wiki: wiki ?? client.getDefaultWiki(), space: space!, page: page! };
        const children = await client.getPageChildren(ref.space, ref.page, ref.wiki);
        return { content: [{ type: 'text', text: JSON.stringify(children, null, 2) }] };
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
