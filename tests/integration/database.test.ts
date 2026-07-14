import { Client } from "pg";
import { describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationTest = databaseUrl ? it : it.skip;

describe("PostgreSQL connectivity", () => {
  integrationTest(
    "connects within the explicit integration timeout",
    async () => {
      const client = new Client({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 15_000,
      });
      await client.connect();

      try {
        const result = await client.query<{ value: number }>(
          "select 1::int as value",
        );
        expect(result.rows[0]?.value).toBe(1);
      } finally {
        await client.end();
      }
    },
    20_000,
  );
});
