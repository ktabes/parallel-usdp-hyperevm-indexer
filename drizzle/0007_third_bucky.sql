CREATE TABLE "health_findings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"chain_id" integer NOT NULL,
	"scope" text NOT NULL,
	"check_name" text NOT NULL,
	"severity" text NOT NULL,
	"status" text NOT NULL,
	"message" text NOT NULL,
	"block_number" bigint,
	"observed_at" timestamp with time zone NOT NULL,
	"diagnostics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "health_findings_severity_check" CHECK ("health_findings"."severity" in ('info', 'warning', 'critical')),
	CONSTRAINT "health_findings_status_check" CHECK ("health_findings"."status" in ('pass', 'warn', 'fail'))
);
--> statement-breakpoint
CREATE TABLE "reconciliation_results" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"check_name" text NOT NULL,
	"status" text NOT NULL,
	"expected_value" text,
	"actual_value" text,
	"variance" text,
	"tolerance" text,
	"block_number" bigint,
	"observed_at" timestamp with time zone,
	"diagnostics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_results_status_check" CHECK ("reconciliation_results"."status" in ('pass', 'warn', 'fail'))
);
--> statement-breakpoint
CREATE TABLE "reconciliation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain_id" integer NOT NULL,
	"scope" text NOT NULL,
	"from_block" bigint NOT NULL,
	"to_block" bigint NOT NULL,
	"manifest_version" text NOT NULL,
	"calculation_version" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "reconciliation_runs_range_check" CHECK ("reconciliation_runs"."to_block" >= "reconciliation_runs"."from_block"),
	CONSTRAINT "reconciliation_runs_status_check" CHECK ("reconciliation_runs"."status" in ('running', 'pass', 'warn', 'fail'))
);
--> statement-breakpoint
ALTER TABLE "health_findings" ADD CONSTRAINT "health_findings_run_id_reconciliation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."reconciliation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_results" ADD CONSTRAINT "reconciliation_results_run_id_reconciliation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."reconciliation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "health_findings_run_check_unique" ON "health_findings" USING btree ("run_id","check_name");--> statement-breakpoint
CREATE INDEX "health_findings_scope_status_idx" ON "health_findings" USING btree ("chain_id","scope","status");--> statement-breakpoint
CREATE UNIQUE INDEX "reconciliation_results_run_check_unique" ON "reconciliation_results" USING btree ("run_id","check_name");--> statement-breakpoint
CREATE INDEX "reconciliation_results_status_idx" ON "reconciliation_results" USING btree ("status","check_name");--> statement-breakpoint
CREATE INDEX "reconciliation_runs_scope_started_idx" ON "reconciliation_runs" USING btree ("chain_id","scope","started_at");