ALTER TABLE "asset_deployments" ADD COLUMN "deployment_block" bigint;--> statement-breakpoint
ALTER TABLE "asset_deployments" ADD COLUMN "deployment_block_source" text;--> statement-breakpoint
ALTER TABLE "asset_deployments" ADD CONSTRAINT "asset_deployments_block_source_check" CHECK (("asset_deployments"."deployment_block" is null and "asset_deployments"."deployment_block_source" is null)
        or ("asset_deployments"."deployment_block" >= 0 and "asset_deployments"."deployment_block_source" is not null));