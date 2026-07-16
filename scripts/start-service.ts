import { spawn } from "node:child_process";

import { resolveServiceCommand } from "../src/config/service-role";

const serviceCommand = resolveServiceCommand(process.env.RAILWAY_SERVICE_NAME);
const child = spawn(serviceCommand.command, serviceCommand.args, {
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => child.kill(signal));
}

child.once("error", (error) => {
  console.error("Unable to start Railway service process", error);
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 1;
});
