import { getAddress, isAddress } from "viem";
import { hyperevmProtocol } from "@/protocol/hyperevm";

export const FLOW_CALCULATION_VERSION = "parallel-usdp-flows-v1-candidate";

export type NativeFlowMetric =
  | "usdp_issued"
  | "usdp_burned_for_collateral"
  | "usdp_redeemed"
  | "susdp_deposited"
  | "susdp_withdrawn";

export type EconomicClassification =
  | NativeFlowMetric
  | "susdp_accrued"
  | "susdp_rate_updated"
  | "susdp_max_rate_updated"
  | "susdp_pause_toggled"
  | "susdp_transfer"
  | "usdp_transfer"
  | "parallelizer_swap_other";

export interface ProtocolEventInput {
  id: string;
  chainId: number;
  blockNumber: string;
  blockTimestamp: Date;
  transactionHash: string;
  logIndex: number;
  contractRole: string;
  eventName: string;
  payload: unknown;
}

export interface ClassifiedEconomicEvent extends ProtocolEventInput {
  classification: EconomicClassification;
  amountBaseUnits: string | null;
  assetAddress: string | null;
  primaryParticipant: string | null;
  secondaryParticipant: string | null;
  transactionEventCount: number;
  transactionEventNames: string[];
}

export interface FlowAggregate {
  granularity: "hour" | "day";
  bucketStart: Date;
  metric: NativeFlowMetric;
  amountBaseUnits: string;
  eventCount: number;
  uniqueParticipants: number;
}

export interface FlowParticipantSummary {
  uniqueDepositors: number;
  uniqueWithdrawers: number;
}

const nativeFlowMetrics = new Set<NativeFlowMetric>([
  "usdp_issued",
  "usdp_burned_for_collateral",
  "usdp_redeemed",
  "susdp_deposited",
  "susdp_withdrawn",
]);

function payloadRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new Error("Decoded protocol event payload must be an object");
  return payload as Record<string, unknown>;
}

function payloadString(payload: unknown, key: string) {
  const value = payloadRecord(payload)[key];
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`Decoded protocol event payload is missing ${key}`);
  return value;
}

function unsignedAmount(payload: unknown, key: string) {
  const value = payloadString(payload, key);
  if (!/^[0-9]+$/.test(value))
    throw new Error(
      `Decoded protocol event ${key} must be an unsigned integer`,
    );
  return value;
}

function normalizedAddress(payload: unknown, key: string) {
  const value = payloadString(payload, key);
  if (!isAddress(value))
    throw new Error(`Decoded protocol event ${key} must be an EVM address`);
  return getAddress(value).toLowerCase();
}

function baseClassification(
  event: ProtocolEventInput,
  classification: EconomicClassification,
  options: {
    amountBaseUnits?: string | null;
    assetAddress?: string | null;
    primaryParticipant?: string | null;
    secondaryParticipant?: string | null;
  } = {},
): Omit<
  ClassifiedEconomicEvent,
  "transactionEventCount" | "transactionEventNames"
> {
  return {
    ...event,
    classification,
    amountBaseUnits: options.amountBaseUnits ?? null,
    assetAddress: options.assetAddress ?? null,
    primaryParticipant: options.primaryParticipant ?? null,
    secondaryParticipant: options.secondaryParticipant ?? null,
  };
}

function classifyEvent(event: ProtocolEventInput) {
  if (event.contractRole === "susdp-savings") {
    if (event.eventName === "Deposit")
      return baseClassification(event, "susdp_deposited", {
        amountBaseUnits: unsignedAmount(event.payload, "assets"),
        assetAddress: hyperevmProtocol.contracts.usdp.address.toLowerCase(),
        primaryParticipant: normalizedAddress(event.payload, "owner"),
        secondaryParticipant: normalizedAddress(event.payload, "sender"),
      });
    if (event.eventName === "Withdraw")
      return baseClassification(event, "susdp_withdrawn", {
        amountBaseUnits: unsignedAmount(event.payload, "assets"),
        assetAddress: hyperevmProtocol.contracts.usdp.address.toLowerCase(),
        primaryParticipant: normalizedAddress(event.payload, "owner"),
        secondaryParticipant: normalizedAddress(event.payload, "receiver"),
      });
    if (event.eventName === "Accrued")
      return baseClassification(event, "susdp_accrued", {
        amountBaseUnits: unsignedAmount(event.payload, "interest"),
        assetAddress: hyperevmProtocol.contracts.usdp.address.toLowerCase(),
      });
    if (event.eventName === "RateUpdated")
      return baseClassification(event, "susdp_rate_updated", {
        amountBaseUnits: unsignedAmount(event.payload, "newRate"),
      });
    if (event.eventName === "MaxRateUpdated")
      return baseClassification(event, "susdp_max_rate_updated", {
        amountBaseUnits: unsignedAmount(event.payload, "newMaxRate"),
      });
    if (event.eventName === "ToggledPause")
      return baseClassification(event, "susdp_pause_toggled", {
        amountBaseUnits: unsignedAmount(event.payload, "pauseStatus"),
      });
    if (event.eventName === "Transfer")
      return baseClassification(event, "susdp_transfer", {
        amountBaseUnits: unsignedAmount(event.payload, "value"),
        assetAddress: hyperevmProtocol.contracts.susdp.address.toLowerCase(),
        primaryParticipant: normalizedAddress(event.payload, "from"),
        secondaryParticipant: normalizedAddress(event.payload, "to"),
      });
  }

  if (event.contractRole === "usdp-token" && event.eventName === "Transfer")
    return baseClassification(event, "usdp_transfer", {
      amountBaseUnits: unsignedAmount(event.payload, "value"),
      assetAddress: hyperevmProtocol.contracts.usdp.address.toLowerCase(),
      primaryParticipant: normalizedAddress(event.payload, "from"),
      secondaryParticipant: normalizedAddress(event.payload, "to"),
    });

  if (event.contractRole === "usdp-parallelizer") {
    if (event.eventName === "Swap") {
      const tokenIn = normalizedAddress(event.payload, "tokenIn");
      const tokenOut = normalizedAddress(event.payload, "tokenOut");
      const usdp = hyperevmProtocol.contracts.usdp.address.toLowerCase();
      const isIssue = tokenOut === usdp;
      const isBurn = tokenIn === usdp;
      if (isIssue && isBurn)
        throw new Error(
          "Parallelizer Swap cannot use USDp as both input and output",
        );
      return baseClassification(
        event,
        isIssue
          ? "usdp_issued"
          : isBurn
            ? "usdp_burned_for_collateral"
            : "parallelizer_swap_other",
        {
          amountBaseUnits: isIssue
            ? unsignedAmount(event.payload, "amountOut")
            : isBurn
              ? unsignedAmount(event.payload, "amountIn")
              : null,
          assetAddress: isIssue || isBurn ? usdp : null,
          primaryParticipant: normalizedAddress(event.payload, "from"),
          secondaryParticipant: normalizedAddress(event.payload, "to"),
        },
      );
    }
    if (event.eventName === "Redeemed")
      return baseClassification(event, "usdp_redeemed", {
        amountBaseUnits: unsignedAmount(event.payload, "amount"),
        assetAddress: hyperevmProtocol.contracts.usdp.address.toLowerCase(),
        primaryParticipant: normalizedAddress(event.payload, "from"),
        secondaryParticipant: normalizedAddress(event.payload, "to"),
      });
  }

  return undefined;
}

