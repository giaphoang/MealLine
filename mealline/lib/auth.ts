/**
 * Staff authentication: scrypt password hashes, opaque session tokens
 * (hashed at rest), cookie sessions, org + role on every request.
 */
import { db } from "./db";
import { newId, newToken, hashToken, verifyPassword } from "./ids";
import type { StaffRole } from "./types";

export interface StaffSession {
  staffId: string;
  orgId: string;
  role: StaffRole;
  name: string;
  email: string;
}

const SESSION_TTL_MS = 12 * 3600 * 1000;

export async function loginStaff(email: string, password: string): Promise<string | null> {
  const r = await db().query(
    `SELECT id, org_id, password_hash FROM staff_users WHERE lower(email) = lower($1)`,
    [email.trim()]
  );
  if (!r.rows.length) return null;
  const row = r.rows[0] as { id: string; org_id: string; password_hash: string };
  if (!verifyPassword(password, row.password_hash)) return null;
  const token = newToken();
  await db().query(
    `INSERT INTO staff_sessions (id, token_hash, staff_user_id, expires_at)
     VALUES ($1,$2,$3,$4)`,
    [newId("sess"), hashToken(token), row.id,
     new Date(Date.now() + SESSION_TTL_MS).toISOString()]
  );
  return token;
}

export async function getStaffSession(token: string | undefined | null): Promise<StaffSession | null> {
  if (!token) return null;
  const r = await db().query(
    `SELECT u.id AS staff_id, u.org_id, u.role, u.name, u.email
     FROM staff_sessions s JOIN staff_users u ON u.id = s.staff_user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)]
  );
  if (!r.rows.length) return null;
  const row = r.rows[0] as {
    staff_id: string; org_id: string; role: StaffRole; name: string; email: string;
  };
  return {
    staffId: row.staff_id, orgId: row.org_id,
    role: row.role, name: row.name, email: row.email,
  };
}

export async function logoutStaff(token: string): Promise<void> {
  await db().query(`DELETE FROM staff_sessions WHERE token_hash = $1`, [hashToken(token)]);
}

export const STAFF_COOKIE = "ml_staff";
