import type { Pool, PoolClient } from "pg";
import type { Address, Hex } from "viem";
import type { RuntimeEnv } from "@/config/env";
import { implementationAddressFromSlot } from "@/protocol/discovery";
import {
  parallelAssetRegistry,
  susdpDeployments,
  usdpDeployments,
} from "@/protocol/assets";
import {
  configuredSavingsChainAdapters,
  savingsChainAdapters,
  type SavingsChainAdapter,
} from "@/protocol/savings-chains";
import {
  ERC1967_IMPLEMENTATION_SLOT,
  erc20Abi,
  savingsAbi,
} from "@/protocol/abis";
import { calculatePendingYield } from "@/protocol/savings-math";
import { createEvmClient, type EvmClient } from "@/rpc/evm-client";
import { providerErrorMessage } from "@/rpc/errors";
import { redactSecrets } from "@/rpc/alchemy";

export const MULTICHAIN_STATE_CALCULATION_VERSION =
  "parallel-savings-chain-state-v1-candidate";
export const GLOBAL_SAVINGS_CALCULATION_VERSION =
  "parallel-global-savings-state-v1-candidate";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface SavingsStateRead {
  asset: Address;
  usdpTotalSupply: bigint;
  susdpTotalAssets: bigint;
  susdpActualAssets: bigint;
  susdpTotalSupply: bigint;
  susdpSharePriceUsdp: bigint;
  susdpRate: bigint;
  susdpLastUpdate: bigint;
  susdpEstimatedApy: bigint;
  susdpMaxRate: bigint;
  susdpPauseState: number;
}

export interface CaptureSavingsChainSnapshotOptions {
  pool: Pool;
  adapter: SavingsChainAdapter;
  rpcUrl: string;
  finalityLag: number;
  requestIntervalMs?: number;
  calculationVersion?: string;
  blockNumber?: bigint;
}

export async function syncParallelAssetRegistry(pool: Pool) {
  const deployments = [...usdpDeployments, ...susdpDeployments];
  const sourceCheckedAt = new Date(
    `${parallelAssetRegistry.sourceCheckedAt}T00:00:00.000Z`,
  );
  const database = await pool.connect();
  try {
    await database.query("begin");
    for (const deployment of deployments) {
      await database.query(
        `insert into asset_deployments
          (asset_id, chain_id, chain_slug, chain_name, contract_address,
           deployment_block, deployment_block_source, deployment_tier,
           adapter_status, official_source, source_checked_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         on conflict (asset_id, chain_id) do update set
           chain_slug = excluded.chain_slug,
           chain_name = excluded.chain_name,
           contract_address = excluded.contract_address,
           deployment_block = excluded.deployment_block,
           deployment_block_source = excluded.deployment_block_source,
           deployment_tier = excluded.deployment_tier,
           adapter_status = excluded.adapter_status,
           official_source = excluded.official_source,
           source_checked_at = excluded.source_checked_at,
           updated_at = now()`,
        [
          deployment.assetId,
          deployment.chainId,
          deployment.chainSlug,
          deployment.chainName,
          deployment.address.toLowerCase(),
          deployment.deploymentBlock?.toString() ?? null,
          deployment.deploymentBlockSource ?? null,
          deployment.tier,
          deployment.adapterStatus,
          parallelAssetRegistry.source,
          sourceCheckedAt,
        ],
      );
    }
    await database.query("commit");
    return { status: "ok" as const, deployments: deployments.length };
  } catch (error) {
    await database.query("rollback");
    throw error;
  } finally {
    database.release();
  }
}

async function finalizedBlock(
  client: EvmClient,
  adapter: SavingsChainAdapter,
  finalityLag: number,
) {
  if (adapter.finality === "rpc-finalized")
    return client.getBlock({ blockTag: "finalized" });
  const head = await client.getBlockNumber();
  const blockNumber = head - BigInt(finalityLag);
  return client.getBlock({ blockNumber });
}

