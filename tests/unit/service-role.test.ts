import { describe, expect, it } from "vitest";

import { resolveServiceCommand } from "../../src/config/service-role";

describe("resolveServiceCommand", () => {
  it("runs the history worker only for its dedicated Railway service", () => {
    expect(resolveServiceCommand("hyperevm-history-worker")).toEqual({
      command: "npm",
      args: ["run", "worker:hyperevm-history"],
    });
  });

  it("keeps the web process as the default", () => {
    expect(resolveServiceCommand("content-spirit")).toEqual({
      command: "npm",
      args: ["run", "start:web"],
    });
    expect(resolveServiceCommand(undefined)).toEqual({
      command: "npm",
      args: ["run", "start:web"],
    });
  });
});
