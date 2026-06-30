import { describe, it, expect } from 'vitest';
import { storySlug } from '../src/storage/story-id.js';

describe('storySlug', () => {
  it('should convert standard names to lowercase and replace spaces with underscores', () => {
    expect(storySlug('The Neon Codex')).toBe('the_neon_codex');
  });

  it('should replace special characters with underscores', () => {
    expect(storySlug('Story: Act 1!')).toBe('story__act_1_');
  });

  it('should handle already slugified names correctly', () => {
    expect(storySlug('the_neon_codex')).toBe('the_neon_codex');
  });

  it('should return empty string for nullish inputs', () => {
    expect(storySlug(null as any)).toBe('');
    expect(storySlug(undefined as any)).toBe('');
  });
});
