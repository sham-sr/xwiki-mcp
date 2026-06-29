import { describe, it, expect } from 'vitest';
import {
  escapeEntitySegment,
  pageIdFromParts,
  parsePageId,
  parseViewUrl,
  unescapeEntitySegment,
} from './reference.js';

describe('escapeEntitySegment / pageIdFromParts', () => {
  it('escapes dots in segment names', () => {
    expect(escapeEntitySegment('2._segment')).toBe('2\\._segment');
    expect(unescapeEntitySegment('2\\._segment')).toBe('2._segment');
  });

  it('builds page id with wiki prefix', () => {
    expect(pageIdFromParts('mywiki', 'Docs', 'WebHome')).toBe('mywiki:Docs.WebHome');
    expect(pageIdFromParts('mywiki', '2._segment', 'WebHome')).toBe('mywiki:2._segment.WebHome');
  });
});

describe('parsePageId round-trip', () => {
  it('parses id built from parts', () => {
    const id = pageIdFromParts('otherwiki', '2._segment', 'SamplePage');
    const parsed = parsePageId(id);
    expect(parsed.wiki).toBe('otherwiki');
    expect(parsed.space).toBe('2._segment');
    expect(parsed.page).toBe('SamplePage');
  });
});

describe('parseViewUrl', () => {
  it('parses /wiki/{wiki}/view/... URLs', () => {
    const r = parseViewUrl(
      'https://wiki.example.com/wiki/mywiki/view/Docs/Architecture/WebHome',
      'xwiki',
    );
    expect(r).toEqual({
      wiki: 'mywiki',
      space: 'Docs.Architecture',
      page: 'WebHome',
      id: 'mywiki:Docs.Architecture.WebHome',
      url: 'https://wiki.example.com/wiki/mywiki/view/Docs/Architecture/WebHome',
    });
  });

  it('parses /bin/view/... with default wiki', () => {
    const r = parseViewUrl('https://wiki.example.com/bin/view/Main/WebHome', 'xwiki');
    expect(r?.wiki).toBe('xwiki');
    expect(r?.space).toBe('Main');
    expect(r?.page).toBe('WebHome');
  });

  it('returns null for unrelated URLs', () => {
    expect(parseViewUrl('https://google.com/', 'xwiki')).toBeNull();
  });
});
