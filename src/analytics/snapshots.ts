import type { Pool, PoolClient } from "pg";
import type { Address, Hex } from "viem";
import { implementationAddressFromSlot } from "@/protocol/discovery";
import {
  chainlinkAggregatorAbi,
  ERC1967_IMPLEMENTATION_SLOT,
  erc20Abi,
  savingsAbi,
} from "@/protocol/abis";
import { hyperevmProtocol } from "@/protocol/hyperevm";
import { calculatePendingYield } from "@/protocol/savings-math";
import { createHyperevmClient } from "@/rpc/hyperevm-client";

export const VAULT_SNAPSHOT_CALCULATION_VERSION =
  "parallel-usdp-vault-snapshot-v1-candidate";

interface PriceRoundInput {
  roundId: bigint;
  answer: bigint;
  startedAt: bigint;
  updatedAt: bigint;
  answeredInRound: bigint;
  decimals: number;
  description: string;
}

export interface EvaluatedPriceRound {
  priceUsdAtomic: string;
  priceDecimals: number;
  stale: boolean;
  ageSeconds: string;
  metadata: {
    provider: "DIA";
    description: string;
    roundId: string;
    startedAt: string;
    updatedAt: string;
    answeredInRound: string;
    maximumAgeSeconds: string;
  };
}

export function evaluatePriceRound(
  round: PriceRoundInput,
  blockTimestamp: bigint,
  maximumAgeSeconds: bigint,
): EvaluatedPriceRound {
  if (round.answer <= 0n) throw new Error("Price feed answer must be positive");
  if (round.decimals < 0 || round.decimals > 36)
    throw new Error("Price feed decimals must be between 0 and 36");
  if (round.updatedAt > blockTimestamp + 30n)
    throw new Error("Price feed timestamp is ahead of the snapshot block");
  const ageSeconds =
    round.updatedAt > blockTimestamp ? 0n : blockTimestamp - round.updatedAt;
  return {
    priceUsdAtomic: round.answer.toString(),
    priceDecimals: round.decimals,
    stale: ageSeconds > maximumAgeSeconds,
    ageSeconds: ageSeconds.toString(),
    metadata: {
      provider: "DIA",
      description: round.description,
      roundId: round.roundId.toString(),
      startedAt: round.startedAt.toString(),
      updatedAt: round.updatedAt.toString(),
      answeredInRound: round.answeredInRound.toString(),
      maximumAgeSeconds: maximumAgeSeconds.toString(),
    },
  };
}

export interface CaptureVaultSnapshotOptions {
  pool: Pool;
  rpcUrl: string;
  finalityLag: number;
  requestIntervalMs?: number;
  blockNumber?: bigint;
  manifestVersion?: string;
  calculationVersion?: string;
}

async function insertPriceObservation(
  database: PoolClient,
  options: {
    assetAddress: Address;
    blockNumber: bigint;
    observedAt: Date;
    source: string;
    price: EvaluatedPriceRound;
    calculationVersion: string;
  },
) {
  const result = await database.query<{ id: string }>(
    `insert into price_observations
      (chain_id, asset_address, block_number, observed_at, price_usd_atomic,
       price_decimals, source, source_metadata, stale, calculation_version)
     values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
     on conflict (chain_id, asset_address, block_number, source) do update set
       observed_at = excluded.observed_at,
       price_usd_atomic = excluded.price_usd_atomic,
       price_decimals = excluded.price_decimals,
       source_metadata = excluded.source_metadata,
       stale = excluded.stale,
       calculation_version = excluded.calculation_version
     returning id`,
    [
      hyperevmProtocol.chainId,
      options.assetAddress.toLowerCase(),
      options.blockNumber.toString(),
      options.observedAt,
      options.price.priceUsdAtomic,
      options.price.priceDecimals,
      options.source,
      JSON.stringify({
        ...options.price.metadata,
        ageSeconds: options.price.ageSeconds,
      }),
      options.price.stale,
      options.calculationVersion,
    ],
  );
  return result.rows[0]!.id;
}