function contracts(adapter: SavingsChainAdapter) {
  const { usdp, susdp } = adapter;
  const query = (
    address: Address,
    abi: readonly unknown[],
    functionName: string,
    args?: readonly unknown[],
  ) => ({ address, abi, functionName, args });
  return [
    query(susdp.address, savingsAbi, "asset"),
    query(usdp.address, erc20Abi, "totalSupply"),
    query(susdp.address, savingsAbi, "totalAssets"),
    query(usdp.address, erc20Abi, "balanceOf", [susdp.address]),
    query(susdp.address, savingsAbi, "totalSupply"),
    query(susdp.address, savingsAbi, "convertToAssets", [10n ** 18n]),
    query(susdp.address, savingsAbi, "rate"),
    query(susdp.address, savingsAbi, "lastUpdate"),
    query(susdp.address, savingsAbi, "estimatedAPR"),
    query(susdp.address, savingsAbi, "maxRate"),
    query(susdp.address, savingsAbi, "paused"),
  ] as const;
}

function normalizeState(values: readonly unknown[]): SavingsStateRead {
  return {
    asset: values[0] as Address,
    usdpTotalSupply: BigInt(values[1] as bigint),
    susdpTotalAssets: BigInt(values[2] as bigint),
    susdpActualAssets: BigInt(values[3] as bigint),
    susdpTotalSupply: BigInt(values[4] as bigint),
    susdpSharePriceUsdp: BigInt(values[5] as bigint),
    susdpRate: BigInt(values[6] as bigint),
    susdpLastUpdate: BigInt(values[7] as bigint | number),
    susdpEstimatedApy: BigInt(values[8] as bigint),
    susdpMaxRate: BigInt(values[9] as bigint),
    susdpPauseState: Number(values[10]),
  };
}

async function readSavingsState(
  client: EvmClient,
  adapter: SavingsChainAdapter,
  blockNumber: bigint,
) {
  const reads = contracts(adapter);
  if (adapter.chainId !== 999) {
    const values = await client.multicall({
      allowFailure: false,
      blockNumber,
      contracts: reads as never,
    });
    return normalizeState(values as readonly unknown[]);
  }

  const values = await Promise.all(
    reads.map((read) =>
      client.readContract({
        address: read.address,
        abi: read.abi,
        functionName: read.functionName,
        args: read.args,
        blockNumber,
      } as never),
    ),
  );
  return normalizeState(values);
}

async function insertAssetSnapshot(
  database: PoolClient,
  options: {
    assetId: "usdp" | "susdp";
    chainId: number;
    blockNumber: bigint;
    blockHash: string;
    blockTimestamp: Date;
    totalSupply: bigint;
    snapshotStatus: "candidate" | "invalid";
    manifestVersion: string;
    calculationVersion: string;
  },
) {
  const inserted = await database.query<{ id: string }>(
    `insert into asset_chain_snapshots
      (asset_id, chain_id, block_number, block_hash, block_timestamp,
       finalized, total_supply, snapshot_status, manifest_version,
       calculation_version)
     values ($1,$2,$3,$4,$5,true,$6,$7,$8,$9)
     on conflict
       (asset_id, chain_id, block_number, manifest_version, calculation_version)
     do nothing returning id`,
    [
      options.assetId,
      options.chainId,
      options.blockNumber.toString(),
      options.blockHash,
      options.blockTimestamp,
      options.totalSupply.toString(),
      options.snapshotStatus,
      options.manifestVersion,
      options.calculationVersion,
    ],
  );
  if (inserted.rows[0]) return inserted.rows[0].id;
  const existing = await database.query<{ id: string }>(
    `select id from asset_chain_snapshots
      where asset_id = $1 and chain_id = $2 and block_number = $3
        and manifest_version = $4 and calculation_version = $5`,
    [
      options.assetId,
      options.chainId,
      options.blockNumber.toString(),
      options.manifestVersion,
      options.calculationVersion,
    ],
  );
  if (!existing.rows[0]) throw new Error("Asset snapshot upsert lost its row");
  return existing.rows[0].id;
}

