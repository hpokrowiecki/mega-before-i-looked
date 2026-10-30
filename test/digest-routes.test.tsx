import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow, Night } from '../src/digest/types.js';

// Plan morning-digest § 2d: route tests for 2a (page) and 2b (JSON) against a temp runs dir.

const NORMAL = '2026-01-10';
const EMPTY = '2026-01-11';
const BAD = '2026-01-12';
const NULL_OWNER = '2026-01-13';
const MISSING = '2026-01-14';

let runsDir = '';

function line(fields: Record<string, unknown>): string {
  return JSON.stringify(fields);
}

function writeNight(night: string, lines: string[]): void {
  writeFileSync(join(runsDir, `${night}.jsonl`), lines.length ? `${lines.join('\n')}\n` : '');
}

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  mkdirSync(runsDir, { recursive: true });

  // zeta-sync is written first, so job order on the page must come from sorting, not the file.
  writeNight(NORMAL, [
    line({ at: '2026-01-10T02:00:00+01:00', job: 'zeta-sync', status: 'ok', owner: 'ola' }),
    line({ at: '2026-01-10T02:10:00+01:00', job: 'alpha-backup', status: 'retry', owner: 'ola', error: 'timeout' }),
    line({ at: '2026-01-10T02:20:00+01:00', job: 'alpha-backup', status: 'retry', owner: 'ola', error: 'timeout' }),
    line({ at: '2026-01-10T02:30:00+01:00', job: 'alpha-backup', status: 'retry', owner: 'ola', error: 'timeout' }),
    line({ at: '2026-01-10T02:40:00+01:00', job: 'alpha-backup', status: 'ok', owner: 'ola' }),
    line({ at: '2026-01-10T03:00:00+01:00', job: 'mid-report', status: 'fail', owner: 'kuba', error: 'disk full' }),
  ]);
  writeNight(EMPTY, []);
  writeNight(BAD, [
    line({ at: '2026-01-12T02:00:00+01:00', job: 'beta-import', status: 'ok', owner: 'ola' }),
    '{"at": "2026-01-12T02:05:00+01:00", "job": "trunc',
    line({ at: '2026-01-12T02:10:00+01:00', job: 'gamma-export', status: 'ok', owner: 'kuba' }),
  ]);
  writeNight(NULL_OWNER, [
    line({ at: '2026-01-13T02:00:00+01:00', job: 'orphan-job', status: 'ok', owner: null }),
  ]);
});

afterAll(() => {
  if (runsDir) rmSync(runsDir, { recursive: true, force: true });
});

function app() {
  return createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
}

async function getPage(night: string): Promise<{ status: number; html: string }> {
  const res = await app().request(`/digest/${night}`);
  return { status: res.status, html: await res.text() };
}

async function getJson(night: string): Promise<{ status: number; body: unknown }> {
  const res = await app().request(`/api/digest/${night}`);
  return { status: res.status, body: await res.json() };
}

async function getNightJson(night: string): Promise<Night> {
  const { status, body } = await getJson(night);
  expect(status).toBe(200);
  return body as Night;
}

describe('GET /digest/:night', () => {
  it('renders a normal night with every job in job order', async () => {
    const { status, html } = await getPage(NORMAL);
    expect(status).toBe(200);
    expect(html).toContain(`digest · ${NORMAL}`);
    const positions = ['alpha-backup', 'mid-report', 'zeta-sync'].map((job) => html.indexOf(job));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('returns 404 for a night with no file', async () => {
    const { status } = await getPage(MISSING);
    expect(status).toBe(404);
  });

  it('says "nothing ran" for an empty night', async () => {
    const { status, html } = await getPage(EMPTY);
    expect(status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('renders the good rows of a night with a bad line and reports the count', async () => {
    const { status, html } = await getPage(BAD);
    expect(status).toBe(200);
    expect(html).toContain('beta-import');
    expect(html).toContain('gamma-export');
    expect(html).toContain('bad lines: 1');
  });

  it('shows — for a null owner', async () => {
    const { status, html } = await getPage(NULL_OWNER);
    expect(status).toBe(200);
    expect(html).toContain('orphan-job');
    expect(html).toContain('—');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns { night, rows, badLines } with rows sorted by job', async () => {
    const body = await getNightJson(NORMAL);
    expect(body.night).toBe(NORMAL);
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha-backup', 'mid-report', 'zeta-sync']);
  });

  it('carries DigestRow data: 3 retries, a fail, offsets kept', async () => {
    const body = await getNightJson(NORMAL);
    const alpha = body.rows.find((r) => r.job === 'alpha-backup');
    const mid = body.rows.find((r) => r.job === 'mid-report');
    expect(alpha).toMatchObject({
      runs: 4,
      ok: 1,
      retries: 3,
      fails: 0,
      lastStatus: 'ok',
      lastError: 'timeout',
      firstAt: '2026-01-10T02:10:00+01:00',
      lastAt: '2026-01-10T02:40:00+01:00',
    } satisfies Partial<DigestRow>);
    expect(mid).toMatchObject({ fails: 1, lastStatus: 'fail', lastError: 'disk full' } satisfies Partial<DigestRow>);
  });

  it('returns 404 { error, night } for a night with no file', async () => {
    const { status, body } = await getJson(MISSING);
    expect(status).toBe(404);
    expect(body).toEqual({ error: 'no run log', night: MISSING });
  });

  it('returns 404 { error, night } for an id that is not YYYY-MM-DD', async () => {
    const { status, body } = await getJson('not-a-date');
    expect(status).toBe(404);
    expect(body).toEqual({ error: 'no run log', night: 'not-a-date' });
  });

  it('returns empty rows and no bad lines for an empty night', async () => {
    const { status, body } = await getJson(EMPTY);
    expect(status).toBe(200);
    expect(body).toEqual({ night: EMPTY, rows: [], badLines: 0 });
  });

  it('counts the bad line and keeps the good rows', async () => {
    const body = await getNightJson(BAD);
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['beta-import', 'gamma-export']);
  });

  it('keeps a null owner as null', async () => {
    const body = await getNightJson(NULL_OWNER);
    expect(body.rows[0]?.owner).toBeNull();
  });
});

describe('page and JSON agree', () => {
  it('lists the same jobs in the same order', async () => {
    const jobs = (await getNightJson(NORMAL)).rows.map((r) => r.job);
    const { html } = await getPage(NORMAL);
    const positions = jobs.map((job) => html.indexOf(job));
    expect(jobs).toHaveLength(3);
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
