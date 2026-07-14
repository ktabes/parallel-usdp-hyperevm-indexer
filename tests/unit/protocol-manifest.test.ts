import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { protocolEventTopics } from "@/protocol/abis";
import { implementationAddressFromSlot } from "@/protocol/discovery";
import {
  expectedFacetAddresses,
  HYPEREVM_CHAIN_ID,
  hyperevmProtocol,
  OFFICIAL_SOURCE_COMMIT,
  OFFICIAL_TOKEN_SOURCE_COMMIT,
} from "@/protocol/hyperevm";

describe("HyperEVM Parallel candidate manifest", () => {
  it("pins the official source commit and chain", () => {
    expect(HYPEREVM_CHAIN_ID).toBe(999);
    expect(OFFICIAL_SOURCE_COMMIT).toMatch(/^[0-9a-f]{40}$/);
    expect(hyperevmProtocol.officialSources.sourceCommit).toBe(
      OFFICIAL_SOURCE_COMMIT,
    );
    expect(OFFICIAL_TOKEN_SOURCE_COMMIT).toMatch(/^[0-9a-f]{40}$/);
    expect(hyperevmProtocol.officialSources.tokenSourceCommit).toBe(
      OFFICIAL_TOKEN_SOURCE_COMMIT,
    );
    expect(hyperevmProtocol.contracts.usdp.deploymentBlock).toBe(5_035_286n);
  });

  it("contains valid distinct contract and facet addresses", () => {
    const addresses = [
      hyperevmProtocol.contracts.usdp.address,
      hyperevmProtocol.contracts.susdp.address,
      hyperevmProtocol.contracts.parallelizer.address,
      hyperevmProtocol.priceFeeds.usdpUsd.address,
      hyperevmProtocol.priceFeeds.susdpUsd.address,
      ...expectedFacetAddresses,
    ];
    expect(addresses.map((address) => getAddress(address))).toEqual(addresses);
    expect(
      new Set(addresses.map((address) => address.toLowerCase())).size,
    ).toBe(addresses.length);
  });

  it("decodes an ERC-1967 storage slot into its checksum address", () => {
    expect(
      implementationAddressFromSlot(
        "0x000000000000000000000000769f533139eb1723c41cadec243ce10bc4d400fd",
      ),
    ).toBe("0x769F533139eb1723c41cADEc243ce10BC4d400Fd");
  });

  it("defines unique event topics for every economic event", () => {
    const topics = Object.values(protocolEventTopics);
    expect(new Set(topics).size).toBe(topics.length);
    expect(topics.every((topic) => /^0x[0-9a-f]{64}$/.test(topic))).toBe(true);
  });

  it("keeps the executable market manifest unapproved", async () => {
    const manifest = JSON.parse(
      await readFile("config/markets/hyperevm-usdp.candidate.json", "utf8"),
    ) as { status: string; approval: { approved: boolean; blocker: string } };
    expect(manifest.status).toBe("candidate");
    expect(manifest.approval.approved).toBe(false);
    expect(manifest.approval.blocker).toMatch(/historical eth_call/);
  });
});
