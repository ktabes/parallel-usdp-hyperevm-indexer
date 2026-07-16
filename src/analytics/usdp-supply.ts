import type { Pool, PoolClient } from "pg";
import { keccak256 } from "viem";
import type { RuntimeEnv } from "@/config/env";
import { erc20Abi } from "@/protocol/abis";
import { parallelAssetRegistry } from "@/protocol/assets";
import {
  configuredUsdpSupplyAdapters,
  usdpSupplyAdapters,
  type SupplyRpcSource,
  type UsdpSupplyAdapter,
} from "@/protocol/usdp-chains";
import { createEvmClient, type EvmClient } from "@/rpc/evm-client";
import { providerErrorMessage } from "@/rpc/errors";
import { redactSecrets } from "@/rpc/alchemy";
import { syncParallelAssetRegistry } from "./multichain-snapshots";

export const GLOBAL_USDP_MANIFEST_VERSION =
  "parallel-usdp-24-chain-registry-2026-07-15-candidate";
export const GLOBAL_USDP_CALCULATION_VERSION =
  "parallel-global-usdp-supply-v1-candidate";
const SUPPLY_RPC_TIMEOUT_MS = 8_000;
const SUPPLY_RPC_RETRY_COUNT = 1;
const SUPPLY_RPC_ATTEMPTS_PER_URL = 1;
const SUPPLY_MAX_REQUEST_INTERVAL_MS = 500;

type FinalityMode =
  "rpc-finalized" | "confirmation-lag" | "confirmation-lag-fallback";

export interface UsdpSupplyComponent {
  assetSnapshotId: string;
  chainId: number;
  chainSlug: string;
  chainName: string;
  blockNumber: string;
  blockHash: string;
  blockTimestamp: Date;
  totalSupply: string;
  snapshotStatus: "candidate" | "invalid";
  metadataVerified: boolean;
  observedName: string;
  observedSymbol: string;
  observedDecimals: number;
  codeHash: string;
  finalityMode: FinalityMode;
  rpcSource: SupplyRpcSource;
  manifestVersion: string;
}

export interface UsdpSupplyFailure {
  chainId: number;
  chainSlug: string;
  reason: "snapshot_failed";
  message: string;
}

async function finalizedBlock(
  client: EvmClient,
  adapter: UsdpSupplyAdapter,
  finalityLag: number,
  observedAt: Date,
  alignmentMaximumSkewSeconds: number,
) {
  if (adapter.finality === "confirmation-lag") {
    const head = await client.getBlockNumber();
    return {
      block: await client.getBlock({
        blockNumber: head - BigInt(finalityLag),
      }),
      finalityMode: "confirmation-lag" as const,
    };
  }
  try {
    const block = await client.getBlock({ blockTag: "finalized" });
    if (
      !isBlockTimestampOutsideAlignment(
        block.timestamp,
        observedAt,
        alignmentMaximumSkewSeconds,
      )
    )
      return { block, finalityMode: "rpc-finalized" as const };
  } catch {
    // Continue into the same explicit confirmation-lag fallback used when a
    // provider exposes a finalized tag that is too old for this UTC window.
  }
  const head = await client.getBlockNumber();
  return {
    block: await client.getBlock({
      blockNumber: head - BigInt(finalityLag),
    }),
    finalityMode: "confirmation-lag-fallback" as const,
  };
}

export function isBlockTimestampOutsideAlignment(
  blockTimestamp: bigint,
  observedAt: Date,
  alignmentMaximumSkewSeconds: number,
) {
  const observedAtSeconds = BigInt(Math.floor(observedAt.getTime() / 1_000));
  const delta = observedAtSeconds - blockTimestamp;
  const absoluteDelta = delta < 0n ? -delta : delta;
  return absoluteDelta > BigInt(alignmentMaximumSkewSeconds);
}

async function insertBlock(
  database: PoolClient,
  component: {
    chainId: number;
    number: bigint;
    hash: string;
    parentHash: string;
    timestamp: Date;
  },
) {
  const existing = await database.query<{ hash: string }>(
    "select hash from blocks where chain_id = $1 and number = $2",
    [component.chainId, component.number.toString()],
  );
  if (
    existing.rows[0] &&
    existing.rows[0].hash.toLowerCase() !== component.hash.toLowerCase()
  )
    throw new Error(
      `Block hash drift on chain ${component.chainId} at ${component.number}`,
    );
  await database.query(
    `insert into blocks
      (chain_id, number, hash, parent_hash, timestamp, finalized)
     values ($1,$2,$3,$4,$5,true)
     on conflict (chain_id, number) do nothing`,
    [
      component.chainId,
      component.number.toString(),
      component.hash.toLowerCase(),
      component.parentHash.toLowerCase(),
      component.timestamp,
    ],
  );
}

