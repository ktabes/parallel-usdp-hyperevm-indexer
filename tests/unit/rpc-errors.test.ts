import { describe, expect, it } from "vitest";
import { providerErrorMessage } from "@/rpc/errors";

describe("provider error redaction", () => {
  it("removes credential-bearing HTTP and WebSocket URLs", () => {
    const message = providerErrorMessage(
      new Error(
        "URL: https://node.example/token/nanoreth\nDocs: https://docs.example/path\nWSS: wss://node.example/token/ws",
      ),
    );
    expect(message).not.toContain("token");
    expect(message).not.toContain("node.example");
    expect(message).toContain("URL: [redacted-provider-url]");
    expect(message).toContain("WSS: [redacted-provider-url]");
  });
});