export async function captureSavingsChainSnapshot(
  options: CaptureSavingsChainSnapshotOptions,
) {
  const calculationVersion =
    options.calculationVersion ?? MULTICHAIN_STATE_CALCULATION_VERSION;
  const client = createEvmClient(options.adapter.chain, options.rpcUrl, {
    minRequestIntervalMs: options.requestIntervalMs,
  });
  const block =
    options.blockNumber === undefined
      ? await finalizedBlock(client, options.adapter, options.finalityLag)
      : await client.getBlock({ blockNumber: options.blockNumber });
  if (block.number === null || !block.hash)
    throw new Error(
      `${options.adapter.chainName} finalized block is incomplete`,
    );

  const state = await readSavingsState(client, options.adapter, block.number);
  const readImplementationSlot = async (address: Address) => {
    try {
      return await client.getStorageAt({
        address,
        slot: ERC1967_IMPLEMENTATION_SLOT,
        blockNumber: block.number,
      });
    } catch {
      return undefined;
    }
  };
  const usdpImplementationSlot = await readImplementationSlot(
    options.adapter.usdp.address,
  );
  const susdpImplementationSlot = await readImplementationSlot(
    options.adapter.susdp.address,
  );
  const usdpImplementation =
    implementationAddressFromSlot(usdpImplementationSlot as Hex | undefined) ??
    ZERO_ADDRESS;
  const susdpImplementation =
    implementationAddressFromSlot(susdpImplementationSlot as Hex | undefined) ??
    ZERO_ADDRESS;
  const assetRelationshipVerified =
    state.asset.toLowerCase() === options.adapter.usdp.address.toLowerCase();
  const implementationSlotsPresent =
    usdpImplementation !== ZERO_ADDRESS && susdpImplementation !== ZERO_ADDRESS;
  const snapshotStatus = assetRelationshipVerified
    ? ("candidate" as const)
    : ("invalid" as const);
  const pendingYield = calculatePendingYield(
    state.susdpTotalAssets,
    state.susdpActualAssets,
  );
  const blockTimestamp = new Date(Number(block.timestamp) * 1_000);
  const blockHash = block.hash.toLowerCase();

  const database = await options.pool.connect();
  try {
    await database.query("begin");
    const existingBlock = await database.query<{ hash: string }>(
      "select hash from blocks where chain_id = $1 and number = $2",
      [options.adapter.chainId, block.number.toString()],
    );
    if (
      existingBlock.rows[0] &&
      existingBlock.rows[0].hash.toLowerCase() !== blockHash
    )
      throw new Error(
        `${options.adapter.chainName} block hash drift at ${block.number}`,
      );
    await database.query(
      `insert into blocks
        (chain_id, number, hash, parent_hash, timestamp, finalized)
       values ($1,$2,$3,$4,$5,true)
       on conflict (chain_id, number) do nothing`,
      [
        options.adapter.chainId,
        block.number.toString(),
        blockHash,
        block.parentHash.toLowerCase(),
        blockTimestamp,
      ],
    );
    const usdpSnapshotId = await insertAssetSnapshot(database, {
      assetId: "usdp",
      chainId: options.adapter.chainId,
      blockNumber: block.number,
      blockHash,
      blockTimestamp,
      totalSupply: state.usdpTotalSupply,
      snapshotStatus,
      manifestVersion: options.adapter.manifestVersion,
      calculationVersion,
    });
    const susdpSnapshotId = await insertAssetSnapshot(database, {
      assetId: "susdp",
      chainId: options.adapter.chainId,
      blockNumber: block.number,
      blockHash,
      blockTimestamp,
      totalSupply: state.susdpTotalSupply,
      snapshotStatus,
      manifestVersion: options.adapter.manifestVersion,
      calculationVersion,
    });
    const inserted = await database.query<{ id: string }>(
      `insert into savings_chain_snapshots
        (chain_id, block_number, block_hash, block_timestamp,
         usdp_snapshot_id, susdp_snapshot_id, susdp_total_assets,
         susdp_actual_assets, susdp_pending_yield, susdp_share_price_usdp,
         susdp_rate, susdp_last_update, susdp_estimated_apy, susdp_max_rate,
         susdp_pause_state, usdp_implementation, susdp_implementation,
         asset_relationship_verified, snapshot_status, manifest_version,
         calculation_version)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
               $17,$18,$19,$20,$21)
       on conflict
         (chain_id, block_number, manifest_version, calculation_version)
       do nothing returning id`,
      [
        options.adapter.chainId,
        block.number.toString(),
        blockHash,
        blockTimestamp,
        usdpSnapshotId,
        susdpSnapshotId,
        state.susdpTotalAssets.toString(),
        state.susdpActualAssets.toString(),
        pendingYield.toString(),
        state.susdpSharePriceUsdp.toString(),
        state.susdpRate.toString(),
        state.susdpLastUpdate.toString(),
        state.susdpEstimatedApy.toString(),
        state.susdpMaxRate.toString(),
        state.susdpPauseState,
        usdpImplementation.toLowerCase(),
        susdpImplementation.toLowerCase(),
        assetRelationshipVerified,
        snapshotStatus,
        options.adapter.manifestVersion,
        calculationVersion,
      ],
    );
    let snapshotId = inserted.rows[0]?.id;
    if (!snapshotId) {
      const existing = await database.query<{ id: string }>(
        `select id from savings_chain_snapshots
          where chain_id = $1 and block_number = $2
            and manifest_version = $3 and calculation_version = $4`,
        [
          options.adapter.chainId,
          block.number.toString(),
          options.adapter.manifestVersion,
          calculationVersion,
        ],
      );
      snapshotId = existing.rows[0]?.id;
    }
    if (!snapshotId) throw new Error("Savings snapshot upsert lost its row");
    await database.query("commit");
    return {
      status: snapshotStatus,
      chainId: options.adapter.chainId,
      chainSlug: options.adapter.chainSlug,
      chainName: options.adapter.chainName,
      snapshotId,
      blockNumber: block.number.toString(),
      blockHash,
      blockTimestamp: blockTimestamp.toISOString(),
      finality: options.adapter.finality,
      state: {
        usdpTotalSupply: state.usdpTotalSupply.toString(),
        susdpTotalAssets: state.susdpTotalAssets.toString(),
        susdpActualAssets: state.susdpActualAssets.toString(),
        susdpTotalSupply: state.susdpTotalSupply.toString(),
        susdpPendingYield: pendingYield.toString(),
        susdpSharePriceUsdp: state.susdpSharePriceUsdp.toString(),
        susdpRate: state.susdpRate.toString(),
        susdpLastUpdate: state.susdpLastUpdate.toString(),
        susdpEstimatedApy: state.susdpEstimatedApy.toString(),
        susdpMaxRate: state.susdpMaxRate.toString(),
        susdpPauseState: state.susdpPauseState,
      },
      verification: {
        assetRelationshipVerified,
        implementationSlotsPresent,
        usdpImplementation: usdpImplementation.toLowerCase(),
        susdpImplementation: susdpImplementation.toLowerCase(),
      },
      manifestVersion: options.adapter.manifestVersion,
      calculationVersion,
    };
  } catch (error) {
    await database.query("rollback");
    throw error;
  } finally {
    database.release();
  }
}

