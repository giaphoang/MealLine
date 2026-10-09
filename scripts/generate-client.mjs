import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const taskRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const child = spawn(process.execPath, [path.join(taskRoot, 'node_modules/prisma/build/index.js'), 'generate', '--schema', path.join(taskRoot, 'vendor/feed/packages/backend/prisma/schema.prisma')], {
  cwd: taskRoot,
  env: { ...process.env, DATABASE_URL: process.env.FEED_DATABASE_URL || `file:${path.join(taskRoot, '.nourish/feed.db')}` },
  stdio: 'inherit',
});
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
