import { decodeEventLog, type Address, type Hex } from "viem";
import {
  erc20Abi,
  parallelizerAbi,
  protocolEventTopics,
  savingsAbi,
} from "@/protocol/abis";
import { hyperevmProtocol } from "@/protocol/hyperevm";

interface DecoderDefinition {
  role: string;
  version: string;
  abi: typeof erc20Abi | typeof savingsAbi | typeof parallelizerAbi;
}

const decoders = new Map<string, DecoderDefinition>([
  [
    hyperevmProtocol.contracts.usdp.address.toLowerCase(),
    { role: "usdp-token", version: "usdp-token-v1", abi: erc20Abi },
  ],
  [
    hyperevmProtocol.contracts.susdp.address.toLowerCase(),
    { role: "susdp-savings", version: "susdp-savings-v1", abi: savingsAbi },
  ],
  [
    hyperevmProtocol.contracts.parallelizer.address.toLowerCase(),
    {
      role: "usdp-parallelizer",
      version: "parallelizer-v1",
      abi: parallelizerAbi,
    },
  ],
]);
const knownEventTopics = new Set(
  Object.values(protocolEventTopics).map((topic) => topic.toLowerCase()),
);

function jsonValue(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, jsonValue(item)]),
    );
  }
  return value;
}

export interface DecodedProtocolEvent {
  contractRole: string;
  eventName: string;
  payload: unknown;
  decoderVersion: string;
}

export function decoderVersionForAddress(address: Address | string) {
  return decoders.get(address.toLowerCase())?.version ?? "unknown-v1";
}

export function isKnownProtocolEventTopic(topic: string | undefined) {
  return Boolean(topic && knownEventTopics.has(topic.toLowerCase()));
}

export function decodeProtocolLog(log: {
  address: Address;
  data: Hex;
  topics: readonly Hex[];
}): DecodedProtocolEvent | undefined {
  const decoder = decoders.get(log.address.toLowerCase());
  if (!decoder || !log.topics[0]) return undefined;
  try {
    const decoded = decodeEventLog({
      abi: decoder.abi,
      data: log.data,
      topics: log.topics,
      strict: false,
    } as never) as { eventName: string; args?: unknown };
    return {
      contractRole: decoder.role,
      eventName: decoded.eventName,
      payload: jsonValue(decoded.args ?? {}),
      decoderVersion: decoder.version,
    };
  } catch {
    return undefined;
  }
}
