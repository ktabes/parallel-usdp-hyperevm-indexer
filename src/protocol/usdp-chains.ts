import type { Chain } from "viem";
import {
  arbitrum,
  avalanche,
  base,
  berachain,
  bsc,
  fraxtal,
  gnosis,
  hemi,
  ink,
  katana,
  linea,
  mainnet,
  optimism,
  plasma,
  plumeMainnet,
  polygon,
  scroll,
  sei,
  sonic,
  tac,
  unichain,
  worldchain,
  xLayer,
} from "viem/chains";
import type { RuntimeEnv } from "@/config/env";
import { hyperevm } from "@/rpc/hyperevm-client";
import { usdpDeployments, type ParallelChainDeployment } from "./assets";

export type SupplyFinality = "rpc-finalized" | "confirmation-lag";
export type SupplyRpcSource =
  "chain-override" | "savings-chain-override" | "public-default";

export interface UsdpSupplyAdapter {
  chain: Chain;
  deployment: ParallelChainDeployment;
  finality: SupplyFinality;
  manifestVersion: string;
}

const chains = [
  mainnet,
  base,
  sonic,
  hyperevm,
  avalanche,
  polygon,
  arbitrum,
  optimism,
  sei,
  bsc,
  berachain,
  scroll,
  gnosis,
  unichain,
  ink,
  tac,
  linea,
  xLayer,
  plumeMainnet,
  plasma,
  katana,
  fraxtal,
  worldchain,
  hemi,
] as const;

const chainById = new Map<number, Chain>(
  chains.map((chain) => [chain.id, chain]),
);

export const usdpSupplyAdapters = usdpDeployments.map((deployment) => {
  const chain = chainById.get(deployment.chainId);
  if (!chain)
    throw new Error(`Missing viem chain definition for ${deployment.chainId}`);
  return {
    chain,
    deployment,
    finality:
      deployment.chainId === 999
        ? ("confirmation-lag" as const)
        : ("rpc-finalized" as const),
    manifestVersion: `${deployment.chainSlug}-usdp-supply-v1-candidate`,
  };
});

const savingsRpc = (env: RuntimeEnv, chainId: number) => {
  switch (chainId) {
    case 1:
      return env.ETHEREUM_RPC_URL;
    case 8453:
      return env.BASE_RPC_URL;
    case 146:
      return env.SONIC_RPC_URL;
    case 999:
      return env.HYPEREVM_RPC_URL;
    case 43114:
      return env.AVALANCHE_RPC_URL;
    default:
      return undefined;
  }
};

export const publicSupplyRpcUrls = (adapter: UsdpSupplyAdapter) => {
  // viem's current Ethereum default rejects unauthenticated requests. dRPC is
  // already the project's bounded public Ethereum log source.
  if (adapter.chain.id === 1) return ["https://eth.drpc.org"];
  const rpcUrl = adapter.chain.rpcUrls.default.http[0];
  if (!rpcUrl)
    throw new Error(`No public RPC registered for chain ${adapter.chain.id}`);
  if (adapter.chain.id === 56)
    return [
      ...new Set([
        rpcUrl,
        "https://bsc-dataseed.bnbchain.org",
        "https://bsc-dataseed-public.bnbchain.org",
      ]),
    ];
  return [rpcUrl];
};

export function configuredUsdpSupplyAdapters(env: RuntimeEnv) {
  return usdpSupplyAdapters.map((adapter) => {
    const explicit = env.USDP_CHAIN_RPC_URLS?.[String(adapter.chain.id)];
    const savings = savingsRpc(env, adapter.chain.id);
    const publicUrls = publicSupplyRpcUrls(adapter);
    const rpcUrls = explicit ? [explicit] : savings ? [savings] : publicUrls;
    const rpcSource = explicit
      ? ("chain-override" as const)
      : savings
        ? ("savings-chain-override" as const)
        : ("public-default" as const);
    return {
      ...adapter,
      rpcUrl: rpcUrls[0]!,
      rpcUrls,
      rpcSource,
    };
  });
}
