import { describe, it, expect } from 'vitest';
import { buildSearchSuggestions } from './search-suggestions.js';

describe('buildSearchSuggestions', () => {
  it('returns undefined when there are results', () => {
    expect(buildSearchSuggestions('foo', {}, 1)).toBeUndefined();
  });

  it('suggests wiki filter and browse tools when empty', () => {
    const s = buildSearchSuggestions('архитектура', {}, 0);
    expect(s).toBeDefined();
    expect(s!.some(x => x.includes('wiki'))).toBe(true);
    expect(s!.some(x => x.includes('wiki_status'))).toBe(true);
  });

  it('suggests omitting strict solr engine', () => {
    const s = buildSearchSuggestions('foo', { engine: 'solr' }, 0);
    expect(s!.some(x => x.includes('Omit `engine`'))).toBe(true);
  });

  it('suggests shortening long queries', () => {
    const long = 'one two three four five six seven';
    const s = buildSearchSuggestions(long, { wiki: 'mywiki' }, 0);
    expect(s!.some(x => x.includes('2–4 keywords'))).toBe(true);
    expect(s!.some(x => x.includes('double quotes'))).toBe(true);
  });
});
