"use client";

import { signIn } from "next-auth/react";

export default function SignInPage() {
  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Sign in</h1>
      <p>Use your provider to continue.</p>
      <button
        type="button"
        onClick={() => signIn("github")}
        style={{ marginTop: "1rem" }}
      >
        Sign in with GitHub
      </button>
    </main>
  );
}
