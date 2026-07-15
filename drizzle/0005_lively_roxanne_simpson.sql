CREATE TABLE "global_savings_yield_aggregates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"expected_chain_count" integer NOT NULL,
	"included_chain_count" integer NOT NULL,
	"coverage_status" text NOT NULL,
	"native_ypo" text NOT NULL,
	"included_chain_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_chain_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unreconciled_chain_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"calculation_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "global_savings_yield_window_check" CHECK ("global_savings_yield_aggregates"."window_end" > "global_savings_yield_aggregates"."window_start"),
	CONSTRAINT "global_savings_yield_status_check" CHECK ("global_savings_yield_aggregates"."coverage_status" in ('complete', 'partial', 'unavailable')),
	CONSTRAINT "global_savings_yield_counts_check" CHECK ("global_savings_yield_aggregates"."expected_chain_count" >= 0
        and "global_savings_yield_aggregates"."included_chain_count" >= 0
        and "global_savings_yield_aggregates"."included_chain_count" <= "global_savings_yield_aggregates"."expected_chain_count"),
	CONSTRAINT "global_savings_yield_amount_check" CHECK ("global_savings_yield_aggregates"."native_ypo" ~ '^[0-9]+$')
);
--> statement-breakpoint
CREATE TABLE "global_savings_yield_components" (
	"global_yield_id" bigint NOT NULL,
	"savings_yield_id" bigint NOT NULL,
	"chain_id" integer NOT NULL,
	CONSTRAINT "global_savings_yield_components_global_yield_id_savings_yield_id_pk" PRIMARY KEY("global_yield_id","savings_yield_id")
);
--> statement-breakpoint
CREATE TABLE "savings_yield_aggregates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"start_snapshot_id" bigint NOT NULL,
	"end_snapshot_id" bigint NOT NULL,
	"from_block" bigint NOT NULL,
	"to_block" bigint NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"accrued_interest" text NOT NULL,
	"pending_yield_at_start" text NOT NULL,
	"pending_yield_at_end" text NOT NULL,
	"native_ypo" text NOT NULL,
	"coverage_scope" text NOT NULL,
	"window_convention" text NOT NULL,
	"reconciliation_status" text NOT NULL,
	"manifest_version" text NOT NULL,
	"calculation_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_yield_range_check" CHECK ("savings_yield_aggregates"."to_block" > "savings_yield_aggregates"."from_block"),
	CONSTRAINT "savings_yield_window_check" CHECK ("savings_yield_aggregates"."window_end" > "savings_yield_aggregates"."window_start"),
	CONSTRAINT "savings_yield_amounts_check" CHECK ("savings_yield_aggregates"."accrued_interest" ~ '^[0-9]+$'
        and "savings_yield_aggregates"."pending_yield_at_start" ~ '^[0-9]+$'
        and "savings_yield_aggregates"."pending_yield_at_end" ~ '^[0-9]+$'
        and "savings_yield_aggregates"."native_ypo" ~ '^[0-9]+$'),
	CONSTRAINT "savings_yield_reconciliation_status_check" CHECK ("savings_yield_aggregates"."reconciliation_status" in ('candidate', 'verified', 'invalid'))
);
--> statement-breakpoint
ALTER TABLE "global_savings_yield_components" ADD CONSTRAINT "global_savings_yield_components_global_yield_id_global_savings_yield_aggregates_id_fk" FOREIGN KEY ("global_yield_id") REFERENCES "public"."global_savings_yield_aggregates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_savings_yield_components" ADD CONSTRAINT "global_savings_yield_components_savings_yield_id_savings_yield_aggregates_id_fk" FOREIGN KEY ("savings_yield_id") REFERENCES "public"."savings_yield_aggregates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_yield_aggregates" ADD CONSTRAINT "savings_yield_aggregates_start_snapshot_id_savings_chain_snapshots_id_fk" FOREIGN KEY ("start_snapshot_id") REFERENCES "public"."savings_chain_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_yield_aggregates" ADD CONSTRAINT "savings_yield_aggregates_end_snapshot_id_savings_chain_snapshots_id_fk" FOREIGN KEY ("end_snapshot_id") REFERENCES "public"."savings_chain_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "global_savings_yield_window_version_unique" ON "global_savings_yield_aggregates" USING btree ("window_start","window_end","calculation_version");--> statement-breakpoint
CREATE INDEX "global_savings_yield_window_idx" ON "global_savings_yield_aggregates" USING btree ("window_start","window_end");--> statement-breakpoint
CREATE UNIQUE INDEX "global_savings_yield_component_chain_unique" ON "global_savings_yield_components" USING btree ("global_yield_id","chain_id");--> statement-breakpoint
CREATE UNIQUE INDEX "savings_yield_provenance_range_unique" ON "savings_yield_aggregates" USING btree ("chain_id","from_block","to_block","manifest_version","calculation_version");--> statement-breakpoint
CREATE INDEX "savings_yield_chain_window_idx" ON "savings_yield_aggregates" USING btree ("chain_id","window_start","window_end");