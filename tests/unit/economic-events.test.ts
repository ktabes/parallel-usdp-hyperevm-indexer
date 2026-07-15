import { describe, expect, it } from "vitest";
import {
  aggregateNativeFlows,
  classifyProtocolTransactions,
  summarizeFlowParticipants,
  type ProtocolEventInput,
} from "@/analytics/economic-events";
import { hyperevmProtocol } from "@/protocol/hyperevm";

const zero = "0x0000000000000000000000000000000000000000";
const alice = "0x1111111111111111111111111111111111111111";
const router = "0x2222222222222222222222222222222222222222";
const bob = "0x3333333333333333333333333333333333333333";
const collateral = "0x4444444444444444444444444444444444444444";

function event(
  overrides: Partial<ProtocolEventInput> &
    Pick<ProtocolEventInput, "contractRole" | "eventName" | "payload">,
): ProtocolEventInput {
  return {
    id: overrides.id ?? "1",
    chainId: 999,
    blockNumber: overrides.blockNumber ?? "100",
    blockTimestamp:
      overrides.blockTimestamp ?? new Date("2026-07-15T10:30:00.000Z"),
    transactionHash:
      overrides.transactionHash ??
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    logIndex: overrides.logIndex ?? 0,
    contractRole: overrides.contractRole,
    eventName: overrides.eventName,
    payload: overrides.payload,
  };
}

describe("Phase 3 economic-event classification", () => {
  it("counts a deposit once while retaining linked transfer evidence", () => {
    const classified = classifyProtocolTransactions([
      event({
        id: "1",
        logIndex: 1,
        contractRole: "usdp-token",
        eventName: "Transfer",
        payload: {
          from: router,
          to: hyperevmProtocol.contracts.susdp.address,
          value: "1000",
        },
      }),
      event({
        id: "2",
        logIndex: 2,
        contractRole: "susdp-savings",
        eventName: "Transfer",
        payload: { from: zero, to: alice, value: "950" },
      }),
      event({
        id: "3",
        logIndex: 3,
        contractRole: "susdp-savings",
        eventName: "Deposit",
        payload: {
          sender: router,
          owner: alice,
          assets: "1000",
          shares: "950",
        },
      }),
    ]);

    expect(classified.map((item) => item.classification)).toEqual([
      "usdp_transfer",
      "susdp_transfer",
      "susdp_deposited",
    ]);
    expect(classified.every((item) => item.transactionEventCount === 3)).toBe(
      true,
    );
    expect(aggregateNativeFlows(classified, "hour")).toMatchObject([
      {
        metric: "susdp_deposited",
        amountBaseUnits: "1000",
        eventCount: 1,
        uniqueParticipants: 1,
      },
    ]);
  });

  it("does not mistake an accrual mint or ordinary transfer for user flow", () => {
    const classified = classifyProtocolTransactions([
      event({
        id: "1",
        logIndex: 1,
        contractRole: "usdp-token",
        eventName: "Transfer",
        payload: {
          from: zero,
          to: hyperevmProtocol.contracts.susdp.address,
          value: "42",
        },
      }),
      event({
        id: "2",
        logIndex: 2,
        contractRole: "susdp-savings",
        eventName: "Accrued",
        payload: { interest: "42" },
      }),
      event({
        id: "3",
        transactionHash:
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        contractRole: "susdp-savings",
        eventName: "Transfer",
        payload: { from: alice, to: bob, value: "7" },
      }),
    ]);

    expect(classified.map((item) => item.classification)).toEqual([
      "usdp_transfer",
      "susdp_accrued",
      "susdp_transfer",
    ]);
    expect(aggregateNativeFlows(classified, "day")).toEqual([]);
  });

  it("uses authoritative Parallelizer events for issue, burn, and redemption", () => {
    const usdp = hyperevmProtocol.contracts.usdp.address;
    const classified = classifyProtocolTransactions([
      event({
        id: "1",
        transactionHash:
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        contractRole: "usdp-parallelizer",
        eventName: "Swap",
        payload: {
          tokenIn: collateral,
          tokenOut: usdp,
          amountIn: "500",
          amountOut: "490",
          from: alice,
          to: alice,
        },
      }),
      event({
        id: "2",
        transactionHash:
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        contractRole: "usdp-parallelizer",
        eventName: "Swap",
        payload: {
          tokenIn: usdp,
          tokenOut: collateral,
          amountIn: "200",
          amountOut: "190",
          from: alice,
          to: alice,
        },
      }),
      event({
        id: "3",
        transactionHash:
          "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        contractRole: "usdp-parallelizer",
        eventName: "Redeemed",
        payload: {
          amount: "100",
          tokens: [collateral],
          amounts: ["95"],
          forfeitTokens: [],
          from: bob,
          to: bob,
        },
      }),
    ]);

    expect(
      classified.map((item) => [item.classification, item.amountBaseUnits]),
    ).toEqual([
      ["usdp_issued", "490"],
      ["usdp_burned_for_collateral", "200"],
      ["usdp_redeemed", "100"],
    ]);
  });

  it("sums exact integers and deduplicates owners rather than routers", () => {
    const first = classifyProtocolTransactions([
      event({
        id: "1",
        contractRole: "susdp-savings",
        eventName: "Deposit",
        payload: {
          sender: router,
          owner: alice,
          assets: "900719925474099300000",
          shares: "1",
        },
      }),
      event({
        id: "2",
        logIndex: 1,
        contractRole: "susdp-savings",
        eventName: "Deposit",
        payload: { sender: bob, owner: alice, assets: "7", shares: "1" },
      }),
      event({
        id: "3",
        logIndex: 2,
        contractRole: "susdp-savings",
        eventName: "Withdraw",
        payload: {
          sender: router,
          receiver: bob,
          owner: alice,
          assets: "3",
          shares: "1",
        },
      }),
    ]);

    expect(aggregateNativeFlows(first, "hour")).toMatchObject([
      {
        metric: "susdp_deposited",
        amountBaseUnits: "900719925474099300007",
        eventCount: 2,
        uniqueParticipants: 1,
      },
      {
        metric: "susdp_withdrawn",
        amountBaseUnits: "3",
        eventCount: 1,
        uniqueParticipants: 1,
      },
    ]);
    expect(summarizeFlowParticipants(first)).toEqual({
      uniqueDepositors: 1,
      uniqueWithdrawers: 1,
    });
  });

  it("fails closed when an authoritative event amount is malformed", () => {
    expect(() =>
      classifyProtocolTransactions([
        event({
          contractRole: "susdp-savings",
          eventName: "Deposit",
          payload: {
            sender: router,
            owner: alice,
            assets: "1.5",
            shares: "1",
          },
        }),
      ]),
    ).toThrow("assets must be an unsigned integer");
  });
});
