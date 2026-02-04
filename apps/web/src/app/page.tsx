"use client";

import { signIn, signOut, useSession } from "next-auth/react";

export default function HomePage() {
  const { data: session } = useSession();

  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Creator Studio</h1>
      <p>Live classes with MediaSoup, NextAuth, and Socket.IO.</p>
      <div style={{ marginTop: "1rem" }}>
        {session?.user ? (
          <>
            <p>Signed in as {session.user.email ?? session.user.name}.</p>
            <button type="button" onClick={() => signOut()}>
              Sign out
            </button>
          </>
        ) : (
          <button type="button" onClick={() => signIn("github")}>
            Sign in
          </button>
        )}
      </div>
    </main>
  );
}
