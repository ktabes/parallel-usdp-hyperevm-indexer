import { z } from "zod";
import { HYPEREVM_PUBLIC_RPC_URL } from "@/rpc/hyperevm-client";

const integerFromString = (name: string, minimum: number, maximum: number) =>
  z.coerce
    .number({ error: `${name} must be an integer` })
    .int(`${name} must be an integer`)
    .min(minimum, `${name} must be at least ${minimum}`)
    .max(maximum, `${name} must be at most ${maximum}`);

const optionalSecret = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().min(1).optional(),
);

const optionalUrl = (name: string) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.url(`${name} must be a valid URL`).optional(),
  );

const booleanFlag = z
  .enum(["0", "1"])
  .default("0")
  .transform((value) => value === "1");

const optionalRpcUrlMap = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    if (value.trim() === "") return undefined;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  },
  z
    .record(
      z.string().regex(/^\d+$/, "RPC map keys must be numeric chain IDs"),
      z.url("RPC map values must be valid URLs"),
    )
    .optional(),
);

export const runtimeEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(?:ql)?:\/\//, "DATABASE_URL must be a PostgreSQL URL"),
  HYPEREVM_RPC_URL: z.url("HYPEREVM_RPC_URL must be a valid URL"),
  ETHEREUM_RPC_URL: optionalUrl("ETHEREUM_RPC_URL"),
  BASE_RPC_URL: optionalUrl("BASE_RPC_URL"),
  SONIC_RPC_URL: optionalUrl("SONIC_RPC_URL"),
  AVALANCHE_RPC_URL: optionalUrl("AVALANCHE_RPC_URL"),
  USDP_CHAIN_RPC_URLS: optionalRpcUrlMap,
  ALCHEMY_API_KEY: optionalSecret,
  ONFINALITY_API_KEY: optionalSecret,
  RUN_SEVEN_DAY_BACKFILL: booleanFlag,
  RUN_MULTICHAIN_SNAPSHOTS: booleanFlag,
  FINALITY_LAG: integerFromString("FINALITY_LAG", 1, 10_000).default(5),
  RPC_LOG_CHUNK_SIZE: integerFromString(
    "RPC_LOG_CHUNK_SIZE",
    1,
    100_000,
  ).default(50),
  RPC_REQUEST_INTERVAL_MS: integerFromString(
    "RPC_REQUEST_INTERVAL_MS",
    250,
    60_000,
  ).default(1_500),
  PRICE_SOURCE: z
    .enum(["unconfigured", "onchain", "external-comparison"])
    .default("unconfigured"),
  REFRESH_INTERVAL_SECONDS: integerFromString(
    "REFRESH_INTERVAL_SECONDS",
    15,
    3_600,
  ).default(30),
  GLOBAL_SNAPSHOT_MAX_AGE_SECONDS: integerFromString(
    "GLOBAL_SNAPSHOT_MAX_AGE_SECONDS",
    30,
    86_400,
  ).default(3_600),
  USDP_SUPPLY_ALIGNMENT_MAX_SKEW_SECONDS: integerFromString(
    "USDP_SUPPLY_ALIGNMENT_MAX_SKEW_SECONDS",
    60,
    86_400,
  ).default(1_800),
});

export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>;

const positiveUnixTimestamp = z
  .string()
  .regex(/^\d+$/, "HYPEREVM_HISTORY_WINDOW_END must be a Unix timestamp")
  .transform((value) => BigInt(value))
  .refine((value) => value > 0n, {
    message: "HYPEREVM_HISTORY_WINDOW_END must be positive",
  });

export const historyWorkerEnvSchema = runtimeEnvSchema.extend({
  HYPEREVM_HISTORY_WINDOW_END: positiveUnixTimestamp,
  HYPEREVM_HISTORY_DAYS: integerFromString(
    "HYPEREVM_HISTORY_DAYS",
    1,
    365,
  ).default(7),
  HYPEREVM_HISTORY_STATE_RPC_URL: z
    .url("HYPEREVM_HISTORY_STATE_RPC_URL must be a valid URL")
    .default(HYPEREVM_PUBLIC_RPC_URL),
  HYPEREVM_HISTORY_PRIMARY_RPC_URL: optionalUrl(
    "HYPEREVM_HISTORY_PRIMARY_RPC_URL",
  ),
  HYPEREVM_HISTORY_FALLBACK_RPC_URL: z
    .url("HYPEREVM_HISTORY_FALLBACK_RPC_URL must be a valid URL")
    .default(HYPEREVM_PUBLIC_RPC_URL),
  HYPEREVM_HISTORY_PRIMARY_CHUNK_SIZE: integerFromString(
    "HYPEREVM_HISTORY_PRIMARY_CHUNK_SIZE",
    1,
    100_000,
  ).default(5),
  HYPEREVM_HISTORY_FALLBACK_CHUNK_SIZE: integerFromString(
    "HYPEREVM_HISTORY_FALLBACK_CHUNK_SIZE",
    1,
    100_000,
  ).default(50),
  HYPEREVM_HISTORY_PRIMARY_INTERVAL_MS: integerFromString(
    "HYPEREVM_HISTORY_PRIMARY_INTERVAL_MS",
    250,
    60_000,
  ).default(250),
  HYPEREVM_HISTORY_FALLBACK_INTERVAL_MS: integerFromString(
    "HYPEREVM_HISTORY_FALLBACK_INTERVAL_MS",
    250,
    60_000,
  ).default(1_500),
});

export type HistoryWorkerEnv = z.infer<typeof historyWorkerEnvSchema>;

export const discoveryEnvSchema = runtimeEnvSchema.pick({
  HYPEREVM_RPC_URL: true,
  ALCHEMY_API_KEY: true,
  ONFINALITY_API_KEY: true,
  FINALITY_LAG: true,
  RPC_LOG_CHUNK_SIZE: true,
  RPC_REQUEST_INTERVAL_MS: true,
});

export type DiscoveryEnv = z.infer<typeof discoveryEnvSchema>;

export function parseRuntimeEnv(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
): RuntimeEnv {
  const result = runtimeEnvSchema.safeParse(input);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid runtime configuration: ${issues}`);
  }

  return result.data;
}

export function parseHistoryWorkerEnv(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
): HistoryWorkerEnv {
  const result = historyWorkerEnvSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid history worker configuration: ${issues}`);
  }
  return result.data;
}

export function parseDiscoveryEnv(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
): DiscoveryEnv {
  const result = discoveryEnvSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid discovery configuration: ${issues}`);
  }
  return result.data;
}
