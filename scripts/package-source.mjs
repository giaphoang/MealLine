import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const taskRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(taskRoot, '.nourish/source');
await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
const sources = ['package.json', 'package-lock.json', 'setup.sh', '.env.example', '.gitignore', 'README.md', 'THIRD_PARTY_NOTICES.md', 'LICENSE', 'packages', 'scripts', 'db', 'docs', 'legacy', 'vendor/feed'];
sources.push('mealline/package.json','mealline/package-lock.json','mealline/next.config.ts','mealline/next-env.d.ts','mealline/tsconfig.json',
  'mealline/.env.example','mealline/README.md','mealline/app','mealline/lib','mealline/db/migrations','mealline/scripts','mealline/tests','mealline/voice_agent');
const args = ['--exclude=*/node_modules','--exclude=*/dist','--exclude=*/.next','--exclude=*/.venv','--exclude=*/__pycache__','--exclude=*/.pytest_cache',
  '--exclude=*.pyc','--exclude=*.tsbuildinfo','--exclude=*.db','--exclude=*.db-wal','--exclude=*.db-shm','--exclude=*.log',
  '--exclude=*/.env','--exclude=*/.env.local','--exclude=*/.env.production','--exclude=*/.env.development','--exclude=*/.env.test','--exclude=*/.env.*.local',
  '--exclude=*/.env.backup*','--exclude=*/.env.before*','--exclude=*/backups','-czf',path.join(outputDir,'mealline-source.tar.gz'),...sources];
await new Promise((resolve, reject) => {
  const child = spawn('tar', args, { cwd: taskRoot, stdio: 'inherit' });
  child.on('error', reject);
  child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Source packaging failed (${code}).`)));
});
