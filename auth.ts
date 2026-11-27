// Auth.js v5 config. Google + GitHub OAuth, JWT sessions (no DB read per
// request); the Drizzle adapter persists users/accounts in Neon when
// DATABASE_URL is set. `session.user.id` is our user id (user.id in Postgres).
//
// Env: AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_GITHUB_ID,
// AUTH_GITHUB_SECRET (Auth.js reads the AUTH_<PROVIDER>_* names automatically).

import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb, hasDb, schema } from "@/lib/server/db";

declare module "next-auth" {
  interface Session {
    user: { id: string; name?: string | null; email?: string | null; image?: string | null };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: hasDb()
    ? DrizzleAdapter(getDb(), {
        usersTable: schema.users,
        accountsTable: schema.accounts,
        sessionsTable: schema.sessions,
        verificationTokensTable: schema.verificationTokens,
      })
    : undefined,
  providers: [Google, GitHub],
  session: { strategy: "jwt" },
  trustHost: true,
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      const uid = (token.uid as string | undefined) ?? token.sub;
      if (uid) session.user.id = uid;
      return session;
    },
  },
}));

/** The signed-in user's id, or null. Never throws (a broken auth config reads as signed-out). */
export async function currentUserId(): Promise<string | null> {
  try {
    const session = await auth();
    return session?.user?.id ?? null;
  } catch (err) {
    console.error("[auth] session lookup failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
