import type { Chain } from "viem";
import { avalanche, base, mainnet, sonic } from "viem/chains";
import type { RuntimeEnv } from "@/config/env";
import { findParallelDeployment, type ParallelChainDeployment } from "./assets";
import { hyperevm } from "@/rpc/hyperevm-client";

export type SavingsRpcEnvKey =
  | "ETHEREUM_RPC_URL"
  | "BASE_RPC_URL"
  | "SONIC_RPC_URL"
  | "HYPEREVM_RPC_URL"
  | "AVALANCHE_RPC_URL";

export interface SavingsChainAdapter {
  chain: Chain;
  chainId: number;
  chainSlug: string;
  chainName: string;
  rpcEnvKey: SavingsRpcEnvKey;
  finality: "rpc-finalized" | "confirmation-lag";
  usdp: ParallelChainDeployment;
  susdp: ParallelChainDeployment;
  manifestVersion: string;
}

function adapter(
  chain: Chain,
  rpcEnvKey: SavingsRpcEnvKey,
  finality: SavingsChainAdapter["finality"],
): SavingsChainAdapter {
  const usdp = findParallelDeployment("usdp", chain.id);
  const susdp = findParallelDeployment("susdp", chain.id);
  if (!usdp || !susdp)
    throw new Error(
      `Missing savings deployment registry for chain ${chain.id}`,
    );
  return {
    chain,
    chainId: chain.id,
    chainSlug: usdp.chainSlug,
    chainName: usdp.chainName,
    rpcEnvKey,
    finality,
    usdp,
    susdp,
    manifestVersion: `${usdp.chainSlug}-usdp-susdp-state-v1-candidate`,
  };
}

export const savingsChainAdapters = [
  adapter(mainnet, "ETHEREUM_RPC_URL", "rpc-finalized"),
  adapter(base, "BASE_RPC_URL", "rpc-finalized"),
  adapter(sonic, "SONIC_RPC_URL", "rpc-finalized"),
  adapter(hyperevm, "HYPEREVM_RPC_URL", "confirmation-lag"),
  adapter(avalanche, "AVALANCHE_RPC_URL", "rpc-finalized"),
] as const;

export function configuredSavingsChainAdapters(env: RuntimeEnv) {
  return savingsChainAdapters.map((chainAdapter) => ({
    ...chainAdapter,
    rpcUrl: env[chainAdapter.rpcEnvKey],
  }));
}
