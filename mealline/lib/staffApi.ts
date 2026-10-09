import { NextRequest, NextResponse } from "next/server";
import { getStaffSession, STAFF_COOKIE, type StaffSession } from "@/lib/auth";

/** Cookie session + same-origin check for cookie-based staff mutations. */
export async function requireStaff(
  req: NextRequest, opts: { mutation?: boolean } = {}
): Promise<{ staff: StaffSession } | { error: NextResponse }> {
  const token = req.cookies.get(STAFF_COOKIE)?.value;
  const staff = await getStaffSession(token);
  if (!staff) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (opts.mutation) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");
    if (origin) {
      try {
        if (new URL(origin).host !== host) {
          return { error: NextResponse.json({ error: "csrf" }, { status: 403 }) };
        }
      } catch {
        return { error: NextResponse.json({ error: "csrf" }, { status: 403 }) };
      }
    }
  }
  return { staff };
}
