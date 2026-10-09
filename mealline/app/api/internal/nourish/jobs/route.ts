import { timingSafeEqual } from 'node:crypto';
import { NextRequest,NextResponse } from 'next/server';
import { phoneJobSummaries,retryPhoneJob } from '@/lib/phoneJobs';

function authorized(req:NextRequest) {
  const expected=process.env.NOURISH_AGENT_API_TOKEN ?? '',supplied=req.headers.get('x-nourish-agent-token') ?? '';
  return expected.length>=32 && Buffer.byteLength(supplied)===Buffer.byteLength(expected)
    && timingSafeEqual(Buffer.from(supplied),Buffer.from(expected));
}
export async function GET(req:NextRequest) {
  if(!authorized(req))return NextResponse.json({error:'unauthorized'},{status:401});
  try{return NextResponse.json({jobs:await phoneJobSummaries()},{headers:{'Cache-Control':'no-store'}});}
  catch{return NextResponse.json({error:'queue_unavailable'},{status:503});}
}
export async function POST(req:NextRequest) {
  if(!authorized(req))return NextResponse.json({error:'unauthorized'},{status:401});
  const body=await req.json().catch(()=>null);
  if(!body || typeof body.id!=='string' || body.id.length>160 || Object.keys(body).length!==1)
    return NextResponse.json({error:'invalid_job'},{status:400});
  try{await retryPhoneJob(body.id);return NextResponse.json({queued:true});}
  catch{return NextResponse.json({error:'job_not_retryable'},{status:409});}
}
