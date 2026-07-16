export type ServiceCommand = Readonly<{
  command: string;
  args: readonly string[];
}>;

const HISTORY_WORKER_SERVICE = "hyperevm-history-worker";

export function resolveServiceCommand(
  serviceName: string | undefined,
): ServiceCommand {
  if (serviceName === HISTORY_WORKER_SERVICE) {
    return {
      command: "npm",
      args: ["run", "worker:hyperevm-history"],
    };
  }

  return {
    command: "npm",
    args: ["run", "start:web"],
  };
}
