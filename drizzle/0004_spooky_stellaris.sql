CREATE TABLE "asset_chain_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"chain_id" integer NOT NULL,
	"block_number" bigint NOT NULL,
	"block_hash" text NOT NULL,
	"block_timestamp" timestamp with time zone NOT NULL,
	"finalized" boolean NOT NULL,
	"total_supply" text NOT NULL,
	"snapshot_status" text NOT NULL,
	"manifest_version" text NOT NULL,
	"calculation_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_chain_snapshots_status_check" CHECK ("asset_chain_snapshots"."snapshot_status" in ('candidate', 'verified', 'invalid')),
	CONSTRAINT "asset_chain_snapshots_supply_check" CHECK ("asset_chain_snapshots"."total_supply" ~ '^[0-9]+$')
);
--> statement-breakpoint
CREATE TABLE "asset_deployments" (
	"asset_id" text NOT NULL,
	"chain_id" integer NOT NULL,
	"chain_slug" text NOT NULL,
	"chain_name" text NOT NULL,
	"contract_address" text NOT NULL,
	"deployment_tier" text NOT NULL,
	"adapter_status" text NOT NULL,
	"official_source" text NOT NULL,
	"source_checked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_deployments_asset_id_chain_id_pk" PRIMARY KEY("asset_id","chain_id"),
	CONSTRAINT "asset_deployments_asset_check" CHECK ("asset_deployments"."asset_id" in ('usdp', 'susdp')),
	CONSTRAINT "asset_deployments_tier_check" CHECK ("asset_deployments"."deployment_tier" in ('savings', 'distribution')),
	CONSTRAINT "asset_deployments_status_check" CHECK ("asset_deployments"."adapter_status" in ('planned', 'verified', 'disabled')),
	CONSTRAINT "asset_deployments_address_check" CHECK ("asset_deployments"."contract_address" ~ '^0x[0-9a-f]{40}$')
);
--> statement-breakpoint
CREATE TABLE "global_savings_snapshot_components" (
	"global_snapshot_id" bigint NOT NULL,
	"savings_snapshot_id" bigint NOT NULL,
	"chain_id" integer NOT NULL,
	CONSTRAINT "global_savings_snapshot_components_global_snapshot_id_savings_snapshot_id_pk" PRIMARY KEY("global_snapshot_id","savings_snapshot_id")
);
--> statement-breakpoint
CREATE TABLE "global_savings_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"expected_chain_count" integer NOT NULL,
	"included_chain_count" integer NOT NULL,
	"coverage_status" text NOT NULL,
	"usdp_supply_on_savings_chains" text NOT NULL,
	"susdp_total_assets" text NOT NULL,
	"susdp_total_supply" text NOT NULL,
	"susdp_weighted_estimated_apy" text,
	"oldest_component_timestamp" timestamp with time zone,
	"newest_component_timestamp" timestamp with time zone,
	"maximum_component_age_seconds" bigint,
	"included_chain_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_chain_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stale_chain_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"calculation_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "global_savings_snapshots_status_check" CHECK ("global_savings_snapshots"."coverage_status" in ('complete', 'partial', 'unavailable')),
	CONSTRAINT "global_savings_snapshots_counts_check" CHECK ("global_savings_snapshots"."expected_chain_count" >= 0
        and "global_savings_snapshots"."included_chain_count" >= 0
        and "global_savings_snapshots"."included_chain_count" <= "global_savings_snapshots"."expected_chain_count"),
	CONSTRAINT "global_savings_snapshots_amounts_check" CHECK ("global_savings_snapshots"."usdp_supply_on_savings_chains" ~ '^[0-9]+$'
        and "global_savings_snapshots"."susdp_total_assets" ~ '^[0-9]+$'
        and "global_savings_snapshots"."susdp_total_supply" ~ '^[0-9]+$'
        and ("global_savings_snapshots"."susdp_weighted_estimated_apy" is null
          or "global_savings_snapshots"."susdp_weighted_estimated_apy" ~ '^[0-9]+$'))
);
--> statement-breakpoint
CREATE TABLE "savings_chain_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"block_number" bigint NOT NULL,
	"block_hash" text NOT NULL,
	"block_timestamp" timestamp with time zone NOT NULL,
	"usdp_snapshot_id" bigint NOT NULL,
	"susdp_snapshot_id" bigint NOT NULL,
	"susdp_total_assets" text NOT NULL,
	"susdp_actual_assets" text NOT NULL,
	"susdp_pending_yield" text NOT NULL,
	"susdp_share_price_usdp" text NOT NULL,
	"susdp_rate" text NOT NULL,
	"susdp_last_update" bigint NOT NULL,
	"susdp_estimated_apy" text NOT NULL,
	"susdp_max_rate" text NOT NULL,
	"susdp_pause_state" integer NOT NULL,
	"usdp_implementation" text NOT NULL,
	"susdp_implementation" text NOT NULL,
	"asset_relationship_verified" boolean NOT NULL,
	"snapshot_status" text NOT NULL,
	"manifest_version" text NOT NULL,
	"calculation_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_chain_snapshots_status_check" CHECK ("savings_chain_snapshots"."snapshot_status" in ('candidate', 'verified', 'invalid')),
	CONSTRAINT "savings_chain_snapshots_amounts_check" CHECK ("savings_chain_snapshots"."susdp_total_assets" ~ '^[0-9]+$'
        and "savings_chain_snapshots"."susdp_actual_assets" ~ '^[0-9]+$'
        and "savings_chain_snapshots"."susdp_pending_yield" ~ '^[0-9]+$'
        and "savings_chain_snapshots"."susdp_share_price_usdp" ~ '^[0-9]+$'
        and "savings_chain_snapshots"."susdp_rate" ~ '^[0-9]+$'
        and "savings_chain_snapshots"."susdp_estimated_apy" ~ '^[0-9]+$'
        and "savings_chain_snapshots"."susdp_max_rate" ~ '^[0-9]+$'),
	CONSTRAINT "savings_chain_snapshots_pause_check" CHECK ("savings_chain_snapshots"."susdp_pause_state" between 0 and 255),
	CONSTRAINT "savings_chain_snapshots_usdp_impl_check" CHECK ("savings_chain_snapshots"."usdp_implementation" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "savings_chain_snapshots_susdp_impl_check" CHECK ("savings_chain_snapshots"."susdp_implementation" ~ '^0x[0-9a-f]{40}$')
);
--> statement-breakpoint
ALTER TABLE "asset_chain_snapshots" ADD CONSTRAINT "asset_chain_snapshots_deployment_fk" FOREIGN KEY ("asset_id","chain_id") REFERENCES "public"."asset_deployments"("asset_id","chain_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_chain_snapshots" ADD CONSTRAINT "asset_chain_snapshots_block_fk" FOREIGN KEY ("chain_id","block_number") REFERENCES "public"."blocks"("chain_id","number") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_savings_snapshot_components" ADD CONSTRAINT "global_savings_snapshot_components_global_snapshot_id_global_savings_snapshots_id_fk" FOREIGN KEY ("global_snapshot_id") REFERENCES "public"."global_savings_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_savings_snapshot_components" ADD CONSTRAINT "global_savings_snapshot_components_savings_snapshot_id_savings_chain_snapshots_id_fk" FOREIGN KEY ("savings_snapshot_id") REFERENCES "public"."savings_chain_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_chain_snapshots" ADD CONSTRAINT "savings_chain_snapshots_usdp_snapshot_id_asset_chain_snapshots_id_fk" FOREIGN KEY ("usdp_snapshot_id") REFERENCES "public"."asset_chain_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_chain_snapshots" ADD CONSTRAINT "savings_chain_snapshots_susdp_snapshot_id_asset_chain_snapshots_id_fk" FOREIGN KEY ("susdp_snapshot_id") REFERENCES "public"."asset_chain_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_chain_snapshots" ADD CONSTRAINT "savings_chain_snapshots_block_fk" FOREIGN KEY ("chain_id","block_number") REFERENCES "public"."blocks"("chain_id","number") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_chain_snapshots_provenance_unique" ON "asset_chain_snapshots" USING btree ("asset_id","chain_id","block_number","manifest_version","calculation_version");--> statement-breakpoint
CREATE INDEX "asset_chain_snapshots_latest_idx" ON "asset_chain_snapshots" USING btree ("asset_id","chain_id","block_number");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_deployments_chain_address_unique" ON "asset_deployments" USING btree ("chain_id","contract_address");--> statement-breakpoint
CREATE UNIQUE INDEX "global_savings_components_chain_unique" ON "global_savings_snapshot_components" USING btree ("global_snapshot_id","chain_id");--> statement-breakpoint
CREATE INDEX "global_savings_snapshots_as_of_idx" ON "global_savings_snapshots" USING btree ("as_of");--> statement-breakpoint
CREATE UNIQUE INDEX "savings_chain_snapshots_provenance_unique" ON "savings_chain_snapshots" USING btree ("chain_id","block_number","manifest_version","calculation_version");--> statement-breakpoint
CREATE INDEX "savings_chain_snapshots_latest_idx" ON "savings_chain_snapshots" USING btree ("chain_id","block_number");