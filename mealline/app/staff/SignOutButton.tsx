"use client";

export default function SignOutButton() {
  return (
    <button
      type="button"
      className="secondary"
      style={{ padding: ".3rem .8rem", fontSize: ".9rem" }}
      onClick={() => fetch("/api/staff/login", { method: "DELETE" })
        .then(() => { window.location.href = "/staff/login"; })}
    >
      Sign out
    </button>
  );
}
