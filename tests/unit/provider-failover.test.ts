import { describe, expect, it, vi } from "vitest";
import {
  isDailyRequestQuotaError,
  quotaResetSeconds,
  runWithProviderFailover,
  type RpcProviderCandidate,
} from "@/rpc/provider-failover";

const providers: RpcProviderCandidate[] = [
  {
    id: "primary",
    rpcUrl: "https://primary.example/secret",
    chunkSize: 5,
    requestIntervalMs: 250,
  },
  {
    id: "fallback",
    rpcUrl: "https://fallback.example",
    chunkSize: 50,
    requestIntervalMs: 1_500,
  },
];

describe("RPC provider failover", () => {
  it("recognizes daily quota exhaustion and optional reset headers", () => {
    expect(
      isDailyRequestQuotaError(
        new Error("daily request limit reached - upgrade your account"),
      ),
    ).toBe(true);
    expect(isDailyRequestQuotaError(new Error("429 Too Many Requests"))).toBe(
      false,
    );
    expect(
      quotaResetSeconds(
        new Error("x-ratelimit-remaining: 0\nx-ratelimit-reset: 43288"),
      ),
    ).toBe(43_288);
  });

  it("moves to the next provider only for a daily quota error", async () => {
    const onFailover = vi.fn();
    const operation = vi
      .fn<(provider: RpcProviderCandidate) => Promise<string>>()
      .mockRejectedValueOnce(
        new Error(
          "URL: https://primary.example/secret daily request limit reached",
        ),
      )
      .mockResolvedValueOnce("completed");

    await expect(
      runWithProviderFailover({ providers, operation, onFailover }),
    ).resolves.toBe("completed");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(onFailover).toHaveBeenCalledWith(
      expect.objectContaining({
        failedProviderId: "primary",
        nextProviderId: "fallback",
        reason: "daily-quota-exhausted",
      }),
    );
    expect(onFailover.mock.calls[0]![0].message).not.toContain("secret");
  });

  it("does not conceal fatal or ordinary short-term rate-limit failures", async () => {
    const fatal = new Error("invalid contract address");
    await expect(
      runWithProviderFailover({
        providers,
        operation: async () => {
          throw fatal;
        },
      }),
    ).rejects.toBe(fatal);

    const throttled = new Error("429 Too Many Requests");
    await expect(
      runWithProviderFailover({
        providers,
        operation: async () => {
          throw throttled;
        },
      }),
    ).rejects.toBe(throttled);
  });
});
