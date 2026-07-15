import { createPublicClient, defineChain, http, type Transport } from "viem";

export const hyperevm = defineChain({
  id: 999,
  name: "HyperEVM",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.hyperliquid.xyz/evm"] },
  },
});

export interface HyperevmClientOptions {
  minRequestIntervalMs?: number;
  retryCount?: number;
}

function rateLimitedTransport(
  transport: Transport,
  minRequestIntervalMs: number,
): Transport {
  const limited = (config: Parameters<Transport>[0]) => {
    const base = transport(config);
    let nextStartAt = 0;

    return {
      ...base,
      request: async (args: Parameters<typeof base.request>[0]) => {
        const scheduledAt = Math.max(Date.now(), nextStartAt);
        nextStartAt = scheduledAt + minRequestIntervalMs;
        const delay = scheduledAt - Date.now();
        if (delay > 0)
          await new Promise<void>((resolve) => setTimeout(resolve, delay));
        return base.request(args);
      },
    };
  };

  return limited as unknown as Transport;
}

export function createHyperevmClient(
  rpcUrl: string,
  options: HyperevmClientOptions = {},
) {
  const transport = http(rpcUrl, {
    timeout: 20_000,
    retryCount: options.retryCount ?? 2,
    retryDelay: 500,
  });

  return createPublicClient({
    chain: hyperevm,
    transport:
      options.minRequestIntervalMs === undefined
        ? transport
        : rateLimitedTransport(transport, options.minRequestIntervalMs),
  });
}

export type HyperEvmClient = ReturnType<typeof createHyperevmClient>;
