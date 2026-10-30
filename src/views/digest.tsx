import type { DigestRow, Night } from '../digest/types.js';

const MISSING = '—';
const RETRY_WARN_AT = 3;

const COLUMNS = ['job', 'owner', 'runs', 'retries', 'fails', 'last status', 'last error', 'first', 'last'];

function isWarned(row: DigestRow): boolean {
  return row.retries >= RETRY_WARN_AT || row.fails > 0;
}

function Count({ value, warn }: { value: number; warn: boolean }) {
  return warn ? <strong>{value}</strong> : <>{value}</>;
}

function Row({ row }: { row: DigestRow }) {
  return (
    <tr class={isWarned(row) ? 'warn' : undefined}>
      <td>{row.job}</td>
      <td>{row.owner ?? MISSING}</td>
      <td>{row.runs}</td>
      <td><Count value={row.retries} warn={row.retries >= RETRY_WARN_AT} /></td>
      <td><Count value={row.fails} warn={row.fails > 0} /></td>
      <td>{row.lastStatus}</td>
      <td>{row.lastError ?? MISSING}</td>
      <td>{row.firstAt}</td>
      <td>{row.lastAt}</td>
    </tr>
  );
}

export function DigestPage({ digest }: { digest: Night }) {
  return (
    <>
      <h1>digest · {digest.night}</h1>
      {digest.badLines > 0 ? <p>bad lines: {digest.badLines}</p> : null}
      {digest.rows.length === 0 ? (
        <p>nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              {COLUMNS.map((name) => (
                <th>{name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => (
              <Row row={row} />
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export function DigestMissing({ night }: { night: string }) {
  return <p>no run log for {night}</p>;
}
