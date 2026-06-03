import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { config } from '../config.js';
import type { XWikiClient } from '../client.js';

export function register(server: McpServer, client: XWikiClient): void {
  server.registerTool(
    'search',
    {
      description:
        'PRIMARY ENTRY POINT for the corporate XWiki. Use this FIRST whenever the user mentions:\n' +
        '  • "wiki", "XWiki", "вики"\n' +
        '  • "documentation", "docs", "документация"\n' +
        '  • internal terms / project names / metric names you do not already know ("Видимость", "billing", "trial scoring")\n' +
        '  • "how does X work?", "where is X described?", "find the page about X"\n' +
        '\n' +
        'DO NOT guess page paths. DO NOT call `get_page` blindly. Search first, then read.\n' +
        '\n' +
        'This is a real full-text search over page CONTENT (Solr-indexed), not just titles. ' +
        'Pages are often in Russian — just pass the user query as-is, do not translate.\n' +
        '\n' +
        'Returns ranked results: each item has {id, title, space, url, score, modified_date}. ' +
        'A response also includes the actual `engine` used and `_pagination`.\n' +
        '\n' +
        'WORKFLOW: search → read top results with `get_page` (use the `space` and the page name from the result id) → ' +
        'if the right page is missing, fall back to `list_spaces` / `list_pages` for manual browsing.',
      inputSchema: {
        query: z
          .string()
          .describe(
            'What to find. Plain words work best ("visibility calculation", "видимость домена"). ' +
            'Advanced: "exact phrase" for phrase match, title:foo to restrict to titles, AND / OR / NOT for booleans.',
          ),
        engine: z
          .enum(['solr', 'legacy'])
          .optional()
          .default('solr')
          .describe(
            'Which backend to use. ALMOST ALWAYS leave default ("solr") — that one searches actual content. ' +
            'Only pass "legacy" if Solr returns an error (rare).',
          ),
        scope: z
          .enum(['content', 'title', 'name'])
          .optional()
          .describe(
            'Restrict matching to a single field. Default = all fields, which is usually what you want.',
          ),
        space: z
          .string()
          .optional()
          .describe(
            'Optional: narrow results to one section. Use the full dotted path, e.g. "Documentation.API". ' +
            'Omit this on the first attempt — full-wiki search is usually fine.',
          ),
        start: z
          .number()
          .int()
          .min(0)
          .optional()
          .default(0)
          .describe('Pagination offset. Use 0 for the first call; increment by `limit` to get more.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Number of results to return. Default 20, max 100. Pick 5–10 for quick lookups.'),
      },
    },
    async ({ query, engine, scope, space, start, limit }) => {
      try {
        const effectiveLimit = limit ?? Math.min(config.pageLimit, 20);
        const { results, pagination, engine: usedEngine } = await client.search(query, {
          engine,
          scope,
          space,
          start,
          limit: effectiveLimit,
        });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ engine: usedEngine, results, _pagination: pagination }, null, 2),
          }],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    },
  );
}
