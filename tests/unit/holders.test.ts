import { describe, expect, it } from "vitest";

import {
  replayHolderTransfers,
  ZERO_ADDRESS,
  type TransferReplayEvent,
} from "../../src/analytics/holders";

const alice = "0x1111111111111111111111111111111111111111";
const bob = "0x2222222222222222222222222222222222222222";

function event(
  input: Partial<TransferReplayEvent> &
    Pick<
      TransferReplayEvent,
      "assetId" | "blockNumber" | "from" | "to" | "value"
    >,
): TransferReplayEvent {
  return {
    blockTimestamp: new Date(Number(input.blockNumber) * 1_000),
    logIndex: 0,
    ...input,
  };
}

describe("lifetime holder replay", () => {
  it("replays mint, peer transfer, and burn without counting the zero address", () => {
    const result = replayHolderTransfers(
      [
        event({
          assetId: "usdp",
          blockNumber: 1n,
          from: ZERO_ADDRESS,
          to: alice,
          value: 100n,
        }),
        event({
          assetId: "usdp",
          blockNumber: 2n,
          from: alice,
          to: bob,
          value: 40n,
        }),
        event({
          assetId: "usdp",
          blockNumber: 3n,
          from: bob,
          to: ZERO_ADDRESS,
          value: 10n,
        }),
      ],
      { start: new Date(0), end: new Date(3_000) },
    );

    expect(result.balances).toEqual([
      expect.objectContaining({
        holderAddress: alice,
        balance: 60n,
        firstPositiveBlock: 1n,
      }),
      expect.objectContaining({
        holderAddress: bob,
        balance: 30n,
        firstPositiveBlock: 2n,
      }),
    ]);
    expect(
      result.balances.some((row) => row.holderAddress === ZERO_ADDRESS),
    ).toBe(false);
    expect(result.activity[0]).toMatchObject({
      assetId: "usdp",
      transferVolume: 40n,
      mintedVolume: 100n,
      burnedVolume: 10n,
      transferCount: 1,
      uniqueSenders: 2,
      uniqueReceivers: 2,
      uniqueParticipants: 2,
      newHolders: 2,
      activeHolders: 2,
    });
  });

  it("counts a returning holder only once", () => {
    const result = replayHolderTransfers(
      [
        event({
          assetId: "susdp",
          blockNumber: 1n,
          from: ZERO_ADDRESS,
          to: alice,
          value: 10n,
        }),
        event({
          assetId: "susdp",
          blockNumber: 2n,
          from: alice,
          to: bob,
          value: 10n,
        }),
        event({
          assetId: "susdp",
          blockNumber: 3n,
          from: bob,
          to: alice,
          value: 2n,
        }),
      ],
      { start: new Date(0), end: new Date(3_000) },
    );
    expect(result.activity[1]).toMatchObject({
      assetId: "susdp",
      newHolders: 2,
      activeHolders: 2,
    });
  });

  it("rejects an incomplete replay that creates a negative balance", () => {
    expect(() =>
      replayHolderTransfers(
        [
          event({
            assetId: "usdp",
            blockNumber: 10n,
            from: alice,
            to: bob,
            value: 1n,
          }),
        ],
        { start: new Date(0), end: new Date(10_000) },
      ),
    ).toThrow("became negative at block 10");
  });
});
