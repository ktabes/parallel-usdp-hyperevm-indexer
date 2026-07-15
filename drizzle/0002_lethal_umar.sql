CREATE TABLE "economic_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"protocol_event_id" bigint NOT NULL,
	"chain_id" integer NOT NULL,
	"block_number" bigint NOT NULL,
	"transaction_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"classification" text NOT NULL,
	"amount_base_units" text,
	"asset_address" text,
	"primary_participant" text,
	"secondary_participant" text,
	"transaction_context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_from_block" bigint NOT NULL,
	"source_to_block" bigint NOT NULL,
	"manifest_version" text NOT NULL,
	"calculation_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "economic_events_source_range_check" CHECK ("economic_events"."source_to_block" >= "economic_events"."source_from_block"),
	CONSTRAINT "economic_events_amount_check" CHECK ("economic_events"."amount_base_units" is null or "economic_events"."amount_base_units" ~ '^[0-9]+$')
);
--> statement-breakpoint
CREATE TABLE "flow_aggregates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"granularity" text NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"metric" text NOT NULL,
	"amount_base_units" text NOT NULL,
	"event_count" integer NOT NULL,
	"unique_participants" integer NOT NULL,
	"source_from_block" bigint NOT NULL,
	"source_to_block" bigint NOT NULL,
	"manifest_version" text NOT NULL,
	"calculation_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_aggregates_granularity_check" CHECK ("flow_aggregates"."granularity" in ('hour', 'day')),
	CONSTRAINT "flow_aggregates_amount_check" CHECK ("flow_aggregates"."amount_base_units" ~ '^[0-9]+$'),
	CONSTRAINT "flow_aggregates_source_range_check" CHECK ("flow_aggregates"."source_to_block" >= "flow_aggregates"."source_from_block"),
	CONSTRAINT "flow_aggregates_counts_check" CHECK ("flow_aggregates"."event_count" >= 0 and "flow_aggregates"."unique_participants" >= 0)
);
--> statement-breakpoint
ALTER TABLE "economic_events" ADD CONSTRAINT "economic_events_protocol_event_id_protocol_events_id_fk" FOREIGN KEY ("protocol_event_id") REFERENCES "public"."protocol_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "economic_events_protocol_event_unique" ON "economic_events" USING btree ("protocol_event_id");--> statement-breakpoint
CREATE INDEX "economic_events_chain_block_idx" ON "economic_events" USING btree ("chain_id","block_number");--> statement-breakpoint
CREATE INDEX "economic_events_classification_block_idx" ON "economic_events" USING btree ("classification","block_number");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_aggregates_provenance_bucket_unique" ON "flow_aggregates" USING btree ("chain_id","granularity","bucket_start","metric","source_from_block","source_to_block","manifest_version","calculation_version");--> statement-breakpoint
CREATE INDEX "flow_aggregates_chain_bucket_idx" ON "flow_aggregates" USING btree ("chain_id","bucket_start");