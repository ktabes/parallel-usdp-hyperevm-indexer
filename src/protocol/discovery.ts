import {
  getAddress,
  isAddressEqual,
  keccak256,
  type Address,
  type Block,
  type Hex,
} from "viem";
import {
  createHyperevmClient,
  type HyperEvmClient,
} from "@/rpc/hyperevm-client";
import {
  chainlinkAggregatorAbi,
  ERC1967_IMPLEMENTATION_SLOT,
  erc20Abi,
  parallelizerAbi,
  savingsAbi,
} from "./abis";
import { calculatePendingYield } from "./savings-math";
import {
  expectedFacetAddresses,
  HYPEREVM_CHAIN_ID,
  hyperevmProtocol,
} from "./hyperevm";

export type DiscoveryBlock = "latest" | bigint;

export interface DiscoveryOptions {
  rpcUrl: string;
  block: DiscoveryBlock;
  finalityLag: number;
  minRequestIntervalMs?: number;
  providerName?: string;
  historicalRpcUrl?: string;
  historicalProviderName?: string;
  historicalMinRequestIntervalMs?: number;
}

interface Check {
  name: string;
  status: "pass" | "fail" | "warn";
  expected?: unknown;
  actual?: unknown;
  note?: string;
}

const stringify = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  );

export function implementationAddressFromSlot(
  value: Hex | undefined,
): Address | undefined {
  if (!value || value === "0x") return undefined;
  const rawAddress = `0x${value.slice(-40)}`;
  if (/^0x0{40}$/.test(rawAddress)) return undefined;
  return getAddress(rawAddress);
}

function checkAddress(name: string, expected: Address, actual: Address): Check {
  return {
    name,
    status: isAddressEqual(expected, actual) ? "pass" : "fail",
    expected,
    actual,
  };
}

function checkValue(name: string, expected: unknown, actual: unknown): Check {
  return {
    name,
    status: expected === actual ? "pass" : "fail",
    expected,
    actual,
  };
}

async function historicalStateProbe(client: HyperEvmClient) {
  const deploymentBlockNumber =
    hyperevmProtocol.contracts.susdp.deploymentBlock;
  const deploymentBlock = await client.getBlock({
    blockNumber: deploymentBlockNumber,
  });
  const reportedLastUpdate = await client.readContract({
    address: hyperevmProtocol.contracts.susdp.address,
    abi: savingsAbi,
    functionName: "lastUpdate",
    blockNumber: deploymentBlockNumber,
  });
  const honored = BigInt(reportedLastUpdate) <= deploymentBlock.timestamp;

  return {
    requestedBlock: deploymentBlockNumber,
    requestedBlockTimestamp: deploymentBlock.timestamp,
    reportedLastUpdate,
    honored,
    note: honored
      ? "Historical state response is temporally consistent with the requested block."
      : "Provider returned state newer than the requested block; historical eth_call is not honored.",
  };
}

async function contractCode(
  client: HyperEvmClient,
  address: Address,
  blockNumber?: bigint,
) {
  const bytecode = await client.getBytecode({ address, blockNumber });
  return {
    present: Boolean(bytecode && bytecode !== "0x"),
    bytes: bytecode ? (bytecode.length - 2) / 2 : 0,
    hash: bytecode && bytecode !== "0x" ? keccak256(bytecode) : undefined,
  };
}

async function discoverPriceFeed(
  client: HyperEvmClient,
  address: Address,
  blockNumber?: bigint,
) {
  const call = (
    functionName: "decimals" | "description" | "version" | "latestRoundData",
  ) =>
    client.readContract({
      address,
      abi: chainlinkAggregatorAbi,
      functionName,
      ...(blockNumber === undefined ? {} : { blockNumber }),
    } as never);
  const [code, decimals, description, version, round] = await Promise.all([
    contractCode(client, address, blockNumber),
    call("decimals"),
    call("description"),
    call("version"),
    call("latestRoundData"),
  ]);
  const [roundId, answer, startedAt, updatedAt, answeredInRound] =
    round as readonly [bigint, bigint, bigint, bigint, bigint];
  return {
    address,
    code,
    decimals,
    description,
    version,
    latestRound: { roundId, answer, startedAt, updatedAt, answeredInRound },
  };
}

