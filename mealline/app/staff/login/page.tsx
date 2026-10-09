"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StaffLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await fetch("/api/staff/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);
    if (res.ok) router.push("/staff");
    else setError("Sign-in failed. Check your email and password.");
  }

  return (
    <>
      <h1>Staff sign-in</h1>
      <div className="card">
        {error && <div className="alert" role="alert">{error}</div>}
        <form onSubmit={submit}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email}
            onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password}
            onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <p className="muted">
          Demo accounts: <span className="mono">coordinator@demo.local</span> (can approve) and{" "}
          <span className="mono">staff@demo.local</span> (view, claim, record outcomes).
        </p>
      </div>
    </>
  );
}
