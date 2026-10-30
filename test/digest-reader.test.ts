import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';
import type { DigestRow, Night } from '../src/digest/types.js';

const RUNS = 'runs';

function rowOf(night: Night | null, job: string): DigestRow {
  const row = night?.rows.find((r) => r.job === job);
  if (!row) throw new Error(`no row for ${job}`);
  return row;
}

function line(fields: Record<string, unknown>): string {
  return JSON.stringify(fields);
}

describe('readNight on runs/2026-10-28.jsonl', () => {
  let night: Night | null = null;

  beforeAll(() => {
    night = readNight(RUNS, '2026-10-28');
  });

  it('gives 5 jobs and counts the truncated line as 1 bad line', () => {
    expect(night?.night).toBe('2026-10-28');
    expect(night?.rows).toHaveLength(5);
    expect(night?.badLines).toBe(1);
  });

  it('sorts rows by job in plain string order', () => {
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('fixtures/refresh: 3 retries then ok, keeps the last error seen', () => {
    expect(rowOf(night, 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      ok: 1,
      retries: 3,
      fails: 0,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('notes/backup: one fail with its error', () => {
    const row = rowOf(night, 'notes/backup');
    expect(row.runs).toBe(1);
    expect(row.fails).toBe(1);
    expect(row.lastStatus).toBe('fail');
    expect(row.lastError).toBe('quota exceeded');
    expect(row.owner).toBe('lane-07');
  });

  it('digest/render: null owner keeps the row', () => {
    const row = rowOf(night, 'digest/render');
    expect(row.owner).toBeNull();
    expect(row.runs).toBe(1);
    expect(row.lastStatus).toBe('ok');
    expect(row.lastError).toBeNull();
  });

  it('lane/sync: 8 good lines, the truncated one is not counted', () => {
    expect(rowOf(night, 'lane/sync')).toEqual({
      job: 'lane/sync',
      owner: 'rook',
      runs: 8,
      ok: 7,
      retries: 1,
      fails: 0,
      lastStatus: 'ok',
      lastError: 'lock held',
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
  });

  it('rig/rotate-logs: no error gives a null lastError', () => {
    const row = rowOf(night, 'rig/rotate-logs');
    expect(row.lastError).toBeNull();
    expect(row.firstAt).toBe('2026-10-28T23:00:02+01:00');
    expect(row.lastAt).toBe('2026-10-28T23:00:02+01:00');
  });
});

describe('readNight on runs/2026-10-27.jsonl', () => {
  it('gives 4 jobs and no bad lines', () => {
    const night = readNight(RUNS, '2026-10-27');
    expect(night?.rows.map((r) => r.job)).toEqual([
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night?.badLines).toBe(0);
    expect(rowOf(night, 'lane/sync').runs).toBe(4);
  });
});

describe('readNight on a temp runs dir', () => {
  let root = '';
  let runsDir = '';

  const write = (night: string, lines: readonly string[]): void => {
    writeFileSync(join(runsDir, `${night}.jsonl`), lines.join('\n'));
  };

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'rig-digest-'));
    runsDir = join(root, 'runs');
    mkdirSync(runsDir);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns null for a night with no file', () => {
    expect(readNight(runsDir, '2026-01-01')).toBeNull();
  });

  it('returns null for a runs dir that does not exist', () => {
    expect(readNight(join(root, 'nope'), '2026-01-01')).toBeNull();
  });

  it('returns no rows and no bad lines for an empty file', () => {
    write('2026-01-02', []);
    expect(readNight(runsDir, '2026-01-02')).toEqual({ night: '2026-01-02', rows: [], badLines: 0 });
  });

  it('returns null for a night id outside YYYY-MM-DD, even when the file it names exists', () => {
    const valid = line({ at: '2026-01-03T00:00:00Z', job: 'a', status: 'ok', owner: null });
    const ids = ['../x', '2026-1-03', '2026-01-03.jsonl', '2026-01-03/', ' 2026-01-03', '2026-01-03\n', ''];
    for (const id of ids) {
      const path = join(runsDir, `${id}.jsonl`);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, valid);
    }
    for (const id of ids) {
      expect(readNight(runsDir, id), JSON.stringify(id)).toBeNull();
    }
  });

  it('skips blank lines without counting them', () => {
    const ok = line({ at: '2026-01-04T01:00:00+01:00', job: 'a', status: 'ok', owner: 'rook' });
    write('2026-01-04', ['', ok, '   ', ok, '', '']);
    const night = readNight(runsDir, '2026-01-04');
    expect(night?.badLines).toBe(0);
    expect(rowOf(night, 'a').runs).toBe(2);
  });

  it('reads CRLF line endings', () => {
    const ok = line({ at: '2026-01-05T01:00:00+01:00', job: 'a', status: 'ok', owner: 'rook' });
    writeFileSync(join(runsDir, '2026-01-05.jsonl'), `${ok}\r\n${ok}\r\n`);
    const night = readNight(runsDir, '2026-01-05');
    expect(night?.badLines).toBe(0);
    expect(rowOf(night, 'a').runs).toBe(2);
  });

  it('counts each invalid line once and never throws', () => {
    const good = { at: '2026-01-06T01:00:00+01:00', job: 'a', status: 'ok', owner: 'rook' };
    write('2026-01-06', [
      '{not json',
      '42',
      'null',
      '[]',
      '"text"',
      line({ ...good, at: undefined }),
      line({ ...good, at: 1767657600000 }),
      line({ ...good, at: 'yesterday' }),
      line({ ...good, job: undefined }),
      line({ ...good, job: 7 }),
      line({ ...good, status: 'done' }),
      line({ ...good, status: undefined }),
      line({ ...good, owner: undefined }),
      line({ ...good, owner: 3 }),
      line(good),
    ]);
    const night = readNight(runsDir, '2026-01-06');
    expect(night?.badLines).toBe(14);
    expect(night?.rows).toHaveLength(1);
    expect(rowOf(night, 'a').runs).toBe(1);
  });

  it('keeps the night when every line is bad', () => {
    write('2026-01-07', ['{', '}']);
    expect(readNight(runsDir, '2026-01-07')).toEqual({ night: '2026-01-07', rows: [], badLines: 2 });
  });

  it('orders by time, not by file order or string order, and keeps the offsets', () => {
    // 01:30Z is written first; 02:00+01:00 (= 01:00Z) is earlier in time but sorts later as a string.
    write('2026-01-08', [
      line({ at: '2026-01-08T01:30:00+00:00', job: 'a', status: 'fail', owner: 'late', error: 'boom' }),
      line({ at: '2026-01-08T02:00:00+01:00', job: 'a', status: 'retry', owner: 'early', error: 'slow' }),
    ]);
    const row = rowOf(readNight(runsDir, '2026-01-08'), 'a');
    expect(row.firstAt).toBe('2026-01-08T02:00:00+01:00');
    expect(row.lastAt).toBe('2026-01-08T01:30:00+00:00');
    expect(row.lastStatus).toBe('fail');
    expect(row.owner).toBe('late');
    expect(row.lastError).toBe('boom');
  });

  it('breaks time ties by file order: the later line is the latest', () => {
    write('2026-01-09', [
      line({ at: '2026-01-09T01:00:00+01:00', job: 'a', status: 'fail', owner: 'first', error: 'one' }),
      line({ at: '2026-01-09T00:00:00Z', job: 'a', status: 'ok', owner: 'second' }),
    ]);
    const row = rowOf(readNight(runsDir, '2026-01-09'), 'a');
    expect(row.firstAt).toBe('2026-01-09T01:00:00+01:00');
    expect(row.lastAt).toBe('2026-01-09T00:00:00Z');
    expect(row.lastStatus).toBe('ok');
    expect(row.owner).toBe('second');
    expect(row.lastError).toBe('one');
  });

  it('takes the owner of the latest line, null included', () => {
    write('2026-01-10', [
      line({ at: '2026-01-10T01:00:00+01:00', job: 'a', status: 'ok', owner: 'rook' }),
      line({ at: '2026-01-10T02:00:00+01:00', job: 'a', status: 'ok', owner: null }),
    ]);
    expect(rowOf(readNight(runsDir, '2026-01-10'), 'a').owner).toBeNull();
  });

  it('ignores an error that is not a string', () => {
    write('2026-01-11', [
      line({ at: '2026-01-11T01:00:00+01:00', job: 'a', status: 'retry', owner: 'rook', error: 'real' }),
      line({ at: '2026-01-11T02:00:00+01:00', job: 'a', status: 'fail', owner: 'rook', error: null }),
    ]);
    const row = rowOf(readNight(runsDir, '2026-01-11'), 'a');
    expect(row.lastStatus).toBe('fail');
    expect(row.lastError).toBe('real');
  });
});
