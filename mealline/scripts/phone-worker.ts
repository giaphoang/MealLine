/** Start only for an authorized pilot: npm run worker:phone. */
import { collectPhoneEvents,claimPhoneJobs,processPhoneJob,purgePhoneText } from '../lib/phoneJobs';
import { phoneEnabled } from '../lib/nourishPhone';
import { closeDb } from '../lib/db';

let stopping=false;
process.on('SIGINT',()=>{stopping=true;});
process.on('SIGTERM',()=>{stopping=true;});
async function main() {
  if (!phoneEnabled()) throw new Error('phone_feature_disabled');
  console.log('[phone-worker] Starting dedicated phone queue; legacy jobs excluded.');
  let ticks=0;
  while(!stopping){
    try {
      await collectPhoneEvents();
    } catch { console.error('[phone-worker] Event feed unavailable; cursor preserved.'); }
    try {
      for(const job of await claimPhoneJobs()) { if(stopping)break;await processPhoneJob(job); }
      if(ticks++%240===0)await purgePhoneText();
    } catch { console.error('[phone-worker] Tick failed; leases remain recoverable.'); }
    if(!stopping)await new Promise(resolve=>setTimeout(resolve,15000));
  }
  await closeDb();
}
main().catch(async()=>{console.error('[phone-worker] Not started; check feature flag and private configuration.');await closeDb();process.exitCode=1;});
