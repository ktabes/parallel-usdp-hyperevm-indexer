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

  it("adds idempotent coverage and one-to-one decoded event storage", async () => {
    const migration = await readFile("drizzle/0001_bent_lilandra.sql", "utf8");
    expect(migration).toContain('CREATE TABLE "indexer_coverage"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "indexer_coverage_scope_range_unique"',
    );
    expect(migration).toContain('CREATE TABLE "protocol_events"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "protocol_events_raw_log_unique"',
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
