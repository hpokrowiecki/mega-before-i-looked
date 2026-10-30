import { describe, expect, it } from 'vitest';
import { nightCounts } from '../src/digest/counts.js';
import { readNight } from '../src/digest/read.js';

function counts(night: string) {
  const read = readNight('runs', night);
  if (!read) throw new Error(`no runs/${night}.jsonl`);
  return nightCounts(read);
}

describe('nightCounts', () => {
  it('sums ok / retry / fail over the rows of 2026-10-28', () => {
    expect(counts('2026-10-28')).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('sums ok / retry / fail over the rows of 2026-10-27', () => {
    expect(counts('2026-10-27')).toEqual({ ok: 7, retry: 0, fail: 0 });
  });

  it('is all zeros for a night without rows', () => {
    expect(nightCounts({ night: '2026-01-01', rows: [], badLines: 3 })).toEqual({ ok: 0, retry: 0, fail: 0 });
  });
});
