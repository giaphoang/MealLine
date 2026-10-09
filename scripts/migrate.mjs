import path from 'node:path';
import { spawn } from 'node:child_process';
import { rootDir, backendDir, ensureState, backendEnvironment } from './environment.mjs';

const env = backendEnvironment('development', ensureState());
const args = [path.join(rootDir, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', path.join(backendDir, 'prisma/schema.prisma')];
const child = spawn(process.execPath, args, { cwd: backendDir, env, stdio: 'inherit' });
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
