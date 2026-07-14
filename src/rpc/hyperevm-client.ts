import { createPublicClient, defineChain, http } from "viem";

export const hyperevm = defineChain({
  id: 999,
  name: "HyperEVM",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.hyperliquid.xyz/evm"] },
  },
});

export function createHyperevmClient(rpcUrl: string) {
  return createPublicClient({
    chain: hyperevm,
    transport: http(rpcUrl, {
      timeout: 20_000,
      retryCount: 2,
      retryDelay: 500,
    }),
  });
}

export type HyperEvmClient = ReturnType<typeof createHyperevmClient>;
