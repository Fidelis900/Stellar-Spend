import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/cn';

describe('cn utility', () => {
  it('joins multiple strings', () => {
    expect(cn('foo', 'bar', 'baz')).toBe('foo bar baz');
  });

  it('filters out false, null, undefined', () => {
    expect(cn('foo', false, 'bar', null, 'baz', undefined)).toBe('foo bar baz');
  });

  it('returns empty string for all falsy inputs', () => {
    expect(cn(false, null, undefined)).toBe('');
  });

  it('handles single string', () => {
    expect(cn('single')).toBe('single');
  });
});
