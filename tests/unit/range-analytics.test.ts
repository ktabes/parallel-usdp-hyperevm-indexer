import { describe, expect, it } from "vitest";
import {
  aggregateContiguousYieldIntervals,
  parseRangeAnalyticsRequest,
  type YieldInterval,
} from "@/analytics/range-analytics";

function interval(
  id: string,
  start: string,
  end: string,
  status: YieldInterval["reconciliationStatus"] = "verified",
): YieldInterval {
  return {
    id,
    chainId: 8453,
    windowStart: new Date(start),
    windowEnd: new Date(end),
    nativeYpo: "100",
    reconciliationStatus: status,
    calculationVersion: "test-v1",
  };
}

describe("range analytics request parsing", () => {
  it("parses presets, chain filters, and asset filters", () => {
    const result = parseRangeAnalyticsRequest(
      new URLSearchParams("range=30d&chains=base,ethereum&assets=usdp"),
    );
    expect(result).toMatchObject({
      preset: "30d",
      chainIds: [8453, 1],
      assetIds: ["usdp"],
    });
  });

  it("supports explicit custom timestamps and rejects partial ranges", () => {
    expect(
      parseRangeAnalyticsRequest(
        new URLSearchParams(
          "from=2026-07-01T00:00:00Z&to=2026-07-08T00:00:00Z",
        ),
      ).preset,
    ).toBe("custom");
    expect(() =>
      parseRangeAnalyticsRequest(
        new URLSearchParams("from=2026-07-01T00:00:00Z"),
      ),
    ).toThrow(/from and to/);
  });
});

describe("contiguous YPO interval aggregation", () => {
  const start = new Date("2026-07-01T00:00:00Z");
  const end = new Date("2026-07-15T00:00:00Z");

  it("sums verified adjacent intervals only when the full range is covered", () => {
    const result = aggregateContiguousYieldIntervals({
      intervals: [
        interval("one", "2026-07-01T00:00:00Z", "2026-07-08T00:00:00Z"),
        interval("two", "2026-07-08T00:02:00Z", "2026-07-15T00:00:00Z"),
      ],
      rangeStart: start,
      rangeEnd: end,
    });
    expect(result).toMatchObject({
      status: "verified",
      complete: true,
      verified: true,
      nativeYpo: 200n,
      intervalIds: ["one", "two"],
    });
  });

  it("keeps candidate intervals candidate and fails closed on gaps", () => {
    expect(
      aggregateContiguousYieldIntervals({
        intervals: [
          interval(
            "candidate",
            "2026-07-01T00:00:00Z",
            "2026-07-15T00:00:00Z",
            "candidate",
          ),
        ],
        rangeStart: start,
        rangeEnd: end,
      }).status,
    ).toBe("candidate");
    expect(
      aggregateContiguousYieldIntervals({
        intervals: [
          interval("one", "2026-07-01T00:00:00Z", "2026-07-07T00:00:00Z"),
          interval("two", "2026-07-08T00:00:00Z", "2026-07-15T00:00:00Z"),
        ],
        rangeStart: start,
        rangeEnd: end,
      }).status,
    ).toBe("unavailable");
  });
});
