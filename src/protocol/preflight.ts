import type { Address } from "viem";
import {
  createHyperevmClient,
  type HyperEvmClient,
} from "@/rpc/hyperevm-client";
import { protocolEventTopics } from "./abis";
import { hyperevmProtocol } from "./hyperevm";

interface PreflightOptions {
  rpcUrl: string;
  finalityLag: number;
  chunkSize: number;
  sampleBlocks?: number;
}

async function findBlockAtOrAfterTimestamp(
  client: HyperEvmClient,
  targetTimestamp: bigint,
  high: bigint,
) {
  let low = 0n;
  let upper = high;
  while (low < upper) {
    const middle = (low + upper) / 2n;
    const block = await client.getBlock({ blockNumber: middle });
    if (block.timestamp < targetTimestamp) low = middle + 1n;
    else upper = middle;
  }
  return low;
}

export async function runPublicRpcPreflight(options: PreflightOptions) {
  const client = createHyperevmClient(options.rpcUrl);
  const head = await client.getBlockNumber();
  const finalizedHead = head - BigInt(options.finalityLag);
  const finalizedBlock = await client.getBlock({ blockNumber: finalizedHead });
  const sevenDaysAgo = finalizedBlock.timestamp - 7n * 24n * 60n * 60n;
  const sevenDayStart = await findBlockAtOrAfterTimestamp(
    client,
    sevenDaysAgo,
    finalizedHead,
  );
  const sevenDayBlocks = finalizedHead - sevenDayStart + 1n;
  const sevenDayRequests =
    (sevenDayBlocks + BigInt(options.chunkSize) - 1n) /
    BigInt(options.chunkSize);
  const lifetimeBlocks =
    finalizedHead - hyperevmProtocol.contracts.susdp.deploymentBlock + 1n;
  const lifetimeRequests =
    (lifetimeBlocks + BigInt(options.chunkSize) - 1n) /
    BigInt(options.chunkSize);
  const sampleBlocks = BigInt(options.sampleBlocks ?? 1_000);
  const sampleFrom = finalizedHead - sampleBlocks + 1n;
  const addresses: Address[] = [
    hyperevmProtocol.contracts.usdp.address,
    hyperevmProtocol.contracts.susdp.address,
    hyperevmProtocol.contracts.parallelizer.address,
  ];
  const logs = [];

  for (let fromBlock = sampleFrom; fromBlock <= finalizedHead;) {
    const toBlock =
      fromBlock + BigInt(options.chunkSize) - 1n > finalizedHead
        ? finalizedHead
        : fromBlock + BigInt(options.chunkSize) - 1n;
    const rangeLogs = await client.getLogs({
      address: addresses,
      fromBlock,
      toBlock,
    });
    logs.push(...rangeLogs);
    fromBlock = toBlock + 1n;
  }

  const counts: Record<string, number> = {};
  for (const log of logs) {
    const topic = log.topics[0]?.toLowerCase() ?? "no-topic";
    const name =
      Object.entries(protocolEventTopics).find(
        ([, value]) => value.toLowerCase() === topic,
      )?.[0] ?? "other";
    const key = `${log.address.toLowerCase()}:${name}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return JSON.parse(
    JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        head,
        finalizedHead,
        finalizedTimestamp: finalizedBlock.timestamp,
        sevenDayWindow: {
          startBlock: sevenDayStart,
          endBlock: finalizedHead,
          blocks: sevenDayBlocks,
          requiredRequestsAtConfiguredChunk: sevenDayRequests,
          completeCountCollected: false,
          reason:
            "The official public RPC is limited to 50-block eth_getLogs ranges and 100 requests per minute.",
        },
        lifetimeSavingsTransfers: {
          startBlock: hyperevmProtocol.contracts.susdp.deploymentBlock,
          endBlock: finalizedHead,
          blocks: lifetimeBlocks,
          requiredRequestsAtConfiguredChunk: lifetimeRequests,
          completeCountCollected: false,
        },
        boundedSample: {
          fromBlock: sampleFrom,
          toBlock: finalizedHead,
          blocks: sampleBlocks,
          logCount: logs.length,
          counts,
        },
      },
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    ),
  );
}