export async function discoverProtocol(options: DiscoveryOptions) {
  const client = createHyperevmClient(options.rpcUrl, {
    minRequestIntervalMs: options.minRequestIntervalMs,
  });
  const historicalClient = options.historicalRpcUrl
    ? createHyperevmClient(options.historicalRpcUrl, {
        minRequestIntervalMs: options.historicalMinRequestIntervalMs,
      })
    : client;
  const chainId = await client.getChainId();
  const head = await client.getBlockNumber();
  const finalizedCandidate = head - BigInt(options.finalityLag);
  const requestedBlockNumber =
    options.block === "latest" ? undefined : options.block;
  const referenceBlock = (await client.getBlock(
    requestedBlockNumber === undefined
      ? { blockTag: "latest" }
      : { blockNumber: requestedBlockNumber },
  )) as Block;
  const callBlockNumber = requestedBlockNumber;
  const { usdp, susdp, parallelizer } = hyperevmProtocol.contracts;
  const { usdpUsd, susdpUsd } = hyperevmProtocol.priceFeeds;

  const read = <TAbi extends readonly unknown[]>(
    address: Address,
    abi: TAbi,
    functionName: string,
    args?: readonly unknown[],
  ) =>
    client.readContract({
      address,
      abi,
      functionName,
      args,
      ...(callBlockNumber === undefined
        ? {}
        : { blockNumber: callBlockNumber }),
    } as never);

  const [
    usdpCode,
    susdpCode,
    parallelizerCode,
    usdpImplementationSlot,
    susdpImplementationSlot,
    usdpName,
    usdpSymbol,
    usdpDecimals,
    usdpTotalSupply,
    susdpName,
    susdpSymbol,
    susdpDecimals,
    susdpAsset,
    susdpTotalAssets,
    susdpTotalSupply,
    susdpRate,
    susdpLastUpdate,
    susdpEstimatedApr,
    susdpMaxRate,
    susdpPaused,
    actualVaultBalance,
    parallelizerToken,
    collateralList,
    totalIssued,
    collateralRatio,
    facetAddresses,
    historyProbe,
    usdpUsdFeed,
    susdpUsdFeed,
  ] = await Promise.all([
    contractCode(client, usdp.address, callBlockNumber),
    contractCode(client, susdp.address, callBlockNumber),
    contractCode(client, parallelizer.address, callBlockNumber),
    client.getStorageAt({
      address: usdp.address,
      slot: ERC1967_IMPLEMENTATION_SLOT,
      ...(callBlockNumber === undefined
        ? {}
        : { blockNumber: callBlockNumber }),
    }),
    client.getStorageAt({
      address: susdp.address,
      slot: ERC1967_IMPLEMENTATION_SLOT,
      ...(callBlockNumber === undefined
        ? {}
        : { blockNumber: callBlockNumber }),
    }),
    read(usdp.address, erc20Abi, "name"),
    read(usdp.address, erc20Abi, "symbol"),
    read(usdp.address, erc20Abi, "decimals"),
    read(usdp.address, erc20Abi, "totalSupply"),
    read(susdp.address, savingsAbi, "name"),
    read(susdp.address, savingsAbi, "symbol"),
    read(susdp.address, savingsAbi, "decimals"),
    read(susdp.address, savingsAbi, "asset"),
    read(susdp.address, savingsAbi, "totalAssets"),
    read(susdp.address, savingsAbi, "totalSupply"),
    read(susdp.address, savingsAbi, "rate"),
    read(susdp.address, savingsAbi, "lastUpdate"),
    read(susdp.address, savingsAbi, "estimatedAPR"),
    read(susdp.address, savingsAbi, "maxRate"),
    read(susdp.address, savingsAbi, "paused"),
    read(usdp.address, erc20Abi, "balanceOf", [susdp.address]),
    read(parallelizer.address, parallelizerAbi, "tokenP"),
    read(parallelizer.address, parallelizerAbi, "getCollateralList"),
    read(parallelizer.address, parallelizerAbi, "getTotalIssued"),
    read(parallelizer.address, parallelizerAbi, "getCollateralRatio"),
    read(parallelizer.address, parallelizerAbi, "facetAddresses"),
    historicalStateProbe(historicalClient),
    discoverPriceFeed(client, usdpUsd.address, callBlockNumber),
    discoverPriceFeed(client, susdpUsd.address, callBlockNumber),
  ]);

  const usdpImplementation = implementationAddressFromSlot(
    usdpImplementationSlot,
  );
  const susdpImplementation = implementationAddressFromSlot(
    susdpImplementationSlot,
  );
  const actualFacets = facetAddresses as Address[];
  const collaterals = await Promise.all(
    (collateralList as Address[]).map(async (collateralAddress) => {
      const [code, name, symbol, decimals] = await Promise.all([
        contractCode(client, collateralAddress, callBlockNumber),
        read(collateralAddress, erc20Abi, "name"),
        read(collateralAddress, erc20Abi, "symbol"),
        read(collateralAddress, erc20Abi, "decimals"),
      ]);
      return { address: collateralAddress, code, name, symbol, decimals };
    }),
  );
  const totalAssets = BigInt(susdpTotalAssets as bigint);
  const shareSupply = BigInt(susdpTotalSupply as bigint);
  const derivedSusdpUsd =
    shareSupply === 0n
      ? undefined
      : (usdpUsdFeed.latestRound.answer * totalAssets) / shareSupply;
  const susdpOracleDifference =
    derivedSusdpUsd === undefined
      ? undefined
      : susdpUsdFeed.latestRound.answer > derivedSusdpUsd
        ? susdpUsdFeed.latestRound.answer - derivedSusdpUsd
        : derivedSusdpUsd - susdpUsdFeed.latestRound.answer;
  const susdpOracleDifferenceBps =
    derivedSusdpUsd && susdpOracleDifference !== undefined
      ? (susdpOracleDifference * 10_000n) / derivedSusdpUsd
      : undefined;
  const checks: Check[] = [
    checkValue("chain-id", HYPEREVM_CHAIN_ID, chainId),
    checkValue("usdp-code-present", true, usdpCode.present),
    checkValue("susdp-code-present", true, susdpCode.present),
    checkValue("parallelizer-code-present", true, parallelizerCode.present),
    checkValue("usdp-name", "USDp", usdpName),
    checkValue("usdp-symbol", "USDp", usdpSymbol),
    checkValue("usdp-decimals", 18, usdpDecimals),
    checkValue("susdp-name", "Staked USDp", susdpName),
    checkValue("susdp-symbol", "sUSDp", susdpSymbol),
    checkValue("susdp-decimals", 18, susdpDecimals),
    checkAddress("susdp-asset", usdp.address, susdpAsset as Address),
    checkAddress(
      "parallelizer-token",
      usdp.address,
      parallelizerToken as Address,
    ),
  ];

  if (usdpImplementation) {
    checks.push(
      checkAddress(
        "usdp-implementation",
        usdp.expectedImplementation,
        usdpImplementation,
      ),
    );
  } else {
    checks.push({
      name: "usdp-implementation",
      status: "fail",
      note: "Empty ERC-1967 slot",
    });
  }
  if (susdpImplementation) {
    checks.push(
      checkAddress(
        "susdp-implementation",
        susdp.expectedImplementation,
        susdpImplementation,
      ),
    );
  } else {
    checks.push({
      name: "susdp-implementation",
      status: "fail",
      note: "Empty ERC-1967 slot",
    });
  }

  const missingFacets = expectedFacetAddresses.filter(
    (expected) =>
      !actualFacets.some((actual) => isAddressEqual(expected, actual)),
  );
  checks.push({
    name: "parallelizer-facets",
    status: missingFacets.length === 0 ? "pass" : "fail",
    expected: expectedFacetAddresses,
    actual: actualFacets,
    note:
      missingFacets.length === 0
        ? undefined
        : `Missing ${missingFacets.join(", ")}`,
  });
  for (const [name, configured, discovered] of [
    ["usdp-usd", usdpUsd, usdpUsdFeed],
    ["susdp-usd", susdpUsd, susdpUsdFeed],
  ] as const) {
    const answer = discovered.latestRound.answer;
    const rawAgeSeconds =
      referenceBlock.timestamp - discovered.latestRound.updatedAt;
    const ageSeconds = rawAgeSeconds < 0n ? 0n : rawAgeSeconds;
    checks.push(
      checkValue(`${name}-feed-code-present`, true, discovered.code.present),
      {
        name: `${name}-feed-answer-positive`,
        status: answer > 0n ? "pass" : "fail",
        actual: answer,
      },
      {
        name: `${name}-feed-fresh`,
        status:
          rawAgeSeconds >= -30n && ageSeconds <= configured.maximumAgeSeconds
            ? "pass"
            : "warn",
        expected: `age <= ${configured.maximumAgeSeconds.toString()} seconds`,
        actual: ageSeconds,
      },
    );
  }
  checks.push({
    name: "susdp-usd-feed-vault-consistency",
    status:
      susdpOracleDifferenceBps !== undefined && susdpOracleDifferenceBps <= 1n
        ? "pass"
        : "warn",
    expected:
      "DIA sUSDp/USD within 1 bp of USDp/USD multiplied by vault share price",
    actual: susdpOracleDifferenceBps,
  });
  checks.push({
    name: "historical-state-honored",
    status: historyProbe.honored ? "pass" : "warn",
    actual: historyProbe.honored,
    note: historyProbe.note,
  });
  const primaryProviderVerifiedForPinnedReads =
    options.block === "latest" ||
    !options.historicalRpcUrl ||
    options.historicalRpcUrl === options.rpcUrl;
  if (options.block !== "latest") {
    checks.push({
      name: "pinned-read-provider-verified",
      status: primaryProviderVerifiedForPinnedReads ? "pass" : "warn",
      actual: primaryProviderVerifiedForPinnedReads,
      note: primaryProviderVerifiedForPinnedReads
        ? "The primary read provider also passed the deployment-block historical-state probe."
        : "The historical-state probe used a different provider, so the primary provider is not proven to honor pinned eth_call state.",
    });
  }

  const actualBalance = BigInt(actualVaultBalance as bigint);
  const pendingYield = calculatePendingYield(totalAssets, actualBalance);
  const failedChecks = checks.filter((check) => check.status === "fail");
  const warningChecks = checks.filter((check) => check.status === "warn");

  return stringify({
    schemaVersion: 1,
    manifestVersion: hyperevmProtocol.manifestVersion,
    status:
      failedChecks.length > 0
        ? "invalid"
        : warningChecks.length > 0
          ? "candidate"
          : "verified",
    generatedAt: new Date().toISOString(),
    source: hyperevmProtocol.officialSources,
    rpc: {
      provider: options.providerName ?? "configured",
      historicalProbeProvider:
        options.historicalProviderName ?? options.providerName ?? "configured",
      chainId,
      head,
      finalityLag: options.finalityLag,
      finalizedCandidate,
      requestedBlock: options.block,
      readConsistency:
        callBlockNumber === undefined
          ? "latest-unpinned"
          : historyProbe.honored && primaryProviderVerifiedForPinnedReads
            ? "pinned"
            : "pinned-requested-primary-provider-unverified",
      historicalStateProbe: historyProbe,
    },
    referenceBlock: {
      number: referenceBlock.number,
      hash: referenceBlock.hash,
      timestamp: referenceBlock.timestamp,
    },
    contracts: {
      usdp: {
        ...usdp,
        implementation: usdpImplementation,
        code: usdpCode,
        metadata: {
          name: usdpName,
          symbol: usdpSymbol,
          decimals: usdpDecimals,
          totalSupply: usdpTotalSupply,
        },
      },
      susdp: {
        ...susdp,
        implementation: susdpImplementation,
        code: susdpCode,
        state: {
          name: susdpName,
          symbol: susdpSymbol,
          decimals: susdpDecimals,
          asset: susdpAsset,
          totalAssets,
          totalSupply: susdpTotalSupply,
          actualAssetBalance: actualBalance,
          pendingYield,
          rate: susdpRate,
          lastUpdate: susdpLastUpdate,
          estimatedApr: susdpEstimatedApr,
          maxRate: susdpMaxRate,
          paused: susdpPaused,
        },
      },
      parallelizer: {
        ...parallelizer,
        code: parallelizerCode,
        tokenP: parallelizerToken,
        collateralList,
        collaterals,
        totalIssued,
        collateralRatio,
        facets: actualFacets,
      },
    },
    priceFeeds: {
      usdpUsd: {
        ...usdpUsd,
        ...usdpUsdFeed,
        ageSeconds:
          referenceBlock.timestamp < usdpUsdFeed.latestRound.updatedAt
            ? 0n
            : referenceBlock.timestamp - usdpUsdFeed.latestRound.updatedAt,
      },
      susdpUsd: {
        ...susdpUsd,
        ...susdpUsdFeed,
        ageSeconds:
          referenceBlock.timestamp < susdpUsdFeed.latestRound.updatedAt
            ? 0n
            : referenceBlock.timestamp - susdpUsdFeed.latestRound.updatedAt,
        vaultConsistency: {
          derivedFromUsdpUsdAndSharePrice: derivedSusdpUsd,
          absoluteDifference: susdpOracleDifference,
          differenceBps: susdpOracleDifferenceBps,
        },
      },
    },
    checks,
  });
}
