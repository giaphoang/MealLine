import { randomBytes, createHash, scryptSync, timingSafeEqual } from "node:crypto";

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

/** High-entropy token for status links / draft sessions. Returned raw once. */
export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const dk = scryptSync(password, salt, 32).toString("hex");
  return `scrypt:${salt}:${dk}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [alg, salt, dk] = stored.split(":");
  if (alg !== "scrypt" || !salt || !dk) return false;
  const check = scryptSync(password, salt, 32).toString("hex");
  const a = Buffer.from(check, "hex");
  const b = Buffer.from(dk, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
