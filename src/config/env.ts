import { z } from "zod";

const integerFromString = (name: string, minimum: number, maximum: number) =>
  z.coerce
    .number({ error: `${name} must be an integer` })
    .int(`${name} must be an integer`)
    .min(minimum, `${name} must be at least ${minimum}`)
    .max(maximum, `${name} must be at most ${maximum}`);

export const runtimeEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(?:ql)?:\/\//, "DATABASE_URL must be a PostgreSQL URL"),
  HYPEREVM_RPC_URL: z.url("HYPEREVM_RPC_URL must be a valid URL"),
  FINALITY_LAG: integerFromString("FINALITY_LAG", 1, 10_000).default(5),
  RPC_LOG_CHUNK_SIZE: integerFromString(
    "RPC_LOG_CHUNK_SIZE",
    1,
    100_000,
  ).default(50),
  PRICE_SOURCE: z
    .enum(["unconfigured", "onchain", "external-comparison"])
    .default("unconfigured"),
  REFRESH_INTERVAL_SECONDS: integerFromString(
    "REFRESH_INTERVAL_SECONDS",
    15,
    3_600,
  ).default(30),
});

export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>;

export const discoveryEnvSchema = runtimeEnvSchema.pick({
  HYPEREVM_RPC_URL: true,
  FINALITY_LAG: true,
  RPC_LOG_CHUNK_SIZE: true,
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
