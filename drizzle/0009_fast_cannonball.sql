CREATE TABLE "global_usdp_supply_snapshot_components" (
	"global_snapshot_id" bigint NOT NULL,
	"asset_snapshot_id" bigint NOT NULL,
	"chain_id" integer NOT NULL,
	"included" boolean NOT NULL,
	"exclusion_reason" text,
	CONSTRAINT "global_usdp_supply_snapshot_components_global_snapshot_id_asset_snapshot_id_pk" PRIMARY KEY("global_snapshot_id","asset_snapshot_id"),
	CONSTRAINT "global_usdp_supply_component_reason_check" CHECK (("global_usdp_supply_snapshot_components"."included" and "global_usdp_supply_snapshot_components"."exclusion_reason" is null)
        or (not "global_usdp_supply_snapshot_components"."included" and "global_usdp_supply_snapshot_components"."exclusion_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "global_usdp_supply_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"expected_chain_count" integer NOT NULL,
	"included_chain_count" integer NOT NULL,
	"coverage_status" text NOT NULL,
	"accounting_status" text NOT NULL,
	"candidate_total_supply" text NOT NULL,
	"verified_total_supply" text,
	"oldest_component_timestamp" timestamp with time zone,
	"newest_component_timestamp" timestamp with time zone,
	"maximum_component_age_seconds" bigint,
	"component_skew_seconds" bigint,
	"alignment_maximum_skew_seconds" integer NOT NULL,
	"included_chain_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_chain_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stale_chain_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"failed_chain_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"manifest_version" text NOT NULL,
	"calculation_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "global_usdp_supply_coverage_check" CHECK ("global_usdp_supply_snapshots"."coverage_status" in ('complete', 'partial', 'unavailable')),
	CONSTRAINT "global_usdp_supply_accounting_check" CHECK ("global_usdp_supply_snapshots"."accounting_status" in ('candidate', 'verified')),
	CONSTRAINT "global_usdp_supply_counts_check" CHECK ("global_usdp_supply_snapshots"."expected_chain_count" >= 0
        and "global_usdp_supply_snapshots"."included_chain_count" >= 0
        and "global_usdp_supply_snapshots"."included_chain_count" <= "global_usdp_supply_snapshots"."expected_chain_count"),
	CONSTRAINT "global_usdp_supply_amounts_check" CHECK ("global_usdp_supply_snapshots"."candidate_total_supply" ~ '^[0-9]+$'
        and ("global_usdp_supply_snapshots"."verified_total_supply" is null
          or "global_usdp_supply_snapshots"."verified_total_supply" ~ '^[0-9]+$'))
);
--> statement-breakpoint
CREATE TABLE "usdp_supply_snapshot_evidence" (
	"asset_snapshot_id" bigint PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"observed_name" text NOT NULL,
	"observed_symbol" text NOT NULL,
	"observed_decimals" integer NOT NULL,
	"metadata_verified" boolean NOT NULL,
	"finality_mode" text NOT NULL,
	"rpc_source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usdp_supply_evidence_code_hash_check" CHECK ("usdp_supply_snapshot_evidence"."code_hash" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "usdp_supply_evidence_decimals_check" CHECK ("usdp_supply_snapshot_evidence"."observed_decimals" between 0 and 255),
	CONSTRAINT "usdp_supply_evidence_finality_check" CHECK ("usdp_supply_snapshot_evidence"."finality_mode" in ('rpc-finalized', 'confirmation-lag', 'confirmation-lag-fallback')),
	CONSTRAINT "usdp_supply_evidence_rpc_source_check" CHECK ("usdp_supply_snapshot_evidence"."rpc_source" in ('chain-override', 'savings-chain-override', 'public-default'))
);
--> statement-breakpoint
ALTER TABLE "global_usdp_supply_snapshot_components" ADD CONSTRAINT "global_usdp_supply_snapshot_components_global_snapshot_id_global_usdp_supply_snapshots_id_fk" FOREIGN KEY ("global_snapshot_id") REFERENCES "public"."global_usdp_supply_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_usdp_supply_snapshot_components" ADD CONSTRAINT "global_usdp_supply_snapshot_components_asset_snapshot_id_asset_chain_snapshots_id_fk" FOREIGN KEY ("asset_snapshot_id") REFERENCES "public"."asset_chain_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usdp_supply_snapshot_evidence" ADD CONSTRAINT "usdp_supply_snapshot_evidence_asset_snapshot_id_asset_chain_snapshots_id_fk" FOREIGN KEY ("asset_snapshot_id") REFERENCES "public"."asset_chain_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "global_usdp_supply_components_chain_unique" ON "global_usdp_supply_snapshot_components" USING btree ("global_snapshot_id","chain_id");--> statement-breakpoint
CREATE INDEX "global_usdp_supply_as_of_idx" ON "global_usdp_supply_snapshots" USING btree ("as_of");