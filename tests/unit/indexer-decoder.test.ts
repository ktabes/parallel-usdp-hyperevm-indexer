import {
  encodeAbiParameters,
  encodeEventTopics,
  parseAbiParameters,
  type Hex,
} from "viem";
import { describe, expect, it } from "vitest";
import { decodeProtocolLog } from "@/indexer/decoder";
import { savingsAbi } from "@/protocol/abis";
import { hyperevmProtocol } from "@/protocol/hyperevm";

describe("protocol log decoder", () => {
  it("decodes and JSON-normalizes an ERC-4626 deposit", () => {
    const sender = "0x1111111111111111111111111111111111111111";
    const owner = "0x2222222222222222222222222222222222222222";
    const decoded = decodeProtocolLog({
      address: hyperevmProtocol.contracts.susdp.address,
      topics: encodeEventTopics({
        abi: savingsAbi,
        eventName: "Deposit",
        args: { sender, owner },
      }).filter((topic): topic is Hex => typeof topic === "string"),
      data: encodeAbiParameters(parseAbiParameters("uint256,uint256"), [
        12_345n,
        12_000n,
      ]),
    });

    expect(decoded).toMatchObject({
      contractRole: "susdp-savings",
      eventName: "Deposit",
      decoderVersion: "susdp-savings-v1",
      payload: {
        sender,
        owner,
        assets: "12345",
        shares: "12000",
      },
    });
  });

  it("fails closed for an unknown address", () => {
    expect(
      decodeProtocolLog({
        address: "0x3333333333333333333333333333333333333333",
        topics: [
          "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
        ],
        data: "0x",
      }),
    ).toBeUndefined();
  });
});
