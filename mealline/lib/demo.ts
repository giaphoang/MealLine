import { db } from "./db";

export interface DemoContext {
  orgId: string;
  providerId: string;
  transferNumber: string;
  providerPhone: string;
}

let cached: DemoContext | null = null;

export async function demoContext(): Promise<DemoContext> {
  if (cached) return cached;
  const r = await db().query(
    `SELECT o.id AS org_id, p.id AS provider_id, p.transfer_number, p.phone_number
     FROM organizations o JOIN service_providers p ON p.org_id = o.id
     WHERE o.slug = 'demo-pantry' LIMIT 1`
  );
  if (!r.rows.length) throw new Error("demo_seed_missing: run npm run seed");
  const row = r.rows[0] as {
    org_id: string; provider_id: string; transfer_number: string; phone_number: string;
  };
  cached = {
    orgId: row.org_id, providerId: row.provider_id,
    transferNumber: row.transfer_number, providerPhone: row.phone_number,
  };
  return cached;
}

/** Simple in-memory per-IP rate limiter for intake endpoints. */
const hits = new Map<string, number[]>();
export function checkRateLimit(ip: string, limit = 40, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) return false;
  arr.push(now);
  hits.set(ip, arr);
  return true;
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? headers.get("x-real-ip") ?? "unknown";
}