async function insertAssetSnapshot(
  database: PoolClient,
  component: {
    chainId: number;
    blockNumber: bigint;
    blockHash: string;
    blockTimestamp: Date;
    totalSupply: bigint;
    snapshotStatus: "candidate" | "invalid";
    manifestVersion: string;
  },
) {
  const inserted = await database.query<{ id: string }>(
    `insert into asset_chain_snapshots
      (asset_id, chain_id, block_number, block_hash, block_timestamp,
       finalized, total_supply, snapshot_status, manifest_version,
       calculation_version)
     values ('usdp',$1,$2,$3,$4,true,$5,$6,$7,$8)
     on conflict
       (asset_id, chain_id, block_number, manifest_version, calculation_version)
     do nothing returning id`,
    [
      component.chainId,
      component.blockNumber.toString(),
      component.blockHash,
      component.blockTimestamp,
      component.totalSupply.toString(),
      component.snapshotStatus,
      component.manifestVersion,
      GLOBAL_USDP_CALCULATION_VERSION,
    ],
  );
  if (inserted.rows[0]) return inserted.rows[0].id;
  const existing = await database.query<{ id: string }>(
    `select id from asset_chain_snapshots
      where asset_id = 'usdp' and chain_id = $1 and block_number = $2
        and manifest_version = $3 and calculation_version = $4`,
    [
      component.chainId,
      component.blockNumber.toString(),
      component.manifestVersion,
      GLOBAL_USDP_CALCULATION_VERSION,
    ],
  );
  if (!existing.rows[0]) throw new Error("USDp snapshot upsert lost its row");
  return existing.rows[0].id;
}

export async function captureUsdpSupplyComponent(options: {
  pool: Pool;
  adapter: UsdpSupplyAdapter;
  rpcUrl: string;
  rpcSource: SupplyRpcSource;
  finalityLag: number;
  observedAt?: Date;
  alignmentMaximumSkewSeconds?: number;
  requestIntervalMs?: number;
}) {
  const client = createEvmClient(options.adapter.chain, options.rpcUrl, {
    minRequestIntervalMs: Math.min(
      options.requestIntervalMs ?? SUPPLY_MAX_REQUEST_INTERVAL_MS,
      SUPPLY_MAX_REQUEST_INTERVAL_MS,
    ),
    retryCount: SUPPLY_RPC_RETRY_COUNT,
    timeoutMs: SUPPLY_RPC_TIMEOUT_MS,
  });
  const { block, finalityMode } = await finalizedBlock(
    client,
    options.adapter,
    options.finalityLag,
    options.observedAt ?? new Date(),
    options.alignmentMaximumSkewSeconds ?? 1_800,
  );
  if (block.number === null || !block.hash)
    throw new Error(`${options.adapter.deployment.chainName} block incomplete`);
  const address = options.adapter.deployment.address;
  const [
    bytecode,
    observedName,
    observedSymbol,
    observedDecimals,
    totalSupply,
  ] = await Promise.all([
    client.getBytecode({ address, blockNumber: block.number }),
    client.readContract({
      address,
      abi: erc20Abi,
      functionName: "name",
      blockNumber: block.number,
    }),
    client.readContract({
      address,
      abi: erc20Abi,
      functionName: "symbol",
      blockNumber: block.number,
    }),
    client.readContract({
      address,
      abi: erc20Abi,
      functionName: "decimals",
      blockNumber: block.number,
    }),
    client.readContract({
      address,
      abi: erc20Abi,
      functionName: "totalSupply",
      blockNumber: block.number,
    }),
  ]);
  if (!bytecode || bytecode === "0x")
    throw new Error(
      `${options.adapter.deployment.chainName} USDp code missing`,
    );
  const metadataVerified =
    observedName === "USDp" &&
    observedSymbol === parallelAssetRegistry.assets.usdp.symbol &&
    Number(observedDecimals) === parallelAssetRegistry.assets.usdp.decimals;
  const snapshotStatus = metadataVerified
    ? ("candidate" as const)
    : ("invalid" as const);
  const blockTimestamp = new Date(Number(block.timestamp) * 1_000);
  const blockHash = block.hash.toLowerCase();
  const codeHash = keccak256(bytecode).toLowerCase();
  const database = await options.pool.connect();
  try {
    await database.query("begin");
    await insertBlock(database, {
      chainId: options.adapter.chain.id,
      number: block.number,
      hash: blockHash,
      parentHash: block.parentHash,
      timestamp: blockTimestamp,
    });
    const assetSnapshotId = await insertAssetSnapshot(database, {
      chainId: options.adapter.chain.id,
      blockNumber: block.number,
      blockHash,
      blockTimestamp,
      totalSupply: BigInt(totalSupply),
      snapshotStatus,
      manifestVersion: options.adapter.manifestVersion,
    });
    await database.query(
      `insert into usdp_supply_snapshot_evidence
        (asset_snapshot_id, code_hash, observed_name, observed_symbol,
         observed_decimals, metadata_verified, finality_mode, rpc_source)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (asset_snapshot_id) do update set
         code_hash = excluded.code_hash,
         observed_name = excluded.observed_name,
         observed_symbol = excluded.observed_symbol,
         observed_decimals = excluded.observed_decimals,
         metadata_verified = excluded.metadata_verified,
         finality_mode = excluded.finality_mode,
         rpc_source = excluded.rpc_source`,
      [
        assetSnapshotId,
        codeHash,
        observedName,
        observedSymbol,
        Number(observedDecimals),
        metadataVerified,
        finalityMode,
        options.rpcSource,
      ],
    );
    await database.query("commit");
    return {
      assetSnapshotId,
      chainId: options.adapter.chain.id,
      chainSlug: options.adapter.deployment.chainSlug,
      chainName: options.adapter.deployment.chainName,
      blockNumber: block.number.toString(),
      blockHash,
      blockTimestamp,
      totalSupply: BigInt(totalSupply).toString(),
      snapshotStatus,
      metadataVerified,
      observedName,
      observedSymbol,
      observedDecimals: Number(observedDecimals),
      codeHash,
      finalityMode,
      rpcSource: options.rpcSource,
      manifestVersion: options.adapter.manifestVersion,
    } satisfies UsdpSupplyComponent;
  } catch (error) {
    await database.query("rollback");
    throw error;
  } finally {
    database.release();
  }
}

