import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunStatus } from './types.js';

// Plan morning-digest § 1: one row per job from runs/<night>.jsonl. Bad lines are counted, never thrown.

const NIGHT_ID = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];
const MISSING_CODES: readonly string[] = ['ENOENT', 'ENOTDIR'];

// One valid log line, with `at` kept as written and `time` = Date.parse(at) for ordering.
type RunLine = {
  at: string;
  time: number;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT_ID.test(night)) return null;
  const text = readTextIfPresent(join(runsDir, `${night}.jsonl`));
  return text === null ? null : parseNight(night, text);
};

function readTextIfPresent(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (error: unknown) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    MISSING_CODES.includes(error.code)
  );
}

function parseNight(night: string, text: string): Night {
  const parsed = text
    .split('\n')
    .map((raw) => raw.trim())
    .filter((raw) => raw !== '')
    .map(parseLine);
  const lines = parsed.filter((line): line is RunLine => line !== null);
  return { night, rows: toRows(lines), badLines: parsed.length - lines.length };
}

function parseLine(raw: string): RunLine | null {
  const value = parseJson(raw);
  if (!isRecord(value)) return null;
  const { at, job, status, owner, error } = value;
  if (typeof at !== 'string' || typeof job !== 'string') return null;
  if (!isStatus(status) || !isOwner(owner)) return null;
  const time = Date.parse(at);
  if (Number.isNaN(time)) return null;
  return { at, time, job, status, owner, error: typeof error === 'string' ? error : null };
}

// undefined = did not parse (JSON itself never yields undefined).
function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStatus(value: unknown): value is RunStatus {
  return STATUSES.some((status) => status === value);
}

function isOwner(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function toRows(lines: readonly RunLine[]): DigestRow[] {
  const jobs = [...new Set(lines.map((line) => line.job))].toSorted(byPlainOrder);
  return jobs.map((job) => toRow(job, lines.filter((line) => line.job === job)));
}

// Plain string order (UTF-16 code units), the same order Array#sort gives strings.
function byPlainOrder(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

// `lines` is never empty: every job comes from at least one line.
function toRow(job: string, lines: readonly RunLine[]): DigestRow {
  // toSorted is stable, so lines at the same instant keep file order.
  const ordered = lines.toSorted((a, b) => a.time - b.time);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  return {
    job,
    owner: last.owner,
    runs: ordered.length,
    ok: countStatus(ordered, 'ok'),
    retries: countStatus(ordered, 'retry'),
    fails: countStatus(ordered, 'fail'),
    lastStatus: last.status,
    lastError: ordered.findLast((line) => line.error !== null)?.error ?? null,
    firstAt: first.at,
    lastAt: last.at,
  };
}

function countStatus(lines: readonly RunLine[], status: RunStatus): number {
  return lines.filter((line) => line.status === status).length;
}
