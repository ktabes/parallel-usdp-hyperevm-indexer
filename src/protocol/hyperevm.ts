import { getAddress, type Address } from "viem";

export const HYPEREVM_CHAIN_ID = 999;
export const OFFICIAL_SOURCE_COMMIT =
  "fcfe2771edf64a604f015eb2682ef6a45c90d417";
export const OFFICIAL_TOKEN_SOURCE_COMMIT =
  "b16007cec636f563c8a21e78349893b6a3720522";

const address = (value: string) => getAddress(value.toLowerCase()) as Address;

export const hyperevmProtocol = {
  manifestVersion: "hyperevm-usdp-candidate-v1",
  chainId: HYPEREVM_CHAIN_ID,
  officialSources: {
    contracts:
      "https://docs.parallel.best/developers-hub/contract-addresses/parallel-v3/usdp/hyperevm",
    product:
      "https://docs.parallel.best/products/parallel-v3/stablecoins-and-savings/usdp-and-susdp",
    repository: "https://github.com/parallel-protocol/parallel-parallelizer",
    sourceCommit: OFFICIAL_SOURCE_COMMIT,
    tokenRepository: "https://github.com/parallel-protocol/parallel-tokens",
    tokenSourceCommit: OFFICIAL_TOKEN_SOURCE_COMMIT,
    marketOracles:
      "https://docs.parallel.best/developers-hub/parallel-v3/onchain-tools/oracles/dia/market",
  },
  contracts: {
    usdp: {
      address: address("0xBE65F0F410A72BeC163dC65d46c83699e957D588"),
      expectedImplementation: address(
        "0x24CeF236056834F38e9247A1Fff6681Dd313D3aA",
      ),
      deploymentBlock: 5_035_286n,
      deploymentTransaction:
        "0x915212321e7364fe67bb474b74698b91e0bcf62d20f2537c862bd3523eb5c9ae",
    },
    susdp: {
      address: address("0x9B3a8f7CEC208e247d97dEE13313690977e24459"),
      expectedImplementation: address(
        "0x769F533139eb1723c41cADEc243ce10BC4d400Fd",
      ),
      deploymentBlock: 5_119_222n,
      deploymentTransaction:
        "0x55649f4f27ce66b3c335347fe1b7fdf4ecd1eccbb1d3b134d6cf789e19a8d40b",
    },
    parallelizer: {
      address: address("0x1250304F66404cd153fA39388DDCDAec7E0f1707"),
      deploymentBlock: 5_117_819n,
      deploymentTransaction:
        "0x32486504c4b97169ecca5abd2bcef10994bccd7e30adfb1ae19c54b198b3c04a",
    },
    genericHarvester: {
      address: address("0x57770C1721Eb35509f38210A935c8b1911db7E0e"),
      deploymentBlock: 6_538_100n,
    },
  },
  priceFeeds: {
    usdpUsd: {
      provider: "DIA",
      address: address("0x2189f3d9Be89808Dfe6C34446FE7aaDA7A5aD1b6"),
      pair: "USDp/USD",
      maximumAgeSeconds: 43_200n,
    },
    susdpUsd: {
      provider: "DIA",
      address: address("0xdcA437D1492Db6E9438A82Ad31Cab92E2eE159E1"),
      pair: "sUSDp/USD",
      maximumAgeSeconds: 43_200n,
    },
  },
  facets: {
    diamondCut: address("0xA65821FfE86E6Eb613DAa1F70AF350C5A21759dF"),
    diamondLoupe: address("0xBEFBAe2330186F031b469e26283aCc66bb5F8826"),
    settersGovernor: address("0x472eD57b376fE400259FB28e5C46eB53f0E3e7E7"),
    settersGuardian: address("0xaE2Fb66d1989EC1684fF095B75D151Ae8E403E2e"),
    getters: address("0x120805265fA944834DC6e930De2995768806a9d2"),
    swapper: address("0x1b2741dB9F46a0411852e4cC28dDC476851b5179"),
    redeemer: address("0xF92eD96C7bEc4aD46FF7937Cae633c907EBDf594"),
    rewardHandler: address("0xa5d9CAA2EF06D39d5992b5046e2DEFFf6D5Cbd18"),
  },
} as const;

export const expectedFacetAddresses = Object.values(hyperevmProtocol.facets);
