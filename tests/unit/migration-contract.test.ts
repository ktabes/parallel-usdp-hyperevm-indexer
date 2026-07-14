import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("initial migration contract", () => {
  it("preserves the immutable raw-log identity and block anchor", async () => {
    const migration = await readFile(
      "drizzle/0000_quiet_steve_rogers.sql",
      "utf8",
    );

    expect(migration).toContain(
      'CREATE UNIQUE INDEX "raw_logs_chain_tx_log_unique" ON "raw_logs" USING btree ("chain_id","transaction_hash","log_index")',
    );
    expect(migration).toContain(
      'CONSTRAINT "raw_logs_block_fk" FOREIGN KEY ("chain_id","block_number") REFERENCES "public"."blocks"("chain_id","number")',
    );
  });

  it("keeps manifest status fail-closed", async () => {
    const migration = await readFile(
      "drizzle/0000_quiet_steve_rogers.sql",
      "utf8",
    );

    expect(migration).toContain(
      "contract_manifests_status_check\" CHECK (\"contract_manifests\".\"status\" in ('candidate', 'approved', 'superseded'))",
    );
  });
});
