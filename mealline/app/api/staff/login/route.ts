import { NextRequest, NextResponse } from "next/server";
import { loginStaff, logoutStaff, STAFF_COOKIE } from "@/lib/auth";
import { z } from "zod";

const Body = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const token = await loginStaff(parsed.data.email, parsed.data.password);
  if (!token) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(STAFF_COOKIE, token, {
    httpOnly: true, sameSite: "strict", path: "/",
    maxAge: 12 * 3600, secure: process.env.NODE_ENV === "production",
  });
  return res;
}

export async function DELETE(req: NextRequest) {
  const token = req.cookies.get(STAFF_COOKIE)?.value;
  if (token) await logoutStaff(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(STAFF_COOKIE);
  return res;
}
