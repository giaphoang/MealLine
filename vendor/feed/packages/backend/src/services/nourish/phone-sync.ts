/** Authenticated staff visibility into the separate, private MealLine queue. */
import { operationError } from './index';
export async function phoneSyncJobs(retryId?:string) {
  const secret=process.env.NOURISH_AGENT_API_TOKEN ?? '';
  const base=process.env.NOURISH_MEALLINE_URL ?? 'http://127.0.0.1:3000';
  let url:URL;
  try {url=new URL(base);} catch {throw operationError('Private MealLine connection is not configured.',503);}
  if(secret.length<32 || url.protocol!=='http:' || !['127.0.0.1','localhost','[::1]'].includes(url.hostname)
    || url.username || url.password || url.search || url.hash || url.pathname!=='/') throw operationError('Private MealLine connection is not configured.',503);
  try {
    const response=await fetch(base.replace(/\/$/,'')+'/api/internal/nourish/jobs',{method:retryId?'POST':'GET',redirect:'error',
      headers:{'content-type':'application/json','x-nourish-agent-token':secret},signal:AbortSignal.timeout(3000),body:retryId?JSON.stringify({id:retryId}):undefined});
    if(!response.ok){await response.body?.cancel();throw operationError('MealLine phone queue is not reachable or this job requires manual review.',response.status===409?409:503);}
    return await response.json();
  } catch(error) {
    if(error instanceof Error && 'statusCode' in error)throw error;
    throw operationError('MealLine phone queue is unavailable. Saved jobs remain in MealLine.',503);
  }
}
