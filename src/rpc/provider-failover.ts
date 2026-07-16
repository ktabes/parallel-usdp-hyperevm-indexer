import { providerErrorMessage } from "./errors";

export interface RpcProviderCandidate {
  id: string;
  rpcUrl: string;
  chunkSize: number;
  requestIntervalMs: number;
}

export interface RpcProviderFailoverEvent {
  failedProviderId: string;
  nextProviderId: string;
  reason: "daily-quota-exhausted";
  message: string;
}

export function isDailyRequestQuotaError(error: unknown) {
  const message = (error instanceof Error ? error.message : String(error))
    .toLowerCase()
    .replaceAll("_", " ");
  return (
    message.includes("daily request limit") ||
    message.includes("daily requests limit") ||
    message.includes("daily quota") ||
    (message.includes("x-ratelimit-remaining") && message.includes("0"))
  );
}

export function quotaResetSeconds(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/x-ratelimit-reset\s*:\s*(\d+)/i);
  if (!match?.[1]) return undefined;
  const seconds = Number(match[1]);
  return Number.isSafeInteger(seconds) && seconds >= 0 ? seconds : undefined;
}

export async function runWithProviderFailover<T>(options: {
  providers: readonly RpcProviderCandidate[];
  operation: (provider: RpcProviderCandidate) => Promise<T>;
  onFailover?: (event: RpcProviderFailoverEvent) => void;
}) {
  if (options.providers.length === 0)
    throw new Error("At least one RPC provider is required");

  for (let index = 0; index < options.providers.length; index += 1) {
    const provider = options.providers[index]!;
    try {
      return await options.operation(provider);
    } catch (error) {
      const nextProvider = options.providers[index + 1];
      if (!nextProvider || !isDailyRequestQuotaError(error)) throw error;
      options.onFailover?.({
        failedProviderId: provider.id,
        nextProviderId: nextProvider.id,
        reason: "daily-quota-exhausted",
        message: providerErrorMessage(error),
      });
    }
  }

  throw new Error("RPC provider failover ended without a result");
}
