CREATE TABLE "blocks" (
	"chain_id" integer NOT NULL,
	"number" bigint NOT NULL,
	"hash" text NOT NULL,
	"parent_hash" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"finalized" boolean NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_chain_id_number_pk" PRIMARY KEY("chain_id","number"),
	CONSTRAINT "blocks_hash_check" CHECK ("blocks"."hash" ~ '^0x[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "contract_eras" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"manifest_id" text NOT NULL,
	"role" text NOT NULL,
	"proxy_address" text NOT NULL,
	"implementation_address" text,
	"abi_source_commit" text NOT NULL,
	"start_block" bigint NOT NULL,
	"end_block" bigint,
	"decoder_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_eras_address_check" CHECK ("contract_eras"."proxy_address" ~ '^0x[0-9a-f]{40}$')
);
--> statement-breakpoint
CREATE TABLE "contract_manifests" (
	"id" text PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"manifest_block" bigint NOT NULL,
	"manifest_block_hash" text NOT NULL,
	"status" text DEFAULT 'candidate' NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	CONSTRAINT "contract_manifests_status_check" CHECK ("contract_manifests"."status" in ('candidate', 'approved', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE "indexer_checkpoints" (
	"chain_id" integer NOT NULL,
	"scope" text NOT NULL,
	"next_block" bigint NOT NULL,
	"last_completed_block" bigint,
	"last_completed_block_hash" text,
	"manifest_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indexer_checkpoints_chain_id_scope_pk" PRIMARY KEY("chain_id","scope")
);
--> statement-breakpoint
CREATE TABLE "indexer_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_type" text NOT NULL,
	"chain_id" integer NOT NULL,
	"from_block" bigint,
	"to_block" bigint,
	"status" text DEFAULT 'running' NOT NULL,
	"counters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"failure" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "indexer_runs_status_check" CHECK ("indexer_runs"."status" in ('running', 'completed', 'failed', 'interrupted'))
);
--> statement-breakpoint
CREATE TABLE "price_observations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"asset_address" text NOT NULL,
	"block_number" bigint NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"price_usd_atomic" text NOT NULL,
	"price_decimals" integer NOT NULL,
	"source" text NOT NULL,
	"source_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stale" boolean DEFAULT false NOT NULL,
	"calculation_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_observations_decimals_check" CHECK ("price_observations"."price_decimals" between 0 and 36)
);
--> statement-breakpoint
CREATE TABLE "raw_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"block_number" bigint NOT NULL,
	"block_hash" text NOT NULL,
	"transaction_hash" text NOT NULL,
	"transaction_index" integer NOT NULL,
	"log_index" integer NOT NULL,
	"contract_address" text NOT NULL,
	"topics" jsonb NOT NULL,
	"data" text NOT NULL,
	"removed" boolean DEFAULT false NOT NULL,
	"decoder_version" text NOT NULL,
	"run_id" uuid,
	"inserted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "raw_logs_contract_address_check" CHECK ("raw_logs"."contract_address" ~ '^0x[0-9a-f]{40}$')
);
--> statement-breakpoint
ALTER TABLE "contract_eras" ADD CONSTRAINT "contract_eras_manifest_id_contract_manifests_id_fk" FOREIGN KEY ("manifest_id") REFERENCES "public"."contract_manifests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indexer_checkpoints" ADD CONSTRAINT "indexer_checkpoints_manifest_id_contract_manifests_id_fk" FOREIGN KEY ("manifest_id") REFERENCES "public"."contract_manifests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_block_fk" FOREIGN KEY ("chain_id","block_number") REFERENCES "public"."blocks"("chain_id","number") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_logs" ADD CONSTRAINT "raw_logs_run_id_indexer_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."indexer_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_logs" ADD CONSTRAINT "raw_logs_block_fk" FOREIGN KEY ("chain_id","block_number") REFERENCES "public"."blocks"("chain_id","number") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "blocks_chain_hash_unique" ON "blocks" USING btree ("chain_id","hash");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_eras_manifest_role_start_unique" ON "contract_eras" USING btree ("manifest_id","role","start_block");--> statement-breakpoint
CREATE INDEX "contract_eras_address_range_idx" ON "contract_eras" USING btree ("proxy_address","start_block","end_block");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_manifests_chain_block_unique" ON "contract_manifests" USING btree ("chain_id","manifest_block");--> statement-breakpoint
CREATE INDEX "indexer_runs_chain_started_idx" ON "indexer_runs" USING btree ("chain_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "price_observations_asset_block_source_unique" ON "price_observations" USING btree ("chain_id","asset_address","block_number","source");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_logs_chain_tx_log_unique" ON "raw_logs" USING btree ("chain_id","transaction_hash","log_index");--> statement-breakpoint
CREATE INDEX "raw_logs_chain_block_idx" ON "raw_logs" USING btree ("chain_id","block_number");--> statement-breakpoint
CREATE INDEX "raw_logs_contract_block_idx" ON "raw_logs" USING btree ("contract_address","block_number");