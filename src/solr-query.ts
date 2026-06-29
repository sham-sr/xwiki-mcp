export type SolrSearchScope = 'content' | 'title' | 'name';

/** Plain multi-word queries with at least this many tokens are sent as exact phrases. */
export const AUTO_QUOTE_MIN_WORDS = 5;

/** Solr special chars that must be escaped inside unquoted terms. */
const SOLR_SPECIAL = /[+\-&|!(){}[\]^"~*?:\\/]/g;

const TOKEN_PUNCT = /^[,.;:!?–—\-]+|[,.;:!?–—\-]+$/g;

/** Escape a single term for use inside Solr queries. */
export function escapeSolrTerm(term: string): string {
  return term.replace(SOLR_SPECIAL, '\\$&');
}

/** Escape double quotes inside a Solr phrase query. */
export function escapeSolrPhrase(phrase: string): string {
  return phrase.replace(/"/g, '\\"');
}

/**
 * Split on whitespace and strip leading/trailing punctuation per token.
 * Keeps internal hyphens (e.g. МК-105).
 */
export function normalizeTokens(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .map(t => t.replace(TOKEN_PUNCT, ''))
    .filter(t => t.length > 0);
}

/**
 * Long natural-language questions and comma/dash phrases work better as Solr phrase queries.
 */
export function shouldAutoQuote(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  if (normalizeTokens(trimmed).length >= AUTO_QUOTE_MIN_WORDS) return true;
  return /[,–—]/.test(trimmed);
}

/**
 * True when the user passed explicit Solr syntax — do not rewrite into text:().
 * Examples: title:foo, "exact phrase", foo AND bar, prefix*
 */
export function isAdvancedSolrQuery(query: string): boolean {
  const t = query.trim();
  if (!t) return false;
  if (t.includes('"')) return true;
  if (/\b(AND|OR|NOT)\b/.test(t)) return true;
  if (/\w\s*:/.test(t)) return true;
  if (/[*?]/.test(t)) return true;
  return false;
}

function wildcardTerms(query: string): string {
  const terms = normalizeTokens(query);
  if (terms.length === 0) return '*:*';
  if (terms.length === 1) return `*${escapeSolrTerm(terms[0])}*`;
  return terms.map(t => `*${escapeSolrTerm(t)}*`).join(' OR ');
}

/**
 * Build an XWiki Solr `q` parameter.
 * Plain queries: OR wildcards for short input; auto-phrase for long NL questions.
 */
export function buildSolrQuery(
  query: string,
  scope: SolrSearchScope | undefined,
  space: string | undefined,
): string {
  const trimmed = query.trim();
  let q: string;

  if (!trimmed) {
    q = '*:*';
  } else if (scope === 'title') {
    q = `title:(${wildcardTerms(trimmed)})`;
  } else if (scope === 'name') {
    q = `name:(${wildcardTerms(trimmed)})`;
  } else if (isAdvancedSolrQuery(trimmed)) {
    q = trimmed;
  } else if (shouldAutoQuote(trimmed)) {
    q = `"${escapeSolrPhrase(trimmed)}"`;
  } else {
    q = `text:(${wildcardTerms(trimmed)})`;
  }

  if (space) {
    q = `${q} AND space:"${space.replace(/"/g, '\\"')}"`;
  }
  return q;
}
