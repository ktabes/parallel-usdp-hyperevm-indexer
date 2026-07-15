import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import {
  findParallelDeployment,
  parallelAssetRegistry,
  susdpDeployments,
  usdpDeployments,
} from "@/protocol/assets";
import { hyperevmProtocol } from "@/protocol/hyperevm";

describe("Parallel cross-chain asset registry", () => {
  it("models the complete official USDp and sUSDp deployment sets", () => {
    expect(usdpDeployments).toHaveLength(24);
    expect(susdpDeployments).toHaveLength(5);
    expect(new Set(usdpDeployments.map(({ chainId }) => chainId)).size).toBe(
      usdpDeployments.length,
    );
    expect(new Set(susdpDeployments.map(({ chainId }) => chainId)).size).toBe(
      susdpDeployments.length,
    );
  });

  it("keeps every deployment address checksummed", () => {
    for (const deployment of [...usdpDeployments, ...susdpDeployments]) {
      expect(getAddress(deployment.address)).toBe(deployment.address);
    }
  });

  it("links every sUSDp vault to a USDp deployment on the same chain", () => {
    for (const deployment of susdpDeployments) {
      expect(findParallelDeployment("usdp", deployment.chainId)).toBeDefined();
      expect(deployment.tier).toBe("savings");
    }
  });

  it("preserves HyperEVM as the first verified chain adapter", () => {
    const usdp = findParallelDeployment("usdp", hyperevmProtocol.chainId);
    const susdp = findParallelDeployment("susdp", hyperevmProtocol.chainId);

    expect(usdp?.address).toBe(hyperevmProtocol.contracts.usdp.address);
    expect(susdp?.address).toBe(hyperevmProtocol.contracts.susdp.address);
    expect(usdp?.adapterStatus).toBe("verified");
    expect(susdp?.adapterStatus).toBe("verified");
  });

  it("attributes the registry to the official Parallel product source", () => {
    expect(parallelAssetRegistry.source).toMatch(
      /^https:\/\/docs\.parallel\.best/,
    );
    expect(parallelAssetRegistry.assets.susdp.underlyingAssetId).toBe("usdp");
  });
});
