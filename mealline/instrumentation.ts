/** Retention runs even while the client-phone rollout flag is disabled. */
export async function register() {
  if(process.env.NEXT_RUNTIME!=='nodejs')return;
  const {purgePhoneText}=await import('./lib/phoneJobs');
  const purge=()=>purgePhoneText().catch(()=>console.error('[phone-retention] Deferred; database unavailable.'));
  await purge();
  setInterval(purge,3600000).unref();
}
