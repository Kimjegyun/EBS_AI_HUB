import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const script = readFileSync(new URL('./verify-development-target.mjs', import.meta.url), 'utf8');
const targets = [
  { id: 'ebs-aihub', githubRepository: 'Kimjegyun/EBS_AI_HUB', primaryBranch: 'main', forbiddenBranches: ['remote-version', 'acap-local', 'acap-remote'] },
  { id: 'acap-local', githubRepository: 'Kimjegyun/EBS_AI_CONTENTS_CREATION_v2', primaryBranch: 'master', forbiddenBranches: ['remote-version'] },
  { id: 'acap-remote', githubRepository: 'Kimjegyun/EBS_AI_CONTENTS_CREATION_REMOTE', primaryBranch: 'remote-version', forbiddenBranches: ['master'] },
];
for (const target of targets) {
  test(`${target.id}: destination ownership, renamed remotes, and version branches`, () => {
    const root = mkdtempSync(join(tmpdir(), 'development-target-'));
    try {
      mkdirSync(join(root, 'scripts'));
      writeFileSync(join(root, 'scripts/verify-development-target.mjs'), script);
      writeFileSync(join(root, 'development-target.json'), JSON.stringify({ ...target, defaultRemote: 'origin' }));
      const git = (...args) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe', windowsHide: true });
      git('init', '-b', target.primaryBranch);
      git('remote', 'add', 'origin', `https://github.com/${target.githubRepository}.git`);
      const run = (args = [], input = '') => spawnSync(process.execPath, [join(root, 'scripts/verify-development-target.mjs'), ...args], { input, encoding: 'utf8', windowsHide: true });
      assert.equal(run().status, 0);
      const correct = `https://github.com/${target.githubRepository}.git`;
      assert.equal(run(['--pre-push', 'renamed', correct]).status, 0);
      assert.equal(run(['--pre-push', 'ssh', `git@github.com:${target.githubRepository}.git`]).status, 0);
      for (const other of targets.filter(other => other.id !== target.id)) {
        assert.equal(run(['--pre-push', 'origin', `https://github.com/${other.githubRepository}.git`]).status, 1);
      }
      assert.equal(run(['--pre-push', 'origin', `https://github.com.attacker.invalid/${target.githubRepository}.git`]).status, 1);
      const forbidden = target.forbiddenBranches[0];
      assert.equal(run(['--pre-push', 'origin', correct], `refs/heads/${target.primaryBranch} ${'1'.repeat(40)} refs/heads/${forbidden} ${'0'.repeat(40)}\n`).status, 1);
      git('symbolic-ref', 'HEAD', `refs/heads/${forbidden}`);
      assert.equal(run().status, 1);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
