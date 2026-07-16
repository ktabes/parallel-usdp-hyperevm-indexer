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

  it("adds provenance-bound Phase 3 events and exact flow aggregates", async () => {
    const migration = await readFile("drizzle/0002_lethal_umar.sql", "utf8");

    expect(migration).toContain('CREATE TABLE "economic_events"');
    expect(migration).toContain('CREATE TABLE "flow_aggregates"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "economic_events_protocol_event_unique"',
    );
    expect(migration).toContain('"source_from_block" bigint NOT NULL');
    expect(migration).toContain('"manifest_version" text NOT NULL');
    expect(migration).toContain('"calculation_version" text NOT NULL');
  });

  it("adds finalized vault snapshots and provenance-bound YPO intervals", async () => {
    const migration = await readFile(
      "drizzle/0003_groovy_bloodstorm.sql",
      "utf8",
    );

    expect(migration).toContain('CREATE TABLE "vault_snapshots"');
    expect(migration).toContain('CREATE TABLE "yield_aggregates"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "vault_snapshots_provenance_block_unique"',
    );
    expect(migration).toContain('CONSTRAINT "yield_aggregates_range_check"');
    expect(migration).toContain('"pending_yield_at_start" text NOT NULL');
    expect(migration).toContain('"pending_yield_at_end" text NOT NULL');
    expect(migration).toContain('"window_convention" text NOT NULL');
  });

  it("adds normalized chain snapshots and component-linked global savings state", async () => {
    const migration = await readFile(
      "drizzle/0004_spooky_stellaris.sql",
      "utf8",
    );

    expect(migration).toContain('CREATE TABLE "asset_deployments"');
    expect(migration).toContain('CREATE TABLE "asset_chain_snapshots"');
    expect(migration).toContain('CREATE TABLE "savings_chain_snapshots"');
    expect(migration).toContain('CREATE TABLE "global_savings_snapshots"');
    expect(migration).toContain(
      'CREATE TABLE "global_savings_snapshot_components"',
    );
    expect(migration).toContain(
      'CONSTRAINT "asset_chain_snapshots_deployment_fk"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "global_savings_components_chain_unique"',
    );
  });

  it("adds normalized chain and component-linked global YPO intervals", async () => {
    const migration = await readFile(
      "drizzle/0005_lively_roxanne_simpson.sql",
      "utf8",
    );

    expect(migration).toContain('CREATE TABLE "savings_yield_aggregates"');
    expect(migration).toContain(
      'CREATE TABLE "global_savings_yield_aggregates"',
    );
    expect(migration).toContain(
      'CREATE TABLE "global_savings_yield_components"',
    );
    expect(migration).toContain('CONSTRAINT "savings_yield_range_check"');
    expect(migration).toContain('"coverage_scope" text NOT NULL');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "global_savings_yield_component_chain_unique"',
    );
  });

  it("persists auditable asset deployment boundaries", async () => {
    const migration = await readFile("drizzle/0006_cooing_maestro.sql", "utf8");

    expect(migration).toContain('ADD COLUMN "deployment_block" bigint');
    expect(migration).toContain('ADD COLUMN "deployment_block_source" text');
    expect(migration).toContain(
      'CONSTRAINT "asset_deployments_block_source_check"',
    );
  });
});
