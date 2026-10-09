/** Prepare private configuration; never enables the feature or sends anything. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';
import {rootDir,readState,ensureState,backendEnvironment} from './environment.mjs';

export function validPhoneApiUrl(value) {
  try {
    const url=new URL(value);
    return !url.username&&!url.password&&!url.search&&!url.hash&&['','/'].includes(url.pathname)
      && (url.protocol==='https:' || (url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)));
  } catch {return false;}
}
export function preparedPhoneEnvironment(source,secret,apiUrl) {
  const values=dotenv.parse(source);
  if(secret.length<32)throw new Error('The private agent service key must have at least 32 characters.');
  if(values.NOURISH_AGENT_API_TOKEN && values.NOURISH_AGENT_API_TOKEN!==secret)
    throw new Error('The phone app agent service key differs from the MealLine staff workspace. Reconcile it explicitly; no keys were overwritten.');
  if(values.NOURISH_VOICE_API_TOKEN===secret)throw new Error('Use a separate key for client access, not the ingestion-only voice token.');
  if(!validPhoneApiUrl(values.NOURISH_API_URL||apiUrl))throw new Error('NOURISH_API_URL must be an HTTPS origin or a local HTTP origin, without credentials or a path.');
  const added=[];
  for(const [name,value] of Object.entries({NOURISH_AGENT_API_TOKEN:secret,NOURISH_API_URL:apiUrl,NOURISH_CLIENT_PHONE_ENABLED:'false'})) {
    if(!values[name])added.push(name+'='+value);
  }
  return source+(added.length?(source.endsWith('\n')?'':'\n')+'\n# Private client-phone connection; activation requires a separate approved pilot.\n'+added.join('\n')+'\n':'');
}
async function main() {
  const envFile=path.join(rootDir,'mealline/.env');
  const source=await fs.readFile(envFile,'utf8');
  const values=dotenv.parse(source);
  if(process.argv.includes('--check')) {
    const state=readState(),key=process.env.NOURISH_AGENT_API_TOKEN||state.agentToken||'';
    const checks={
      'Private service keys match':key.length>=32&&values.NOURISH_AGENT_API_TOKEN===key,
      'Agent key is separate from ingestion token':key.length>=32&&key!==(process.env.NOURISH_VOICE_API_TOKEN||state.voiceToken)&&key!==values.NOURISH_VOICE_API_TOKEN,
      'Staff API origin is valid':validPhoneApiUrl(values.NOURISH_API_URL||''),
      'Twilio Verify Service SID is configured':/^VA[0-9a-f]{32}$/i.test(values.TWILIO_VERIFY_SERVICE_SID||''),
      'Twilio calling/SMS credentials are configured':Boolean(values.TWILIO_ACCOUNT_SID&&values.TWILIO_AUTH_TOKEN&&values.TWILIO_FROM_NUMBER),
      'Public voice URL is stable HTTPS':/^https:\/\//.test(values.PUBLIC_BASE_URL||'')&&!/\.trycloudflare\.com(?:\/|$)/.test(values.PUBLIC_BASE_URL||''),
    };
    for(const [name,okay] of Object.entries(checks))console.log(`${okay?'PASS':'NEEDS SETUP'}: ${name}`);
    console.log(`Rollout flags: staff backend ${process.env.NOURISH_CLIENT_PHONE_ENABLED==='true'?'ON':'OFF'}, phone app ${values.NOURISH_CLIENT_PHONE_ENABLED==='true'?'ON':'OFF'}.`);
    console.log('Before pilot activation: confirm a real staffed transfer number, fluent-language prompt review, backups and process supervision. This check sends no calls, texts or client commands.');
    process.exitCode=Object.values(checks).every(Boolean)?0:2;return;
  }
  const state=ensureState(),env=backendEnvironment('development',state);
  if(env.NOURISH_AGENT_API_TOKEN===env.NOURISH_VOICE_API_TOKEN)throw new Error('MealLine client access requires a separate agent service key.');
  const updated=preparedPhoneEnvironment(source,env.NOURISH_AGENT_API_TOKEN,`http://127.0.0.1:${env.PORT}`);
  if(updated!==source) {
    const backupDir=await fs.mkdtemp(path.join(os.tmpdir(),'nourish-phone-env-'));await fs.chmod(backupDir,0o700);
    await fs.writeFile(path.join(backupDir,'mealline.env.before'),source,{mode:0o600});
    await fs.writeFile(envFile,updated,{mode:0o600});await fs.chmod(envFile,0o600);
    console.log('Private MealLine connection prepared. Environment backup: '+backupDir);
  } else console.log('Private MealLine connection already matches; no environment values changed.');
  console.log('No provider credentials changed. No worker started. The rollout flag is not enabled by this command. Restart services to load the private configuration.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{
  console.error(error instanceof Error?error.message:'Private phone configuration failed.');process.exitCode=1;
});
