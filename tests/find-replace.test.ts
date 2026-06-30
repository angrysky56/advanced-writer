import { describe, it, expect } from 'vitest';
import {
  escapeRegExp,
  buildBase,
  prepareReplacement,
  passesFilters,
} from '../src/tools/find-replace.js';

describe('find-replace helpers', () => {
  describe('escapeRegExp', () => {
    it('should escape regex special characters', () => {
      expect(escapeRegExp('hello.world*')).toBe('hello\\.world\\*');
      expect(escapeRegExp('abc[123]')).toBe('abc\\[123\\]');
    });
  });

  describe('buildBase', () => {
    it('should build case-insensitive literal regex by default', () => {
      const rx = buildBase({ find: 'test-word', replace: '', caseSensitive: false, mode: 'literal' });
      expect(rx.source).toBe('test-word');
      expect(rx.flags).toBe('i');
    });

    it('should build case-sensitive literal regex when caseSensitive is true', () => {
      const rx = buildBase({ find: 'test-word', replace: '', caseSensitive: true, mode: 'literal' });
      expect(rx.source).toBe('test-word');
      expect(rx.flags).toBe('');
    });

    it('should build regex with word boundaries in whole-word mode', () => {
      const rx = buildBase({ find: 'test', replace: '', caseSensitive: false, mode: 'whole-word' });
      expect(rx.source).toBe('\\btest\\b');
    });

    it('should build regex verbatim in regex mode', () => {
      const rx = buildBase({ find: '(a|b)+', replace: '', caseSensitive: false, mode: 'regex' });
      expect(rx.source).toBe('(a|b)+');
    });
  });

  describe('prepareReplacement', () => {
    it('should escape $ in literal mode', () => {
      expect(prepareReplacement({ find: 'foo', replace: 'price is $10', mode: 'literal' })).toBe('price is $$10');
    });

    it('should not escape $ in regex mode to allow backreferences', () => {
      expect(prepareReplacement({ find: 'foo', replace: 'price is $10', mode: 'regex' })).toBe('price is $10');
    });
  });

  describe('passesFilters', () => {
    it('should filter by storyId', () => {
      const opts = { find: 'x', replace: 'y', storyId: 'story-a' };
      expect(passesFilters('story-a/drafts/v1/scene-1.md', opts)).toBe(true);
      expect(passesFilters('story-b/drafts/v1/scene-1.md', opts)).toBe(false);
    });

    it('should filter by kinds', () => {
      const opts = { find: 'x', replace: 'y', kinds: ['scenes' as any] };
      // scenes folder map to "drafts"
      expect(passesFilters('my-story/drafts/v1/scene-1.md', opts)).toBe(true);
      expect(passesFilters('my-story/characters/hero.md', opts)).toBe(false);
    });

    it('should filter by version for drafts/manuscripts', () => {
      const opts = { find: 'x', replace: 'y', version: 'v2' };
      expect(passesFilters('my-story/drafts/v2/scene-1.md', opts)).toBe(true);
      expect(passesFilters('my-story/drafts/v1/scene-1.md', opts)).toBe(false);
    });
  });
});
