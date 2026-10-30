// Plan morning-digest § 1 (issue #1). The contract section 2 codes against: change it only
// with every consumer in the same commit.

export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null; // owner of the job's latest line
  runs: number; // log lines for this job
  ok: number; // lines with status ok
  retries: number; // lines with status retry
  fails: number; // lines with status fail
  lastStatus: RunStatus; // status of the latest line
  lastError: string | null; // error of the latest line that had one, else null
  firstAt: string; // `at` exactly as in the log (keep the offset, never convert to UTC)
  lastAt: string;
};

// `night` is the YYYY-MM-DD id that was asked for. `rows` holds one row per job, sorted by job
// in plain string order (UTF-16 code units, like Array#sort; not localeCompare).
// `badLines` counts lines that did not parse or lacked a valid field; blank lines are not bad.
export type Night = { night: string; rows: DigestRow[]; badLines: number };

// Reads `<runsDir>/<night>.jsonl`. null = no file for that night, or a night id that is not
// YYYY-MM-DD (no path traversal). An empty file gives `{ rows: [], badLines: 0 }`.
// "Latest"/"first" go by Date.parse(at); ties keep file order (the later line is the latest).
// Implemented in `src/digest/read.ts` as `export const readNight: ReadNight`.
export type ReadNight = (runsDir: string, night: string) => Night | null;
