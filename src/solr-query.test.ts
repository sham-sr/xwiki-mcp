import { describe, it, expect } from 'vitest';
import {
  AUTO_QUOTE_MIN_WORDS,
  buildSolrQuery,
  escapeSolrTerm,
  isAdvancedSolrQuery,
  normalizeTokens,
  shouldAutoQuote,
} from './solr-query.js';

describe('escapeSolrTerm', () => {
  it('escapes Solr special characters', () => {
    expect(escapeSolrTerm('foo:bar')).toBe('foo\\:bar');
    expect(escapeSolrTerm('a+b')).toBe('a\\+b');
  });
});

describe('normalizeTokens', () => {
  it('strips trailing punctuation from tokens', () => {
    expect(normalizeTokens('foo, bar!')).toEqual(['foo', 'bar']);
    expect(normalizeTokens('МК-105')).toEqual(['МК-105']);
  });
});

describe('shouldAutoQuote', () => {
  it('quotes long natural-language questions', () => {
    const words = Array.from({ length: AUTO_QUOTE_MIN_WORDS }, (_, i) => `w${i}`).join(' ');
    expect(shouldAutoQuote(words)).toBe(true);
    expect(shouldAutoQuote('foo bar')).toBe(false);
  });

  it('quotes phrases with comma or dash', () => {
    expect(shouldAutoQuote('Назовите, пожалуйста, станцию')).toBe(true);
    expect(shouldAutoQuote('оборудование – идентификация')).toBe(true);
  });
});

describe('isAdvancedSolrQuery', () => {
  it('detects field queries and booleans', () => {
    expect(isAdvancedSolrQuery('title:FooBar')).toBe(true);
    expect(isAdvancedSolrQuery('foo AND bar')).toBe(true);
    expect(isAdvancedSolrQuery('"exact phrase"')).toBe(true);
    expect(isAdvancedSolrQuery('FooBar')).toBe(false);
  });
});

describe('buildSolrQuery', () => {
  it('wraps plain single term in text wildcard', () => {
    expect(buildSolrQuery('FooBar', undefined, undefined)).toBe('text:(*FooBar*)');
  });

  it('wraps multi-word plain query with OR wildcards', () => {
    expect(buildSolrQuery('foo bar', undefined, undefined)).toBe('text:(*foo* OR *bar*)');
  });

  it('auto-quotes long plain questions', () => {
    const q = 'Назовите, пожалуйста, станцию, на которой установлено оборудование';
    expect(buildSolrQuery(q, undefined, undefined)).toBe(`"${q}"`);
  });

  it('passes advanced queries through unchanged', () => {
    expect(buildSolrQuery('title:FooBar', undefined, undefined)).toBe('title:FooBar');
    expect(buildSolrQuery('foo AND bar', undefined, undefined)).toBe('foo AND bar');
  });

  it('builds title scope with wildcards', () => {
    expect(buildSolrQuery('foo bar', 'title', undefined)).toBe('title:(*foo* OR *bar*)');
  });

  it('appends space filter', () => {
    expect(buildSolrQuery('foo', undefined, 'My.Space')).toContain('AND space:"My.Space"');
    expect(buildSolrQuery('foo', undefined, 'My.Space')).toContain('text:(*foo*)');
  });
});