export async function captureVaultSnapshot(
  options: CaptureVaultSnapshotOptions,
) {
  const client = createHyperevmClient(options.rpcUrl, {
    minRequestIntervalMs: options.requestIntervalMs,
  });
  const head = await client.getBlockNumber();
  const finalizedHead = head - BigInt(options.finalityLag);
  const blockNumber = options.blockNumber ?? finalizedHead;
  if (blockNumber > finalizedHead)
    throw new Error(
      `Snapshot block ${blockNumber} exceeds finalized head ${finalizedHead}`,
    );
  const block = await client.getBlock({ blockNumber });
  if (!block.hash) throw new Error("Snapshot block is missing its hash");

  const read = (
    address: Address,
    abi: readonly unknown[],
    functionName: string,
    args?: readonly unknown[],
  ) =>
    client.readContract({
      address,
      abi,
      functionName,
      args,
      blockNumber,
    } as never);
  const readFeed = async (address: Address) => {
    const [decimals, description, round] = await Promise.all([
      read(address, chainlinkAggregatorAbi, "decimals"),
      read(address, chainlinkAggregatorAbi, "description"),
      read(address, chainlinkAggregatorAbi, "latestRoundData"),
    ]);
    const [roundId, answer, startedAt, updatedAt, answeredInRound] =
      round as readonly [bigint, bigint, bigint, bigint, bigint];
    return {
      roundId,
      answer,
      startedAt,
      updatedAt,
      answeredInRound,
      decimals: Number(decimals),
      description: String(description),
    };
  };
  const { usdp, susdp } = hyperevmProtocol.contracts;
  const [
    usdpTotalSupply,
    susdpTotalAssets,
    susdpActualAssets,
    susdpTotalSupply,
    susdpSharePrice,
    susdpRate,
    susdpLastUpdate,
    susdpEstimatedApr,
    susdpMaxRate,
    susdpPauseState,
    usdpImplementationSlot,
    susdpImplementationSlot,
    usdpPriceRound,
    susdpPriceRound,
  ] = await Promise.all([
    read(usdp.address, erc20Abi, "totalSupply"),
    read(susdp.address, savingsAbi, "totalAssets"),
    read(usdp.address, erc20Abi, "balanceOf", [susdp.address]),
    read(susdp.address, savingsAbi, "totalSupply"),
    read(susdp.address, savingsAbi, "convertToAssets", [10n ** 18n]),
    read(susdp.address, savingsAbi, "rate"),
    read(susdp.address, savingsAbi, "lastUpdate"),
    read(susdp.address, savingsAbi, "estimatedAPR"),
    read(susdp.address, savingsAbi, "maxRate"),
    read(susdp.address, savingsAbi, "paused"),
    client.getStorageAt({
      address: usdp.address,
      slot: ERC1967_IMPLEMENTATION_SLOT,
      blockNumber,
    }),
    client.getStorageAt({
      address: susdp.address,
      slot: ERC1967_IMPLEMENTATION_SLOT,
      blockNumber,
    }),
    readFeed(hyperevmProtocol.priceFeeds.usdpUsd.address),
    readFeed(hyperevmProtocol.priceFeeds.susdpUsd.address),
  ]);
  const totalAssets = BigInt(susdpTotalAssets as bigint);
  const actualAssets = BigInt(susdpActualAssets as bigint);
  const pendingYield = calculatePendingYield(totalAssets, actualAssets);
  const usdpImplementation = implementationAddressFromSlot(
    usdpImplementationSlot as Hex | undefined,
  );
  const susdpImplementation = implementationAddressFromSlot(
    susdpImplementationSlot as Hex | undefined,
  );
  if (!usdpImplementation || !susdpImplementation)
    throw new Error("Snapshot implementation slot is empty");
  const implementationDrift =
    usdpImplementation.toLowerCase() !==
      usdp.expectedImplementation.toLowerCase() ||
    susdpImplementation.toLowerCase() !==
      susdp.expectedImplementation.toLowerCase();
  const usdpPrice = evaluatePriceRound(
    usdpPriceRound,
    block.timestamp,
    hyperevmProtocol.priceFeeds.usdpUsd.maximumAgeSeconds,
  );
  const susdpPrice = evaluatePriceRound(
    susdpPriceRound,
    block.timestamp,
    hyperevmProtocol.priceFeeds.susdpUsd.maximumAgeSeconds,
  );
  const manifestVersion =
    options.manifestVersion ?? hyperevmProtocol.manifestVersion;
  const calculationVersion =
    options.calculationVersion ?? VAULT_SNAPSHOT_CALCULATION_VERSION;
  const observedAt = new Date(Number(block.timestamp) * 1_000);
  const snapshotStatus = implementationDrift ? "invalid" : "candidate";

  const database = await options.pool.connect();
  try {
    await database.query("begin");
    const existingBlock = await database.query<{ hash: string }>(
      `select hash from blocks where chain_id = $1 and number = $2`,
      [hyperevmProtocol.chainId, blockNumber.toString()],
    );
    if (
      existingBlock.rows[0] &&
      existingBlock.rows[0].hash.toLowerCase() !== block.hash.toLowerCase()
    )
      throw new Error(`Block hash drift at snapshot block ${blockNumber}`);
    await database.query(
      `insert into blocks
        (chain_id, number, hash, parent_hash, timestamp, finalized)
       values ($1,$2,$3,$4,$5,true)
       on conflict (chain_id, number) do nothing`,
      [
        hyperevmProtocol.chainId,
        blockNumber.toString(),
        block.hash.toLowerCase(),
        block.parentHash.toLowerCase(),
        observedAt,
      ],
    );
    const usdpPriceObservationId = await insertPriceObservation(database, {
      assetAddress: usdp.address,
      blockNumber,
      observedAt,
      source: "DIA",
      price: usdpPrice,
      calculationVersion,
    });
    const susdpPriceObservationId = await insertPriceObservation(database, {
      assetAddress: susdp.address,
      blockNumber,
      observedAt,
      source: "DIA",
      price: susdpPrice,
      calculationVersion,
    });
    const inserted = await database.query<{ id: string }>(
      `insert into vault_snapshots
        (chain_id, block_number, block_hash, block_timestamp, finalized,
         usdp_total_supply, susdp_total_assets, susdp_actual_assets,
         susdp_total_supply, susdp_pending_yield, susdp_share_price_usdp,
         susdp_rate, susdp_last_update, susdp_estimated_apr, susdp_max_rate,
         susdp_pause_state, usdp_implementation, susdp_implementation,
         usdp_price_observation_id, susdp_price_observation_id,
         snapshot_status, manifest_version, calculation_version)
       values ($1,$2,$3,$4,true,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
               $16,$17,$18,$19,$20,$21,$22)
       on conflict (chain_id, block_number, manifest_version, calculation_version)
       do nothing returning id`,
      [
        hyperevmProtocol.chainId,
        blockNumber.toString(),
        block.hash.toLowerCase(),
        observedAt,
        BigInt(usdpTotalSupply as bigint).toString(),
        totalAssets.toString(),
        actualAssets.toString(),
        BigInt(susdpTotalSupply as bigint).toString(),
        pendingYield.toString(),
        BigInt(susdpSharePrice as bigint).toString(),
        BigInt(susdpRate as bigint).toString(),
        BigInt(susdpLastUpdate as bigint).toString(),
        BigInt(susdpEstimatedApr as bigint).toString(),
        BigInt(susdpMaxRate as bigint).toString(),
        Number(susdpPauseState),
        usdpImplementation.toLowerCase(),
        susdpImplementation.toLowerCase(),
        usdpPriceObservationId,
        susdpPriceObservationId,
        snapshotStatus,
        manifestVersion,
        calculationVersion,
      ],
    );
    let snapshotId = inserted.rows[0]?.id;
    if (!snapshotId) {
      const existing = await database.query<{ id: string }>(
        `select id from vault_snapshots
          where chain_id = $1 and block_number = $2
            and manifest_version = $3 and calculation_version = $4`,
        [
          hyperevmProtocol.chainId,
          blockNumber.toString(),
          manifestVersion,
          calculationVersion,
        ],
      );
      snapshotId = existing.rows[0]!.id;
    }
    await database.query("commit");
    return {
      status: snapshotStatus,
      snapshotId,
      blockNumber: blockNumber.toString(),
      blockHash: block.hash.toLowerCase(),
      blockTimestamp: observedAt.toISOString(),
      finalizedHead: finalizedHead.toString(),
      state: {
        usdpTotalSupply: BigInt(usdpTotalSupply as bigint).toString(),
        susdpTotalAssets: totalAssets.toString(),
        susdpActualAssets: actualAssets.toString(),
        susdpTotalSupply: BigInt(susdpTotalSupply as bigint).toString(),
        susdpPendingYield: pendingYield.toString(),
        susdpSharePriceUsdp: BigInt(susdpSharePrice as bigint).toString(),
        susdpRate: BigInt(susdpRate as bigint).toString(),
        susdpLastUpdate: BigInt(susdpLastUpdate as bigint).toString(),
        susdpEstimatedApr: BigInt(susdpEstimatedApr as bigint).toString(),
        susdpMaxRate: BigInt(susdpMaxRate as bigint).toString(),
        susdpPauseState: Number(susdpPauseState),
      },
      implementations: {
        usdp: usdpImplementation.toLowerCase(),
        susdp: susdpImplementation.toLowerCase(),
        drift: implementationDrift,
      },
      prices: { usdp: usdpPrice, susdp: susdpPrice },
      manifestVersion,
      calculationVersion,
    };
  } catch (error) {
    await database.query("rollback");
    throw error;
  } finally {
    database.release();
  }
}
