// Smoke test for templates/software/project/webhook/server.mjs: starts the recipe
// with a stub `studio` on PATH and checks the signed, unsigned and unmapped paths.
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';

const SECRET = 'test-secret';
const PORT = 8799;
const server = resolve('templates/software/project/webhook/server.mjs');

const dir = await mkdtemp(join(tmpdir(), 'webhook-smoke-'));
const calls = join(dir, 'calls.txt');
await writeFile(join(dir, 'studio'), `#!/bin/sh\nprintf '%s\\n' "$*" >> "${calls}"\n`);
await chmod(join(dir, 'studio'), 0o755);

const child = spawn('node', [server], {
  env: {
    ...process.env,
    PATH: `${dir}:${process.env.PATH}`,
    WEBHOOK_SECRET: SECRET,
    WEBHOOK_PIPELINE: 'demo',
    WEBHOOK_INPUT_FIELD: 'issue.title',
    PORT: String(PORT),
  },
  stdio: 'inherit',
});

const post = (body, signature) =>
  fetch(`http://127.0.0.1:${PORT}/`, {
    method: 'POST',
    body,
    headers: signature ? { 'x-hub-signature-256': signature } : {},
  });
const sign = (body) => `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;

try {
  for (let i = 0; ; i++) {
    try {
      await post('{}');
      break;
    } catch (error) {
      if (i === 50) throw error;
      await sleep(100);
    }
  }

  const good = JSON.stringify({ issue: { title: 'fix the bug' } });
  assert.equal((await post(good, sign(good))).status, 202);
  assert.equal((await post(good, sign('tampered'))).status, 401);
  assert.equal((await post(good)).status, 401);
  const unmapped = JSON.stringify({ other: 1 });
  assert.equal((await post(unmapped, sign(unmapped))).status, 422);

  await sleep(500);
  assert.equal((await readFile(calls, 'utf8')).trim(), 'run demo --input fix the bug');
  console.log('webhook smoke test passed');
} finally {
  child.kill();
}
