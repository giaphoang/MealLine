/** Reproducible build; native compiler cache stays in the private workspace. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {rootDir,stateDir} from './environment.mjs';
const nativeCache=process.env.SWC_NATIVE_BINDING_CACHE||path.join(stateDir,'cache/swc');
await fs.mkdir(nativeCache,{recursive:true,mode:0o700});
const env={...process.env,SWC_NATIVE_BINDING_CACHE:nativeCache};
async function run(program,args) {
  await new Promise((resolve,reject)=>{
    const child=spawn(program,args,{cwd:rootDir,env,stdio:'inherit'});
    child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Build step failed ('+code+').')));
  });
}
for(const step of [
  ['npm',['run','build','--workspace','packages/core']],
  [process.execPath,['scripts/generate-client.mjs']],
  ['npm',['run','build','--workspace','vendor/feed/packages/backend']],
  [process.execPath,['scripts/prepare-assets.mjs']],
  ['npm',['run','build','--workspace','vendor/feed/packages/frontend']],
  [process.execPath,['scripts/package-source.mjs']],
])await run(...step);
