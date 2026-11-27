// Neon serverless (HTTP) Drizzle client. Lazily created so importing this
// module never throws when DATABASE_URL is unset (local dev without a DB,
// unit tests). Callers that need the DB should check `hasDb()` first.

import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type Db = NeonHttpDatabase<typeof schema>;

let cached: Db | null = null;

export function hasDb(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getDb(): Db {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  cached = drizzle(neon(url), { schema });
  return cached;
}

export { schema };
