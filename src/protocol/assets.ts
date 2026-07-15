import { getAddress, type Address } from "viem";

export type ParallelAssetId = "usdp" | "susdp";
export type ParallelChainTier = "savings" | "distribution";
export type AdapterStatus = "verified" | "planned";

export interface ParallelChainDeployment {
  assetId: ParallelAssetId;
  chainId: number;
  chainSlug: string;
  chainName: string;
  address: Address;
  tier: ParallelChainTier;
  adapterStatus: AdapterStatus;
}

const officialProductSource =
  "https://docs.parallel.best/products/parallel-v3/stablecoins-and-savings/usdp-and-susdp";

const address = (value: string) => getAddress(value.toLowerCase()) as Address;

const usdp = (
  chainId: number,
  chainSlug: string,
  chainName: string,
  value: string,
  tier: ParallelChainTier,
): ParallelChainDeployment => ({
  assetId: "usdp",
  chainId,
  chainSlug,
  chainName,
  address: address(value),
  tier,
  adapterStatus: chainId === 999 ? "verified" : "planned",
});

const susdp = (
  chainId: number,
  chainSlug: string,
  chainName: string,
  value: string,
): ParallelChainDeployment => ({
  assetId: "susdp",
  chainId,
  chainSlug,
  chainName,
  address: address(value),
  tier: "savings",
  adapterStatus: chainId === 999 ? "verified" : "planned",
});

/**
 * Canonical cross-chain product registry.
 *
 * Addresses are sourced from Parallel's product documentation. A registry row
 * identifies a chain deployment of an asset; it does not imply that the chain
 * adapter or its historical coverage has been verified.
 */
export const usdpDeployments = [
  usdp(
    1,
    "ethereum",
    "Ethereum",
    "0x9B3a8f7CEC208e247d97dEE13313690977e24459",
    "savings",
  ),
  usdp(
    8453,
    "base",
    "Base",
    "0x76A9A0062ec6712b99B4f63bD2b4270185759dd5",
    "savings",
  ),
  usdp(
    146,
    "sonic",
    "Sonic",
    "0x08417cdb7F52a5021bB4eb6E0deAf3f295c3f182",
    "savings",
  ),
  usdp(
    999,
    "hyperevm",
    "HyperEVM",
    "0xbe65f0f410a72bec163dc65d46c83699e957d588",
    "savings",
  ),
  usdp(
    43114,
    "avalanche",
    "Avalanche",
    "0x9eE1963f05553eF838604Dd39403be21ceF26AA4",
    "savings",
  ),
  usdp(
    137,
    "polygon",
    "Polygon",
    "0x1250304F66404cd153fA39388DDCDAec7E0f1707",
    "distribution",
  ),
  usdp(
    42161,
    "arbitrum",
    "Arbitrum",
    "0x76A9A0062ec6712b99B4f63bD2b4270185759dd5",
    "distribution",
  ),
  usdp(
    10,
    "optimism",
    "Optimism",
    "0x90337e484B1Cb02132fc150d3Afa262147348545",
    "distribution",
  ),
  usdp(
    1329,
    "sei",
    "Sei",
    "0x048C4e07D170eEdEE8772cA76AEE1C4e2D133d5c",
    "distribution",
  ),
  usdp(
    56,
    "bsc",
    "BNB Smart Chain",
    "0x048C4e07D170eEdEE8772cA76AEE1C4e2D133d5c",
    "distribution",
  ),
  usdp(
    80094,
    "berachain",
    "Berachain",
    "0x9eE1963f05553eF838604Dd39403be21ceF26AA4",
    "distribution",
  ),
  usdp(
    534352,
    "scroll",
    "Scroll",
    "0x9eE1963f05553eF838604Dd39403be21ceF26AA4",
    "distribution",
  ),
  usdp(
    100,
    "gnosis",
    "Gnosis",
    "0x9eE1963f05553eF838604Dd39403be21ceF26AA4",
    "distribution",
  ),
  usdp(
    130,
    "unichain",
    "Unichain",
    "0x9eE1963f05553eF838604Dd39403be21ceF26AA4",
    "distribution",
  ),
  usdp(
    57073,
    "ink",
    "Ink",
    "0x9eE1963f05553eF838604Dd39403be21ceF26AA4",
    "distribution",
  ),
  usdp(
    239,
    "tac",
    "TAC",
    "0x4DeF531c3060686948f00EcC7504f2E0b71EDa14",
    "distribution",
  ),
  usdp(
    59144,
    "linea",
    "Linea",
    "0x8fCf9118fdD359f6277cDd143c2Da206e64140F3",
    "distribution",
  ),
  usdp(
    196,
    "x-layer",
    "X Layer",
    "0x8fCf9118fdD359f6277cDd143c2Da206e64140F3",
    "distribution",
  ),
  usdp(
    98866,
    "plume",
    "Plume",
    "0x8fCf9118fdD359f6277cDd143c2Da206e64140F3",
    "distribution",
  ),
  usdp(
    9745,
    "plasma",
    "Plasma",
    "0xC2f8B5d893217462aE9c9879c9285A5a3AAbcb8F",
    "distribution",
  ),
  usdp(
    747474,
    "katana",
    "Katana",
    "0x8fCf9118fdD359f6277cDd143c2Da206e64140F3",
    "distribution",
  ),
  usdp(
    252,
    "fraxtal",
    "Fraxtal",
    "0x8fCf9118fdD359f6277cDd143c2Da206e64140F3",
    "distribution",
  ),
  usdp(
    480,
    "world-chain",
    "World Chain",
    "0x8fCf9118fdD359f6277cDd143c2Da206e64140F3",
    "distribution",
  ),
  usdp(
    43111,
    "hemi",
    "Hemi",
    "0x8fCf9118fdD359f6277cDd143c2Da206e64140F3",
    "distribution",
  ),
] as const;

export const susdpDeployments = [
  susdp(
    1,
    "ethereum",
    "Ethereum",
    "0x0d45b129dc868963025db79a9074ea9c9e32cae4",
  ),
  susdp(8453, "base", "Base", "0x472ed57b376fe400259fb28e5c46eb53f0e3e7e7"),
  susdp(146, "sonic", "Sonic", "0xe8a3da6f5ed1cf04c58ac7f6a7383641e877517b"),
  susdp(
    999,
    "hyperevm",
    "HyperEVM",
    "0x9b3a8f7cec208e247d97dee13313690977e24459",
  ),
  susdp(
    43114,
    "avalanche",
    "Avalanche",
    "0x9d92c21205383651610f90722131655a5b8ed3e0",
  ),
] as const;

export const parallelAssetRegistry = {
  source: officialProductSource,
  sourceCheckedAt: "2026-07-15",
  assets: {
    usdp: {
      id: "usdp",
      symbol: "USDp",
      name: "Parallel USDp",
      kind: "stablecoin",
      decimals: 18,
      deployments: usdpDeployments,
    },
    susdp: {
      id: "susdp",
      symbol: "sUSDp",
      name: "Staked USDp",
      kind: "erc4626-savings-token",
      decimals: 18,
      underlyingAssetId: "usdp",
      deployments: susdpDeployments,
    },
  },
} as const;

export function findParallelDeployment(
  assetId: ParallelAssetId,
  chainId: number,
): ParallelChainDeployment | undefined {
  const deployments = assetId === "usdp" ? usdpDeployments : susdpDeployments;
  return deployments.find((deployment) => deployment.chainId === chainId);
}