interface LatestSavingsRow {
  id: string;
  chain_id: number;
  block_number: string;
  block_hash: string;
  block_timestamp: Date;
  snapshot_status: string;
  usdp_total_supply: string;
  susdp_total_supply: string;
  susdp_total_assets: string;
  susdp_actual_assets: string;
  susdp_pending_yield: string;
  susdp_share_price_usdp: string;
  susdp_estimated_apy: string;
  susdp_pause_state: number;
  manifest_version: string;
  calculation_version: string;
}

export interface SavingsAggregationComponent {
  snapshotId: string;
  chainId: number;
  blockTimestamp: Date;
  snapshotStatus: string;
  usdpTotalSupply: string;
  susdpTotalSupply: string;
  susdpTotalAssets: string;
  susdpEstimatedApy: string;
}

export function aggregateSavingsComponents(
  components: readonly SavingsAggregationComponent[],
  expectedChainIds: readonly number[],
  asOf: Date,
  maximumAgeSeconds: number,
) {
  const componentByChain = new Map(
    components.map((component) => [component.chainId, component]),
  );
  const missingChainIds = expectedChainIds.filter(
    (chainId) => !componentByChain.has(chainId),
  );
  const staleChainIds = components
    .filter((component) => {
      const age = Math.max(
        0,
        Math.floor(
          (asOf.getTime() - component.blockTimestamp.getTime()) / 1_000,
        ),
      );
      return age > maximumAgeSeconds || component.snapshotStatus === "invalid";
    })
    .map((component) => component.chainId);
  const included = components.filter(
    (component) => !staleChainIds.includes(component.chainId),
  );
  const includedChainIds = included.map((component) => component.chainId);
  const coverageStatus =
    included.length === expectedChainIds.length
      ? ("complete" as const)
      : included.length > 0
        ? ("partial" as const)
        : ("unavailable" as const);
  const usdpSupplyOnSavingsChains = included.reduce(
    (total, component) => total + BigInt(component.usdpTotalSupply),
    0n,
  );
  const susdpTotalAssets = included.reduce(
    (total, component) => total + BigInt(component.susdpTotalAssets),
    0n,
  );
  const susdpTotalSupply = included.reduce(
    (total, component) => total + BigInt(component.susdpTotalSupply),
    0n,
  );
  const weightedEstimatedApy =
    susdpTotalAssets === 0n
      ? null
      : included.reduce(
          (total, component) =>
            total +
            BigInt(component.susdpTotalAssets) *
              BigInt(component.susdpEstimatedApy),
          0n,
        ) / susdpTotalAssets;
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
              (asOf.getTime() - oldestComponentTimestamp.getTime()) / 1_000,
            ),
          ),
        );

  return {
    coverageStatus,
    included,
    includedChainIds,
    missingChainIds,
    staleChainIds,
    usdpSupplyOnSavingsChains,
    susdpTotalAssets,
    susdpTotalSupply,
    weightedEstimatedApy,
    oldestComponentTimestamp,
    newestComponentTimestamp,
    maximumComponentAgeSeconds,
  };
}