export function aggregateUsdpSupplyComponents(options: {
  components: readonly UsdpSupplyComponent[];
  expectedChainIds: readonly number[];
  failedChainIds: readonly number[];
  asOf: Date;
  maximumAgeSeconds: number;
  alignmentMaximumSkewSeconds: number;
}) {
  const staleChainIds = options.components
    .filter((component) => {
      const offsetFromObservation = Math.floor(
        Math.abs(options.asOf.getTime() - component.blockTimestamp.getTime()) /
          1_000,
      );
      const age = Math.max(
        0,
        Math.floor(
          (options.asOf.getTime() - component.blockTimestamp.getTime()) / 1_000,
        ),
      );
      return (
        age > options.maximumAgeSeconds ||
        offsetFromObservation > options.alignmentMaximumSkewSeconds
      );
    })
    .map((component) => component.chainId);
  const metadataFailureChainIds = options.components
    .filter((component) => !component.metadataVerified)
    .map((component) => component.chainId);
  const failedChainIds = [
    ...new Set([...options.failedChainIds, ...metadataFailureChainIds]),
  ].sort((left, right) => left - right);
  const included = options.components.filter(
    (component) =>
      component.metadataVerified && !staleChainIds.includes(component.chainId),
  );
  const includedChainIds = included
    .map((component) => component.chainId)
    .sort((left, right) => left - right);
  const observedChainIds = new Set([
    ...options.components.map((component) => component.chainId),
    ...failedChainIds,
  ]);
  const missingChainIds = options.expectedChainIds
    .filter((chainId) => !observedChainIds.has(chainId))
    .sort((left, right) => left - right);
  const coverageStatus =
    included.length === options.expectedChainIds.length
      ? ("complete" as const)
      : included.length > 0
        ? ("partial" as const)
        : ("unavailable" as const);
  const candidateTotalSupply = included.reduce(
    (total, component) => total + BigInt(component.totalSupply),
    0n,
  );
  const timestamps = included.map((component) =>
    component.blockTimestamp.getTime(),
  );
  const oldestComponentTimestamp =
    timestamps.length === 0 ? null : new Date(Math.min(...timestamps));
  const newestComponentTimestamp =
    timestamps.length === 0 ? null : new Date(Math.max(...timestamps));
  const maximumComponentAgeSeconds =
    oldestComponentTimestamp === null
      ? null
      : BigInt(
          Math.max(
            0,
            Math.floor(
              (options.asOf.getTime() - oldestComponentTimestamp.getTime()) /
                1_000,
            ),
          ),
        );
  const componentSkewSeconds =
    oldestComponentTimestamp === null || newestComponentTimestamp === null
      ? null
      : BigInt(
          Math.floor(
            (newestComponentTimestamp.getTime() -
              oldestComponentTimestamp.getTime()) /
              1_000,
          ),
        );
  return {
    coverageStatus,
    included,
    includedChainIds,
    missingChainIds,
    staleChainIds: [...new Set(staleChainIds)].sort(
      (left, right) => left - right,
    ),
    failedChainIds,
    candidateTotalSupply,
    oldestComponentTimestamp,
    newestComponentTimestamp,
    maximumComponentAgeSeconds,
    componentSkewSeconds,
  };
}

