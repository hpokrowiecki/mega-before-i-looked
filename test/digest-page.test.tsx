import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };
const JOBS = ['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs'];

function rowFor(html: string, job: string): string {
  const match = html.match(new RegExp(`<tr[^>]*>(?:(?!</tr>).)*<td>${job}</td>.*?</tr>`, 's'));
  if (!match) throw new Error(`no row for ${job}`);
  return match[0];
}

describe('digest page', () => {
  it('renders 2026-10-28 with jobs in order, warnings and gaps marked', async () => {
    const res = await createApp(config).request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    const positions = JOBS.map((job) => html.indexOf(`<td>${job}</td>`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(rowFor(html, 'fixtures/refresh')).toContain('class="warn"');
    expect(rowFor(html, 'notes/backup')).toContain('class="warn"');
    expect(rowFor(html, 'lane/sync')).not.toContain('warn');
    expect(rowFor(html, 'digest/render')).toContain('<td>—</td>');
    expect(html).toContain('bad lines: 1');
    expect(html).toContain('digest · 2026-10-28');
  });

  it('returns 404 with the banner for a night with no file', async () => {
    const res = await createApp(config).request('/digest/2020-01-01');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no run log for 2020-01-01');
  });
});