export async function createGlobalSavingsSnapshot(
  pool: Pool,
  maximumAgeSeconds: number,
) {
  const expectedChainIds = savingsChainAdapters.map(({ chainId }) => chainId);
  const result = await pool.query<LatestSavingsRow>(
    `select distinct on (scs.chain_id)
            scs.id, scs.chain_id, scs.block_number, scs.block_hash,
            scs.block_timestamp, scs.snapshot_status,
            us.total_supply as usdp_total_supply,
            ss.total_supply as susdp_total_supply,
            scs.susdp_total_assets, scs.susdp_actual_assets,
            scs.susdp_pending_yield, scs.susdp_share_price_usdp,
            scs.susdp_estimated_apy, scs.susdp_pause_state,
            scs.manifest_version, scs.calculation_version
       from savings_chain_snapshots scs
       join asset_chain_snapshots us on us.id = scs.usdp_snapshot_id
       join asset_chain_snapshots ss on ss.id = scs.susdp_snapshot_id
      where scs.chain_id = any($1::int[])
      order by scs.chain_id, scs.block_timestamp desc, scs.created_at desc`,
    [expectedChainIds],
  );
  const asOf = new Date();
  const components: SavingsAggregationComponent[] = result.rows.map((row) => ({
    snapshotId: row.id,
    chainId: row.chain_id,
    blockTimestamp: row.block_timestamp,
    snapshotStatus: row.snapshot_status,
    usdpTotalSupply: row.usdp_total_supply,
    susdpTotalSupply: row.susdp_total_supply,
    susdpTotalAssets: row.susdp_total_assets,
    susdpEstimatedApy: row.susdp_estimated_apy,
  }));
  const {
    coverageStatus,
    included,
    includedChainIds,
    missingChainIds,
    staleChainIds,
    usdpSupplyOnSavingsChains,
    susdpTotalAssets,
    susdpTotalSupply,
    weightedEstimatedApy,
    oldestComponentTimestamp,
    newestComponentTimestamp,
    maximumComponentAgeSeconds,
  } = aggregateSavingsComponents(
    components,
    expectedChainIds,
    asOf,
    maximumAgeSeconds,
  );

  const database = await pool.connect();
  try {
    await database.query("begin");
    const inserted = await database.query<{ id: string }>(
      `insert into global_savings_snapshots
        (as_of, expected_chain_count, included_chain_count, coverage_status,
         usdp_supply_on_savings_chains, susdp_total_assets,
         susdp_total_supply, susdp_weighted_estimated_apy,
         oldest_component_timestamp, newest_component_timestamp,
         maximum_component_age_seconds, included_chain_ids,
         missing_chain_ids, stale_chain_ids, calculation_version)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,
               $14::jsonb,$15)
       returning id`,
      [
        asOf,
        expectedChainIds.length,
        included.length,
        coverageStatus,
        usdpSupplyOnSavingsChains.toString(),
        susdpTotalAssets.toString(),
        susdpTotalSupply.toString(),
        weightedEstimatedApy?.toString() ?? null,
        oldestComponentTimestamp,
        newestComponentTimestamp,
        maximumComponentAgeSeconds?.toString() ?? null,
        JSON.stringify(includedChainIds),
        JSON.stringify(missingChainIds),
        JSON.stringify(staleChainIds),
        GLOBAL_SAVINGS_CALCULATION_VERSION,
      ],
    );
    const globalSnapshotId = inserted.rows[0]!.id;
    for (const component of included) {
      await database.query(
        `insert into global_savings_snapshot_components
          (global_snapshot_id, savings_snapshot_id, chain_id)
         values ($1,$2,$3)`,
        [globalSnapshotId, component.snapshotId, component.chainId],
      );
    }
    await database.query("commit");
    return {
      status: coverageStatus,
      globalSnapshotId,
      asOf: asOf.toISOString(),
      coverage: {
        expectedChainIds,
        includedChainIds,
        missingChainIds,
        staleChainIds,
        maximumAgeSeconds,
        oldestComponentTimestamp: oldestComponentTimestamp?.toISOString(),
        newestComponentTimestamp: newestComponentTimestamp?.toISOString(),
        maximumComponentAgeSeconds:
          maximumComponentAgeSeconds?.toString() ?? null,
      },
      usdp: {
        supplyOnSavingsChains: usdpSupplyOnSavingsChains.toString(),
        scope: "five_savings_chains_only" as const,
        globalSupplyStatus: "partial_until_24_chains" as const,
      },
      susdp: {
        totalAssetsUsdp: susdpTotalAssets.toString(),
        totalSupply: susdpTotalSupply.toString(),
        weightedEstimatedApy: weightedEstimatedApy?.toString() ?? null,
      },
      components: result.rows.map((row) => ({
        chainId: row.chain_id,
        chainSlug:
          savingsChainAdapters.find(
            (adapter) => adapter.chainId === row.chain_id,
          )?.chainSlug ?? "unknown",
        blockNumber: row.block_number,
        blockHash: row.block_hash,
        blockTimestamp: row.block_timestamp.toISOString(),
        status: row.snapshot_status,
        stale: staleChainIds.includes(row.chain_id),
        usdpTotalSupply: row.usdp_total_supply,
        susdpTotalAssets: row.susdp_total_assets,
        susdpActualAssets: row.susdp_actual_assets,
        susdpPendingYield: row.susdp_pending_yield,
        susdpTotalSupply: row.susdp_total_supply,
        susdpSharePriceUsdp: row.susdp_share_price_usdp,
        susdpEstimatedApy: row.susdp_estimated_apy,
        susdpPauseState: row.susdp_pause_state,
        manifestVersion: row.manifest_version,
        calculationVersion: row.calculation_version,
      })),
      calculationVersion: GLOBAL_SAVINGS_CALCULATION_VERSION,
    };
  } catch (error) {
    await database.query("rollback");
    throw error;
  } finally {
    database.release();
  }
}

