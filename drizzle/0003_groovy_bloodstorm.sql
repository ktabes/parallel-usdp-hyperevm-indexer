CREATE TABLE "vault_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"block_number" bigint NOT NULL,
	"block_hash" text NOT NULL,
	"block_timestamp" timestamp with time zone NOT NULL,
	"finalized" boolean NOT NULL,
	"usdp_total_supply" text NOT NULL,
	"susdp_total_assets" text NOT NULL,
	"susdp_actual_assets" text NOT NULL,
	"susdp_total_supply" text NOT NULL,
	"susdp_pending_yield" text NOT NULL,
	"susdp_share_price_usdp" text NOT NULL,
	"susdp_rate" text NOT NULL,
	"susdp_last_update" bigint NOT NULL,
	"susdp_estimated_apr" text NOT NULL,
	"susdp_max_rate" text NOT NULL,
	"susdp_pause_state" integer NOT NULL,
	"usdp_implementation" text NOT NULL,
	"susdp_implementation" text NOT NULL,
	"usdp_price_observation_id" bigint NOT NULL,
	"susdp_price_observation_id" bigint NOT NULL,
	"snapshot_status" text NOT NULL,
	"manifest_version" text NOT NULL,
	"calculation_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vault_snapshots_status_check" CHECK ("vault_snapshots"."snapshot_status" in ('candidate', 'verified', 'invalid')),
	CONSTRAINT "vault_snapshots_amounts_check" CHECK ("vault_snapshots"."usdp_total_supply" ~ '^[0-9]+$'
        and "vault_snapshots"."susdp_total_assets" ~ '^[0-9]+$'
        and "vault_snapshots"."susdp_actual_assets" ~ '^[0-9]+$'
        and "vault_snapshots"."susdp_total_supply" ~ '^[0-9]+$'
        and "vault_snapshots"."susdp_pending_yield" ~ '^[0-9]+$'
        and "vault_snapshots"."susdp_share_price_usdp" ~ '^[0-9]+$'
        and "vault_snapshots"."susdp_rate" ~ '^[0-9]+$'
        and "vault_snapshots"."susdp_estimated_apr" ~ '^[0-9]+$'
        and "vault_snapshots"."susdp_max_rate" ~ '^[0-9]+$'),
	CONSTRAINT "vault_snapshots_pause_check" CHECK ("vault_snapshots"."susdp_pause_state" between 0 and 255)
);
--> statement-breakpoint
CREATE TABLE "yield_aggregates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"start_snapshot_id" bigint NOT NULL,
	"end_snapshot_id" bigint NOT NULL,
	"from_block" bigint NOT NULL,
	"to_block" bigint NOT NULL,
	"accrued_interest" text NOT NULL,
	"pending_yield_at_start" text NOT NULL,
	"pending_yield_at_end" text NOT NULL,
	"native_ypo" text NOT NULL,
	"window_convention" text NOT NULL,
	"manifest_version" text NOT NULL,
	"calculation_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "yield_aggregates_range_check" CHECK ("yield_aggregates"."to_block" > "yield_aggregates"."from_block"),
	CONSTRAINT "yield_aggregates_amounts_check" CHECK ("yield_aggregates"."accrued_interest" ~ '^[0-9]+$'
        and "yield_aggregates"."pending_yield_at_start" ~ '^[0-9]+$'
        and "yield_aggregates"."pending_yield_at_end" ~ '^[0-9]+$'
        and "yield_aggregates"."native_ypo" ~ '^[0-9]+$')
);
--> statement-breakpoint
ALTER TABLE "vault_snapshots" ADD CONSTRAINT "vault_snapshots_usdp_price_observation_id_price_observations_id_fk" FOREIGN KEY ("usdp_price_observation_id") REFERENCES "public"."price_observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_snapshots" ADD CONSTRAINT "vault_snapshots_susdp_price_observation_id_price_observations_id_fk" FOREIGN KEY ("susdp_price_observation_id") REFERENCES "public"."price_observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yield_aggregates" ADD CONSTRAINT "yield_aggregates_start_snapshot_id_vault_snapshots_id_fk" FOREIGN KEY ("start_snapshot_id") REFERENCES "public"."vault_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yield_aggregates" ADD CONSTRAINT "yield_aggregates_end_snapshot_id_vault_snapshots_id_fk" FOREIGN KEY ("end_snapshot_id") REFERENCES "public"."vault_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vault_snapshots_provenance_block_unique" ON "vault_snapshots" USING btree ("chain_id","block_number","manifest_version","calculation_version");--> statement-breakpoint
CREATE INDEX "vault_snapshots_chain_block_idx" ON "vault_snapshots" USING btree ("chain_id","block_number");--> statement-breakpoint
CREATE UNIQUE INDEX "yield_aggregates_provenance_range_unique" ON "yield_aggregates" USING btree ("chain_id","from_block","to_block","manifest_version","calculation_version");--> statement-breakpoint
CREATE INDEX "yield_aggregates_chain_range_idx" ON "yield_aggregates" USING btree ("chain_id","from_block","to_block");