const ALCHEMY_HYPEREVM_RPC_BASE =
  "https://hyperliquid-mainnet.g.alchemy.com/v2";

export const ONFINALITY_PUBLIC_ARCHIVE_RPC_URL =
  "https://hyperliquid.api.onfinality.io/evm/public";
const ONFINALITY_HYPEREVM_RPC_BASE =
  "https://hyperliquid.api.onfinality.io/evm";

export function alchemyRpcUrl(apiKey: string) {
  if (apiKey.trim() === "") throw new Error("ALCHEMY_API_KEY is empty");
  return `${ALCHEMY_HYPEREVM_RPC_BASE}/${encodeURIComponent(apiKey)}`;
}

export function onfinalityArchiveRpcUrl(apiKey?: string) {
  if (!apiKey) return ONFINALITY_PUBLIC_ARCHIVE_RPC_URL;
  return `${ONFINALITY_HYPEREVM_RPC_BASE}?apikey=${encodeURIComponent(apiKey)}`;
}

export function redactSecrets(message: string, secrets: unknown[]) {
  return secrets.reduce<string>((redacted, secret) => {
    if (typeof secret !== "string" || secret.length < 8) return redacted;
    return redacted.replaceAll(secret, "[REDACTED]");
  }, message);
}
