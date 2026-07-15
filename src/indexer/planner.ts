export interface BlockRange {
  fromBlock: bigint;
  toBlock: bigint;
}

export type RpcErrorClass = "range" | "rate-limit" | "transient" | "fatal";

export function planBlockRange(
  fromBlock: bigint,
  toBlock: bigint,
  chunkSize: number,
): BlockRange {
  if (chunkSize < 1 || !Number.isInteger(chunkSize))
    throw new Error("chunkSize must be a positive integer");
  if (fromBlock > toBlock) throw new Error("fromBlock must not exceed toBlock");
  const plannedTo = fromBlock + BigInt(chunkSize) - 1n;
  return {
    fromBlock,
    toBlock: plannedTo > toBlock ? toBlock : plannedTo,
  };
}

export function reduceChunkSize(chunkSize: number) {
  if (chunkSize <= 1) return 1;
  return Math.max(1, Math.floor(chunkSize / 2));
}

export function classifyRpcError(error: unknown): RpcErrorClass {
  const message = (error instanceof Error ? error.message : String(error))
    .toLowerCase()
    .replaceAll("_", " ");

  if (
    message.includes("block range") ||
    message.includes("range limit") ||
    message.includes("query exceeds") ||
    message.includes("response size") ||
    message.includes("too many results")
  )
    return "range";
  if (
    message.includes("429") ||
    message.includes("too many requests") ||
    message.includes("rate limit")
  )
    return "rate-limit";
  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("503") ||
    message.includes("502") ||
    message.includes("500") ||
    message.includes("temporarily") ||
    message.includes("network") ||
    message.includes("fetch failed")
  )
    return "transient";
  return "fatal";
}

export function retryDelayMs(
  attempt: number,
  errorClass: RpcErrorClass,
  random: () => number = Math.random,
) {
  const base = errorClass === "rate-limit" ? 2_000 : 500;
  const cap = errorClass === "rate-limit" ? 60_000 : 15_000;
  const exponential = base * 2 ** Math.max(0, attempt - 1);
  const jitter = 0.8 + random() * 0.4;
  return Math.max(1, Math.min(cap, Math.round(exponential * jitter)));
}

export function shouldRetryRpcError(
  errorClass: RpcErrorClass,
  attempt: number,
  maxRetries: number,
  retryRateLimitsIndefinitely: boolean,
) {
  if (errorClass === "rate-limit" && retryRateLimitsIndefinitely) return true;
  return (
    (errorClass === "rate-limit" || errorClass === "transient") &&
    attempt < maxRetries
  );
}

export function mergeCoverage(ranges: BlockRange[]) {
  const sorted = [...ranges].sort((a, b) =>
    a.fromBlock < b.fromBlock ? -1 : a.fromBlock > b.fromBlock ? 1 : 0,
  );
  const merged: BlockRange[] = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (!previous || range.fromBlock > previous.toBlock + 1n) {
      merged.push({ ...range });
      continue;
    }
    if (range.toBlock > previous.toBlock) previous.toBlock = range.toBlock;
  }
  return merged;
}

export function coverageGaps(
  ranges: BlockRange[],
  fromBlock: bigint,
  toBlock: bigint,
) {
  if (fromBlock > toBlock) throw new Error("fromBlock must not exceed toBlock");
  const gaps: BlockRange[] = [];
  let cursor = fromBlock;
  for (const range of mergeCoverage(ranges)) {
    if (range.toBlock < cursor || range.fromBlock > toBlock) continue;
    if (range.fromBlock > cursor) {
      gaps.push({ fromBlock: cursor, toBlock: range.fromBlock - 1n });
    }
    if (range.toBlock + 1n > cursor) cursor = range.toBlock + 1n;
    if (cursor > toBlock) break;
  }
  if (cursor <= toBlock) gaps.push({ fromBlock: cursor, toBlock });
  return gaps;
}
