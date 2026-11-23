#!/usr/bin/env node
// After the daily check: one open issue per source that is not working, closed again when it works.
// Uses the GitHub CLI (gh), which GitHub's own runners have, with the workflow's token.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' });
const status = JSON.parse(readFileSync('status.json', 'utf8'));
const open = JSON.parse(gh('issue', 'list', '--state', 'open', '--label', 'daily-check', '--json', 'number,title', '--limit', '100'));
try { gh('label', 'create', 'daily-check', '--color', 'd93f0b', '--description', 'Opened by the daily source check'); } catch { /* already there */ }

for (const [id, r] of Object.entries(status.sources)) {
  const title = `Source not working: ${r.name} (${id})`;
  const issue = open.find((i) => i.title === title);
  const broken = !r.skipped && r.working === false;
  const problems = [...r.lists.map((l) => ({ ...l, what: `List "${l.label}"` })), r.search && { ...r.search, what: 'Search' }, r.book && { ...r.book, what: 'Book download' }]
    .filter((x) => x && !x.ok).map((x) => `- **${x.what}**: ${x.error}`).join('\n');
  if (broken && !issue) {
    gh('issue', 'create', '--title', title, '--label', 'daily-check', '--body',
      `The daily check (${status.checkedAt}) could not use this source the way Kitab does:\n\n${problems}\n\nThis issue closes itself when the source works again.`);
    console.log('opened', title);
  } else if (!broken && issue) {
    gh('issue', 'close', String(issue.number), '--comment', `Working again (checked ${status.checkedAt}).`);
    console.log('closed', title);
  }
}