export async function captureConfiguredSavingsSnapshots(
  pool: Pool,
  env: RuntimeEnv,
) {
  await syncParallelAssetRegistry(pool);
  const configured = configuredSavingsChainAdapters(env);
  const configuredRpcUrls = configured.map(({ rpcUrl }) => rpcUrl);
  const results = await Promise.all(
    configured.map(async (adapter) => {
      if (!adapter.rpcUrl)
        return {
          status: "unavailable" as const,
          chainId: adapter.chainId,
          chainSlug: adapter.chainSlug,
          reason: "rpc_not_configured" as const,
          rpcEnvKey: adapter.rpcEnvKey,
        };
      try {
        return await captureSavingsChainSnapshot({
          pool,
          adapter,
          rpcUrl: adapter.rpcUrl,
          finalityLag: env.FINALITY_LAG,
          requestIntervalMs: env.RPC_REQUEST_INTERVAL_MS,
        });
      } catch (error) {
        return {
          status: "unavailable" as const,
          chainId: adapter.chainId,
          chainSlug: adapter.chainSlug,
          reason: "snapshot_failed" as const,
          message: redactSecrets(
            providerErrorMessage(error),
            configuredRpcUrls,
          ),
        };
      }
    }),
  );
  const global = await createGlobalSavingsSnapshot(
    pool,
    env.GLOBAL_SNAPSHOT_MAX_AGE_SECONDS,
  );
  return { status: global.status, chains: results, global };
}
