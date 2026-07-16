CREATE TABLE "asset_activity_aggregates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"asset_id" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"transfer_volume" text NOT NULL,
	"minted_volume" text NOT NULL,
	"burned_volume" text NOT NULL,
	"transfer_count" integer NOT NULL,
	"unique_senders" integer NOT NULL,
	"unique_receivers" integer NOT NULL,
	"unique_participants" integer NOT NULL,
	"new_holders" integer NOT NULL,
	"active_holders" integer NOT NULL,
	"source_scope" text NOT NULL,
	"source_from_block" bigint NOT NULL,
	"source_to_block" bigint NOT NULL,
	"history_complete" boolean NOT NULL,
	"manifest_version" text NOT NULL,
	"calculation_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_activity_asset_check" CHECK ("asset_activity_aggregates"."asset_id" in ('usdp', 'susdp')),
	CONSTRAINT "asset_activity_amounts_check" CHECK ("asset_activity_aggregates"."transfer_volume" ~ '^[0-9]+$'
        and "asset_activity_aggregates"."minted_volume" ~ '^[0-9]+$'
        and "asset_activity_aggregates"."burned_volume" ~ '^[0-9]+$'),
	CONSTRAINT "asset_activity_counts_check" CHECK ("asset_activity_aggregates"."transfer_count" >= 0
        and "asset_activity_aggregates"."unique_senders" >= 0
        and "asset_activity_aggregates"."unique_receivers" >= 0
        and "asset_activity_aggregates"."unique_participants" >= 0
        and "asset_activity_aggregates"."new_holders" >= 0
        and "asset_activity_aggregates"."active_holders" >= 0),
	CONSTRAINT "asset_activity_window_check" CHECK ("asset_activity_aggregates"."window_end" >= "asset_activity_aggregates"."window_start"),
	CONSTRAINT "asset_activity_source_range_check" CHECK ("asset_activity_aggregates"."source_to_block" >= "asset_activity_aggregates"."source_from_block")
);
--> statement-breakpoint
CREATE TABLE "holder_balances" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"asset_id" text NOT NULL,
	"holder_address" text NOT NULL,
	"balance" text NOT NULL,
	"first_positive_block" bigint,
	"last_changed_block" bigint NOT NULL,
	"source_scope" text NOT NULL,
	"source_from_block" bigint NOT NULL,
	"source_to_block" bigint NOT NULL,
	"history_complete" boolean NOT NULL,
	"manifest_version" text NOT NULL,
	"calculation_version" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holder_balances_asset_check" CHECK ("holder_balances"."asset_id" in ('usdp', 'susdp')),
	CONSTRAINT "holder_balances_amount_check" CHECK ("holder_balances"."balance" ~ '^[0-9]+$'),
	CONSTRAINT "holder_balances_address_check" CHECK ("holder_balances"."holder_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "holder_balances_source_range_check" CHECK ("holder_balances"."source_to_block" >= "holder_balances"."source_from_block")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "asset_activity_provenance_unique" ON "asset_activity_aggregates" USING btree ("chain_id","asset_id","source_scope","source_from_block","source_to_block","calculation_version");--> statement-breakpoint
CREATE INDEX "asset_activity_chain_window_idx" ON "asset_activity_aggregates" USING btree ("chain_id","asset_id","window_start","window_end");--> statement-breakpoint
CREATE UNIQUE INDEX "holder_balances_scope_asset_holder_unique" ON "holder_balances" USING btree ("chain_id","source_scope","asset_id","holder_address");--> statement-breakpoint
CREATE INDEX "holder_balances_active_idx" ON "holder_balances" USING btree ("chain_id","asset_id","balance");