import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { XWikiError } from '../client.js';
import type { XWikiClient } from '../client.js';

export function register(server: McpServer, client: XWikiClient): void {
  server.registerTool(
    'get_page',
    {
      description:
        'Read the full content of one wiki page (the actual text, formulas, links, images).\n' +
        'Use this when:\n' +
        '  • `search` returned a relevant result and you want to read it — pass `space` and `page` straight from the search result\n' +
        '  • the user gave you a wiki URL or said "open page X"\n' +
        '  • you need to quote or summarise the page.\n' +
        'IMPORTANT — how to address a page:\n' +
        '  • `space` is the FULL path of containing folders joined with dots. Example: "Documentation.API.v2"\n' +
        '  • `page` is just the leaf page name. For section home pages this is usually "WebHome".\n' +
        '  • A search result with id "xwiki:Foo.Bar.WebHome" → space="Foo.Bar", page="WebHome".\n' +
        'Returns: {title, content, syntax, author, modified_date, version, url}. ' +
        '`content` is XWiki markup (typically xwiki/2.1) — not Markdown; "= H1 =" is a heading, "[[label>>target]]" is a link.',
      inputSchema: {
        space: z
          .string()
          .describe('Space path with dots for nesting. Example: "Sandbox" or "Documentation.API.v2".'),
        page: z
          .string()
          .describe('Page name (leaf only, not the full path). Usually "WebHome" for the section root.'),
      },
    },
    async ({ space, page }) => {
      try {
        const result = await client.getPage(space, page);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        const msg = e instanceof XWikiError && e.status === 404
          ? `Page not found: ${space}/${page}`
          : e instanceof Error ? e.message : String(e);
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    },
  );
}
