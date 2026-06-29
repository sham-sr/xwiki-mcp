import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { config } from '../config.js';
import type { XWikiClient } from '../client.js';
import { buildSearchSuggestions } from '../search-suggestions.js';

export function register(server: McpServer, client: XWikiClient): void {
  server.registerTool(
    'search',
    {
      description:
        'PRIMARY ENTRY POINT for the corporate XWiki. Use this FIRST whenever the user mentions:\n' +
        '  • "wiki", "XWiki", "вики"\n' +
        '  • "documentation", "docs", "документация"\n' +
        '  • project/system names ("Project Alpha", "SampleModule", "domain visibility")\n' +
        '  • "how does X work?", "where is X described?", "find the page about X"\n' +
        '\n' +
        'DO NOT guess page paths. DO NOT call `get_page` blindly. Search first, then read.\n' +
        '\n' +
        'QUERY TIPS (important for Russian wiki):\n' +
        '  • User question → extract 2–4 keywords; do NOT paste the whole sentence unless quoting.\n' +
        '  • Find a section by title: scope:"title" + wiki:"mywiki" + short keywords.\n' +
        '  • Exact phrase from a page: wrap in double quotes — "Назовите, пожалуйста, станцию...".\n' +
        '  • Long questions (5+ words) are auto-quoted for Solr; shorter queries use OR between terms.\n' +
        '\n' +
        'Omit `engine` for auto mode: Solr full-text, legacy fallback if Solr is empty.\n' +
        '`engine:"solr"` = Solr only (no fallback). `engine:"legacy"` = page name/title only.\n' +
        'Use `wiki` to search one virtual wiki (e.g. "mywiki").\n' +
        'For section titles use `scope:"title"`; for slugs use `scope:"name"`.\n' +
        '\n' +
        'Returns: {engine, _search, results, _pagination}. `_search.solr_q` shows the Solr query sent.\n' +
        'Results include `id`, `excerpt` (when Solr provides it). Empty results include `_search.suggestions`.\n' +
        '\n' +
        'WORKFLOW: search → get_page({ id }) → get_page_children / get_attachments if needed.\n' +
        'See AGENTS.md in the xwiki-mcp package for a full agent playbook.',
      inputSchema: {
        query: z
          .string()
          .describe(
            'What to find. Prefer 2–4 keywords ("статическая навигация скрипт"). ' +
            'Exact wiki phrase: "цитата из страницы". ' +
            'Advanced Solr: title:foo, AND / OR / NOT.',
          ),
        engine: z
          .enum(['solr', 'legacy'])
          .optional()
          .describe(
            'Omit = auto (Solr + legacy fallback). "solr" = Solr only. "legacy" = name/title only.',
          ),
        wiki: z
          .string()
          .optional()
          .describe('Limit search to one virtual wiki, e.g. "mywiki".'),
        scope: z
          .enum(['content', 'title', 'name'])
          .optional()
          .describe('title = section/document titles; name = page URL slugs; default = full-text.'),
        space: z
          .string()
          .optional()
          .describe('Narrow to one section tree, e.g. "6._statisticheskaя_navigatsiя".'),
        start: z
          .number()
          .int()
          .min(0)
          .optional()
          .default(0)
          .describe('Pagination offset.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Number of results (default 20, max 100).'),
      },
    },
    async ({ query, engine, wiki, scope, space, start, limit }) => {
      try {
        const effectiveLimit = limit ?? Math.min(config.pageLimit, 20);
        const { results, pagination, engine: usedEngine, meta } = await client.search(query, {
          engine,
          wiki,
          scope,
          space,
          start,
          limit: effectiveLimit,
        });
        const suggestions = buildSearchSuggestions(
          query,
          { engine, wiki, scope, space },
          results.length,
        );
        const searchMeta = suggestions ? { ...meta, suggestions } : meta;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              engine: usedEngine,
              _search: searchMeta,
              results,
              _pagination: pagination,
            }, null, 2),
          }],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    },
  );
}
