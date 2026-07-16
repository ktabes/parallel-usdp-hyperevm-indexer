import { describe, expect, it } from "vitest";
import {
  lifetimeProgressPercent,
  lifetimePublicationStatus,
} from "@/analytics/dashboard-readiness";

describe("dashboard lifetime readiness", () => {
  it("reports inclusive checkpoint progress without exceeding 100%", () => {
    expect(lifetimeProgressPercent(100n, 199n, null)).toBe(0);
    expect(lifetimeProgressPercent(100n, 199n, 150n)).toBe(50);
    expect(lifetimeProgressPercent(100n, 199n, 200n)).toBe(100);
    expect(lifetimeProgressPercent(100n, 199n, 250n)).toBe(100);
  });

  it("publishes only after both asset aggregates exist", () => {
    expect(
      lifetimePublicationStatus({
        nextBlock: null,
        goalBlock: 199n,
        publishedAssets: 0,
      }),
    ).toBe("not_started");
    expect(
      lifetimePublicationStatus({
        nextBlock: 150n,
        goalBlock: 199n,
        publishedAssets: 0,
      }),
    ).toBe("indexing");
    expect(
      lifetimePublicationStatus({
        nextBlock: 200n,
        goalBlock: 199n,
        publishedAssets: 0,
      }),
    ).toBe("deriving");
    expect(
      lifetimePublicationStatus({
        nextBlock: 200n,
        goalBlock: 199n,
        publishedAssets: 2,
      }),
    ).toBe("published");
  });

  it("labels a completed bounded window without implying lifetime coverage", () => {
    expect(
      lifetimePublicationStatus({
        nextBlock: 200n,
        goalBlock: 199n,
        publishedAssets: 0,
        coverageKind: "window",
      }),
    ).toBe("window_only");
  });
});
