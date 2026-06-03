import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { XWikiClient } from '../client.js';

export function register(server: McpServer, client: XWikiClient): void {
  server.registerTool(
    'create_page',
    {
      description:
        'Write a page to the wiki. Creates a new page OR updates an existing one (same call — XWiki treats it as upsert).\n' +
        'Use this when the user says: "save to wiki", "publish", "write up", "document this", "create a page", "запиши в вики".\n' +
        '\n' +
        'WHERE TO PUT IT — pick a sensible location:\n' +
        '  • Personal notes / drafts → space="Sandbox"\n' +
        '  • Project-specific docs → space="Documentation.<ProjectName>"\n' +
        '  • If unsure, ASK the user before writing to anywhere except Sandbox.\n' +
        '\n' +
        'CONTENT FORMAT — XWiki markup (NOT Markdown by default):\n' +
        '  • Heading: "= H1 =" / "== H2 =="\n' +
        '  • Bold: "**bold**", Italic: "//italic//"\n' +
        '  • Link: "[[label>>Space.Page]]" or "[[label>>https://...]]"\n' +
        '  • List: "* item" (unordered), "1. item" (ordered)\n' +
        '  • Code block: {{code language="js"}} ... {{/code}}\n' +
        '  • Or pass syntax="markdown/1.2" to write Markdown instead.\n' +
        '\n' +
        'Returns: {ok, title, version, url}. The `url` is the human-facing page link.',
      inputSchema: {
        space: z
          .string()
          .describe(
            'Where to place the page. Dotted path for nesting. Examples: "Sandbox", "Documentation.MCP".',
          ),
        page: z
          .string()
          .describe(
            'Page identifier (the URL slug, not the display title). Use a short slug like "my-notes" or "Полезные MCP". ' +
            'For a section landing page use "WebHome".',
          ),
        title: z.string().describe('Human-readable title shown at the top of the page.'),
        content: z
          .string()
          .describe(
            'Page body. By default uses XWiki 2.1 syntax (see description above for examples). ' +
            'Switch with the `syntax` param if you want Markdown.',
          ),
        syntax: z
          .string()
          .optional()
          .default('xwiki/2.1')
          .describe(
            'Markup format id. Defaults to "xwiki/2.1". Alternatives: "xwiki/2.0", "markdown/1.2", "plain/1.0".',
          ),
      },
    },
    async ({ space, page, title, content, syntax }) => {
      try {
        const result = await client.createPage(space, page, title, content, syntax);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(
              {
                ok: true,
                title: result.title,
                version: result.version,
                url: result.url,
              },
              null,
              2,
            ),
          }],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    },
  );
}
