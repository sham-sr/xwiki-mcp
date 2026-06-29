import type { SearchEngine, SearchScope } from './types.js';
import { AUTO_QUOTE_MIN_WORDS, normalizeTokens } from './solr-query.js';

export function buildSearchSuggestions(
  query: string,
  opts: {
    engine?: SearchEngine;
    scope?: SearchScope;
    space?: string;
    wiki?: string;
  },
  resultCount: number,
): string[] | undefined {
  if (resultCount > 0) return undefined;

  const suggestions: string[] = [];
  const tokens = normalizeTokens(query);
  const wordCount = tokens.length;

  if (opts.engine === 'solr') {
    suggestions.push('Omit `engine` for auto mode (Solr then legacy fallback)');
  } else if (!opts.engine) {
    suggestions.push('Solr returned nothing; legacy also empty — try different keywords');
  }

  if (!opts.scope) {
    suggestions.push('Try scope:"title" for section or document titles (e.g. "System Architecture Overview")');
    suggestions.push('Try scope:"name" to match page URL slugs');
  }

  if (!opts.wiki) {
    suggestions.push('Narrow to one virtual wiki with `wiki` (e.g. wiki:"mywiki")');
  }

  if (!opts.space && query.trim()) {
    suggestions.push('Add `space` to limit to one section tree');
  }

  if (wordCount >= AUTO_QUOTE_MIN_WORDS) {
    suggestions.push(
      `Long query (${wordCount} words): retry with 2–4 keywords or scope:"title"`,
    );
    suggestions.push(
      'For an exact sentence from a page, pass query in double quotes: "фраза из вики"',
    );
  } else if (wordCount >= 3 && !opts.scope) {
    suggestions.push('Try fewer keywords, or wrap an exact phrase in double quotes');
  }

  if (wordCount === 1 && !opts.scope) {
    suggestions.push('Multi-word queries often work better for Russian full-text');
  }

  suggestions.push('Check `_search.solr_q` to see the Solr query that was sent');
  suggestions.push('Call `list_wikis` / `list_spaces` to browse structure');
  suggestions.push('Call `wiki_status` to verify Solr indexing per wiki');
  suggestions.push('Paste a browser URL into `resolve_url` to get page `id`');

  return suggestions;
}
