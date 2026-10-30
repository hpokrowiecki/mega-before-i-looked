import type { Night } from './types.js';

export type NightCounts = { ok: number; retry: number; fail: number };

// Log lines by status for one night: the sums of the rows' counters. Bad lines are not counted.
export function nightCounts(night: Night): NightCounts {
  return night.rows.reduce<NightCounts>(
    (sum, row) => ({ ok: sum.ok + row.ok, retry: sum.retry + row.retries, fail: sum.fail + row.fails }),
    { ok: 0, retry: 0, fail: 0 },
  );
}
