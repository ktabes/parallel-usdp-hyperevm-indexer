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
}

function rateLimitedTransport(
  transport: Transport,
  minRequestIntervalMs: number,
): Transport {
  const limited = (config: Parameters<Transport>[0]) => {
    const base = transport(config);
    let queue = Promise.resolve();

    return {
      ...base,
      request: (args: Parameters<typeof base.request>[0]) => {
        const request = queue.then(() => base.request(args));
        queue = request
          .catch(() => undefined)
          .then(
            () =>
              new Promise<void>((resolve) =>
                setTimeout(resolve, minRequestIntervalMs),
              ),
          );
        return request;
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
    retryCount: 2,
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
