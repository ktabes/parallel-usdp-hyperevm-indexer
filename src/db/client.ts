import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { RuntimeEnv } from "@/config/env";
import * as schema from "./schema";

export function createDatabase(env: Pick<RuntimeEnv, "DATABASE_URL">) {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 15_000,
    max: 10,
  });

  return {
    db: drizzle(pool, { schema }),
    pool,
  };
}
