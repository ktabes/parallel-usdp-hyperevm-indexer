CREATE TABLE "indexer_coverage" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"scope" text NOT NULL,
	"from_block" bigint NOT NULL,
	"to_block" bigint NOT NULL,
	"run_id" uuid,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indexer_coverage_range_check" CHECK ("indexer_coverage"."to_block" >= "indexer_coverage"."from_block")
);
--> statement-breakpoint
CREATE TABLE "protocol_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"raw_log_id" bigint NOT NULL,
	"chain_id" integer NOT NULL,
	"block_number" bigint NOT NULL,
	"transaction_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"contract_role" text NOT NULL,
	"event_name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"decoder_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "indexer_coverage" ADD CONSTRAINT "indexer_coverage_run_id_indexer_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."indexer_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocol_events" ADD CONSTRAINT "protocol_events_raw_log_id_raw_logs_id_fk" FOREIGN KEY ("raw_log_id") REFERENCES "public"."raw_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "indexer_coverage_scope_range_unique" ON "indexer_coverage" USING btree ("chain_id","scope","from_block","to_block");--> statement-breakpoint
CREATE INDEX "indexer_coverage_scope_from_idx" ON "indexer_coverage" USING btree ("chain_id","scope","from_block");--> statement-breakpoint
CREATE UNIQUE INDEX "protocol_events_raw_log_unique" ON "protocol_events" USING btree ("raw_log_id");--> statement-breakpoint
CREATE INDEX "protocol_events_chain_block_idx" ON "protocol_events" USING btree ("chain_id","block_number");--> statement-breakpoint
CREATE INDEX "protocol_events_name_block_idx" ON "protocol_events" USING btree ("event_name","block_number");