import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const git = (...args) => {
  try { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim(); }
  catch { throw Error('Git configuration could not be verified.'); }
};
const repository = value => {
  try {
    const normalized = value.replace(/^git@github\.com:/i, 'https://github.com/');
    const url = new URL(normalized);
    if (url.hostname.toLowerCase() !== 'github.com' || url.port || url.search || url.hash) return '';
    return url.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '').toLowerCase();
  } catch { return ''; }
};

try {
  const target = JSON.parse(readFileSync(new URL('../development-target.json', import.meta.url), 'utf8'));
  const branch = git('branch', '--show-current');
  if (!branch || target.forbiddenBranches.includes(branch)) throw Error(`Branch is not allowed for ${target.id}.`);
  const hook = process.argv[2] === '--pre-push';
  const remote = hook ? process.argv[3] : target.defaultRemote;
  const destination = hook ? process.argv[4] : git('remote', 'get-url', '--push', remote);
  if (repository(destination || '') !== target.githubRepository.toLowerCase()) {
    throw Error(`Push blocked: ${target.id} must use ${target.githubRepository}.`);
  }
  if (hook) {
    for (const line of readFileSync(0, 'utf8').trim().split(/\r?\n/).filter(Boolean)) {
      const fields = line.trim().split(/\s+/);
      const branchRef = fields[2]?.replace(/^refs\/heads\//, '');
      if (target.forbiddenBranches.includes(branchRef)) throw Error(`Destination branch is not allowed for ${target.id}.`);
    }
  }
  console.log(`Development target verified: ${target.id} | ${target.githubRepository} | ${branch}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
