import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { XWikiError } from '../client.js';
import type { XWikiClient } from '../client.js';

export function register(server: McpServer, client: XWikiClient): void {
  server.registerTool(
    'get_page_children',
    {
      description:
        'List direct child pages of a given parent page (one level deep — does not recurse).\n' +
        'Use this when:\n' +
        '  • you landed on a "section index" page (often "WebHome") and want to see what is below it\n' +
        '  • the user asked "what subpages does X have?"\n' +
        '  • you are mapping a topic and need to enumerate sub-articles.\n' +
        'Returns: array of {id, title, parent, url}. ' +
        'NEXT STEP: call `get_page` on a specific child, or recurse with `get_page_children` to go deeper.',
      inputSchema: {
        space: z
          .string()
          .describe('Space path with dots for nesting. Example: "Documentation.API".'),
        page: z.string().describe('Parent page name (leaf, usually "WebHome").'),
      },
    },
    async ({ space, page }) => {
      try {
        const children = await client.getPageChildren(space, page);
        return { content: [{ type: 'text', text: JSON.stringify(children, null, 2) }] };
      } catch (e) {
        const msg = e instanceof XWikiError && e.status === 404
          ? `Page not found: ${space}/${page}`
          : e instanceof Error ? e.message : String(e);
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    },
  );
}
