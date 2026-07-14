import { migrate } from "drizzle-orm/node-postgres/migrator";
import { parseRuntimeEnv } from "@/config/env";
import { createDatabase } from "./client";

async function main() {
  const env = parseRuntimeEnv(process.env);
  const { db, pool } = createDatabase(env);

  try {
    await migrate(db, { migrationsFolder: "drizzle" });
    console.log("Database migrations completed.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
