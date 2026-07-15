import { decodeEventLog, type Address, type Hex } from "viem";
import {
  erc20Abi,
  parallelizerAbi,
  protocolEventTopics,
  savingsAbi,
} from "@/protocol/abis";
import { hyperevmProtocol } from "@/protocol/hyperevm";
import { savingsChainAdapters } from "@/protocol/savings-chains";

interface DecoderDefinition {
  role: string;
  version: string;
  abi: typeof erc20Abi | typeof savingsAbi | typeof parallelizerAbi;
}

const decoderKey = (chainId: number, address: Address | string) =>
  `${chainId}:${address.toLowerCase()}`;

const decoders = new Map<string, DecoderDefinition>();
for (const adapter of savingsChainAdapters) {
  decoders.set(decoderKey(adapter.chainId, adapter.usdp.address), {
    role: "usdp-token",
    version: "usdp-token-v1",
    abi: erc20Abi,
  });
  decoders.set(decoderKey(adapter.chainId, adapter.susdp.address), {
    role: "susdp-savings",
    version: "susdp-savings-v1",
    abi: savingsAbi,
  });
}
decoders.set(
  decoderKey(
    hyperevmProtocol.chainId,
    hyperevmProtocol.contracts.parallelizer.address,
  ),
  {
    role: "usdp-parallelizer",
    version: "parallelizer-v1",
    abi: parallelizerAbi,
  },
);
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

export function decoderVersionForAddress(
  chainId: number,
  address: Address | string,
) {
  return decoders.get(decoderKey(chainId, address))?.version ?? "unknown-v1";
}

export function isKnownProtocolEventTopic(topic: string | undefined) {
  return Boolean(topic && knownEventTopics.has(topic.toLowerCase()));
}

export function decodeProtocolLog(
  chainId: number,
  log: {
    address: Address;
    data: Hex;
    topics: readonly Hex[];
  },
): DecodedProtocolEvent | undefined {
  const decoder = decoders.get(decoderKey(chainId, log.address));
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