export function classifyProtocolTransactions(events: ProtocolEventInput[]) {
  const transactions = new Map<string, ProtocolEventInput[]>();
  for (const event of events) {
    const transactionHash = event.transactionHash.toLowerCase();
    const transaction = transactions.get(transactionHash) ?? [];
    transaction.push({ ...event, transactionHash });
    transactions.set(transactionHash, transaction);
  }

  return [...transactions.values()].flatMap((transaction) => {
    transaction.sort((left, right) => left.logIndex - right.logIndex);
    const transactionEventNames = transaction.map(
      (event) => `${event.contractRole}:${event.eventName}`,
    );
    return transaction.flatMap((event) => {
      const classified = classifyEvent(event);
      return classified
        ? [
            {
              ...classified,
              transactionEventCount: transaction.length,
              transactionEventNames,
            },
          ]
        : [];
    });
  });
}

export function isNativeFlowMetric(
  classification: EconomicClassification,
): classification is NativeFlowMetric {
  return nativeFlowMetrics.has(classification as NativeFlowMetric);
}

function bucketStart(timestamp: Date, granularity: "hour" | "day") {
  const bucket = new Date(timestamp);
  bucket.setUTCMinutes(0, 0, 0);
  if (granularity === "day") bucket.setUTCHours(0);
  return bucket;
}

export function aggregateNativeFlows(
  events: ClassifiedEconomicEvent[],
  granularity: "hour" | "day",
): FlowAggregate[] {
  const buckets = new Map<
    string,
    {
      bucketStart: Date;
      metric: NativeFlowMetric;
      amount: bigint;
      eventCount: number;
      participants: Set<string>;
    }
  >();

  for (const event of events) {
    if (!isNativeFlowMetric(event.classification)) continue;
    if (event.amountBaseUnits === null)
      throw new Error(`${event.classification} is missing its amount`);
    const start = bucketStart(event.blockTimestamp, granularity);
    const key = `${start.toISOString()}:${event.classification}`;
    const bucket = buckets.get(key) ?? {
      bucketStart: start,
      metric: event.classification,
      amount: 0n,
      eventCount: 0,
      participants: new Set<string>(),
    };
    bucket.amount += BigInt(event.amountBaseUnits);
    bucket.eventCount += 1;
    if (event.primaryParticipant)
      bucket.participants.add(event.primaryParticipant);
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .sort(
      (left, right) =>
        left.bucketStart.getTime() - right.bucketStart.getTime() ||
        left.metric.localeCompare(right.metric),
    )
    .map((bucket) => ({
      granularity,
      bucketStart: bucket.bucketStart,
      metric: bucket.metric,
      amountBaseUnits: bucket.amount.toString(),
      eventCount: bucket.eventCount,
      uniqueParticipants: bucket.participants.size,
    }));
}

export function summarizeFlowParticipants(
  events: ClassifiedEconomicEvent[],
): FlowParticipantSummary {
  const depositors = new Set<string>();
  const withdrawers = new Set<string>();
  for (const event of events) {
    if (!event.primaryParticipant) continue;
    if (event.classification === "susdp_deposited")
      depositors.add(event.primaryParticipant);
    if (event.classification === "susdp_withdrawn")
      withdrawers.add(event.primaryParticipant);
  }
  return {
    uniqueDepositors: depositors.size,
    uniqueWithdrawers: withdrawers.size,
  };
}