async function persistGlobalSnapshot(
  pool: Pool,
  options: {
    asOf: Date;
    components: readonly UsdpSupplyComponent[];
    expectedChainIds: readonly number[];
    failedChainIds: readonly number[];
    maximumAgeSeconds: number;
    alignmentMaximumSkewSeconds: number;
  },
) {
  const aggregate = aggregateUsdpSupplyComponents(options);
  const database = await pool.connect();
  try {
    await database.query("begin");
    const inserted = await database.query<{ id: string }>(
      `insert into global_usdp_supply_snapshots
        (as_of, expected_chain_count, included_chain_count, coverage_status,
         accounting_status, candidate_total_supply, verified_total_supply,
         oldest_component_timestamp, newest_component_timestamp,
         maximum_component_age_seconds, component_skew_seconds,
         alignment_maximum_skew_seconds, included_chain_ids,
         missing_chain_ids, stale_chain_ids, failed_chain_ids,
         manifest_version, calculation_version)
       values ($1,$2,$3,$4,'candidate',$5,null,$6,$7,$8,$9,$10,
               $11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15,$16)
       returning id`,
      [
        options.asOf,
        options.expectedChainIds.length,
        aggregate.included.length,
        aggregate.coverageStatus,
        aggregate.candidateTotalSupply.toString(),
        aggregate.oldestComponentTimestamp,
        aggregate.newestComponentTimestamp,
        aggregate.maximumComponentAgeSeconds?.toString() ?? null,
        aggregate.componentSkewSeconds?.toString() ?? null,
        options.alignmentMaximumSkewSeconds,
        JSON.stringify(aggregate.includedChainIds),
        JSON.stringify(aggregate.missingChainIds),
        JSON.stringify(aggregate.staleChainIds),
        JSON.stringify(aggregate.failedChainIds),
        GLOBAL_USDP_MANIFEST_VERSION,
        GLOBAL_USDP_CALCULATION_VERSION,
      ],
    );
    const globalSnapshotId = inserted.rows[0]!.id;
    for (const component of options.components) {
      const included = aggregate.includedChainIds.includes(component.chainId);
      const exclusionReason = included
        ? null
        : !component.metadataVerified
          ? "metadata_invalid"
          : aggregate.staleChainIds.includes(component.chainId)
            ? "stale_or_misaligned"
            : "excluded";
      await database.query(
        `insert into global_usdp_supply_snapshot_components
          (global_snapshot_id, asset_snapshot_id, chain_id, included,
           exclusion_reason)
         values ($1,$2,$3,$4,$5)`,
        [
          globalSnapshotId,
          component.assetSnapshotId,
          component.chainId,
          included,
          exclusionReason,
        ],
      );
    }
    await database.query("commit");
    return { globalSnapshotId, ...aggregate };
  } catch (error) {
    await database.query("rollback");
    throw error;
  } finally {
    database.release();
  }
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  callback: (value: T) => Promise<R>,
) {
  const results: R[] = [];
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await callback(values[index]!);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export async function runWithSupplyRpcFailover<T>(options: {
  rpcUrls: readonly string[];
  operation: (rpcUrl: string) => Promise<T>;
  attemptsPerRpc?: number;
  retryDelayMs?: number;
}) {
  if (options.rpcUrls.length === 0)
    throw new Error("USDp supply RPC candidate list is empty");
  const attemptsPerRpc = options.attemptsPerRpc ?? 3;
  if (!Number.isInteger(attemptsPerRpc) || attemptsPerRpc < 1)
    throw new Error("USDp supply attempts per RPC must be a positive integer");
  const retryDelayMs = options.retryDelayMs ?? 250;
  let lastError: unknown;
  for (const rpcUrl of options.rpcUrls) {
    for (let attempt = 1; attempt <= attemptsPerRpc; attempt += 1) {
      try {
        return await options.operation(rpcUrl);
      } catch (error) {
        lastError = error;
        if (attempt < attemptsPerRpc && retryDelayMs > 0)
          await new Promise((resolve) =>
            setTimeout(resolve, retryDelayMs * attempt),
          );
      }
    }
  }
  throw new Error(
    `All ${options.rpcUrls.length} USDp supply RPC candidates failed after ${attemptsPerRpc} attempt(s) each: ${providerErrorMessage(lastError)}`,
    { cause: lastError },
  );
}

export async function captureGlobalUsdpSupply(pool: Pool, env: RuntimeEnv) {
  await syncParallelAssetRegistry(pool);
  const asOf = new Date();
  const adapters = configuredUsdpSupplyAdapters(env);
  const secretUrls = adapters
    .filter((adapter) => adapter.rpcSource !== "public-default")
    .flatMap((adapter) => adapter.rpcUrls);
  const attempts = await mapWithConcurrency(
    adapters,
    adapters.length,
    async (adapter) => {
      try {
        return {
          ok: true as const,
          component: await runWithSupplyRpcFailover({
            rpcUrls: adapter.rpcUrls,
            attemptsPerRpc: SUPPLY_RPC_ATTEMPTS_PER_URL,
            operation: (rpcUrl) =>
              captureUsdpSupplyComponent({
                pool,
                adapter,
                rpcUrl,
                rpcSource: adapter.rpcSource,
                finalityLag: env.FINALITY_LAG,
                observedAt: asOf,
                alignmentMaximumSkewSeconds:
                  env.USDP_SUPPLY_ALIGNMENT_MAX_SKEW_SECONDS,
                requestIntervalMs: env.RPC_REQUEST_INTERVAL_MS,
              }),
          }),
        };
      } catch (error) {
        return {
          ok: false as const,
          failure: {
            chainId: adapter.chain.id,
            chainSlug: adapter.deployment.chainSlug,
            reason: "snapshot_failed" as const,
            message: redactSecrets(providerErrorMessage(error), secretUrls),
          },
        };
      }
    },
  );
  const components = attempts
    .filter((attempt) => attempt.ok)
    .map((attempt) => attempt.component);
  const failures = attempts
    .filter((attempt) => !attempt.ok)
    .map((attempt) => attempt.failure);
  const global = await persistGlobalSnapshot(pool, {
    asOf,
    components,
    expectedChainIds: usdpSupplyAdapters.map((adapter) => adapter.chain.id),
    failedChainIds: failures.map((failure) => failure.chainId),
    maximumAgeSeconds: env.GLOBAL_SNAPSHOT_MAX_AGE_SECONDS,
    alignmentMaximumSkewSeconds: env.USDP_SUPPLY_ALIGNMENT_MAX_SKEW_SECONDS,
  });
  return {
    status: global.coverageStatus,
    accountingStatus: "candidate" as const,
    globalSnapshotId: global.globalSnapshotId,
    asOf: asOf.toISOString(),
    candidateTotalSupply: global.candidateTotalSupply.toString(),
    verifiedTotalSupply: null,
    coverage: {
      expectedChainCount: usdpSupplyAdapters.length,
      includedChainCount: global.included.length,
      includedChainIds: global.includedChainIds,
      missingChainIds: global.missingChainIds,
      staleChainIds: global.staleChainIds,
      failedChainIds: global.failedChainIds,
      oldestComponentTimestamp:
        global.oldestComponentTimestamp?.toISOString() ?? null,
      newestComponentTimestamp:
        global.newestComponentTimestamp?.toISOString() ?? null,
      maximumComponentAgeSeconds:
        global.maximumComponentAgeSeconds?.toString() ?? null,
      componentSkewSeconds: global.componentSkewSeconds?.toString() ?? null,
      alignmentMaximumSkewSeconds: env.USDP_SUPPLY_ALIGNMENT_MAX_SKEW_SECONDS,
    },
    components: components.map((component) => ({
      ...component,
      blockTimestamp: component.blockTimestamp.toISOString(),
      included: global.includedChainIds.includes(component.chainId),
    })),
    failures,
    methodology: {
      formula: "sum(USDp.totalSupply at aligned finalized chain blocks)",
      bridgeFlowsAddedToSupply: false,
      promotionGate:
        "candidate until bridge deployment, peer, and message reconciliation is complete",
    },
    manifestVersion: GLOBAL_USDP_MANIFEST_VERSION,
    calculationVersion: GLOBAL_USDP_CALCULATION_VERSION,
  };
}
