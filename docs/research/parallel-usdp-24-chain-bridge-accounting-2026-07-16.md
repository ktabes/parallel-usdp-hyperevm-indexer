# Parallel USDp 24-chain bridge accounting research

- Researched: 2026-07-16
- Scope: Phase 8 design only; no distribution-chain backfills were started.
- Source policy: current Parallel product documentation and Parallel's public
  contract repositories are authoritative. LayerZero documentation is used
  only for the underlying OFT model.

## Confirmed topology

Parallel's product documentation currently publishes 24 USDp deployments and
five sUSDp deployments. The five savings chains are Ethereum, Base, Sonic,
HyperEVM, and Avalanche. Parallel also documents the Parallelizer mint/redeem
module on those same five chains and describes the Bridging Module as the way
USDp moves to chains without a Parallelizer.

| Chain           | Chain ID | USDp                                         | Product tier     | Address source       | Bridge-config proof   |
| --------------- | -------: | -------------------------------------------- | ---------------- | -------------------- | --------------------- |
| Ethereum        |        1 | `0x9B3a8f7CEC208e247d97dEE13313690977e24459` | savings/issuance | current product docs | documented            |
| Base            |     8453 | `0x76A9A0062ec6712b99B4f63bD2b4270185759dd5` | savings/issuance | current product docs | documented            |
| Sonic           |      146 | `0x08417cdb7F52a5021bB4eb6E0deAf3f295c3f182` | savings/issuance | current product docs | documented            |
| HyperEVM        |      999 | `0xbe65f0f410a72bec163dc65d46c83699e957d588` | savings/issuance | current product docs | documented            |
| Avalanche       |    43114 | `0x9eE1963f05553eF838604Dd39403be21ceF26AA4` | savings/issuance | current product docs | documented            |
| Polygon         |      137 | `0x1250304F66404cd153fA39388DDCDAec7E0f1707` | distribution     | current product docs | documented            |
| Arbitrum        |    42161 | `0x76A9A0062ec6712b99B4f63bD2b4270185759dd5` | distribution     | current product docs | documented            |
| Optimism        |       10 | `0x90337e484B1Cb02132fc150d3Afa262147348545` | distribution     | current product docs | documented            |
| Sei             |     1329 | `0x048C4e07D170eEdEE8772cA76AEE1C4e2D133d5c` | distribution     | current product docs | documented            |
| BNB Smart Chain |       56 | `0x048C4e07D170eEdEE8772cA76AEE1C4e2D133d5c` | distribution     | current product docs | documented            |
| Berachain       |    80094 | `0x9eE1963f05553eF838604Dd39403be21ceF26AA4` | distribution     | current product docs | documented            |
| Scroll          |   534352 | `0x9eE1963f05553eF838604Dd39403be21ceF26AA4` | distribution     | current product docs | documented            |
| Gnosis          |      100 | `0x9eE1963f05553eF838604Dd39403be21ceF26AA4` | distribution     | current product docs | documented            |
| Unichain        |      130 | `0x9eE1963f05553eF838604Dd39403be21ceF26AA4` | distribution     | current product docs | documented            |
| Ink             |    57073 | `0x9eE1963f05553eF838604Dd39403be21ceF26AA4` | distribution     | current product docs | documented            |
| TAC             |      239 | `0x4DeF531c3060686948f00EcC7504f2E0b71EDa14` | distribution     | current product docs | documented            |
| Linea           |    59144 | `0x8fCf9118fdD359f6277cDd143c2Da206e64140F3` | distribution     | current product docs | pending onchain proof |
| X Layer         |      196 | `0x8fCf9118fdD359f6277cDd143c2Da206e64140F3` | distribution     | current product docs | pending onchain proof |
| Plume           |    98866 | `0x8fCf9118fdD359f6277cDd143c2Da206e64140F3` | distribution     | current product docs | pending onchain proof |
| Plasma          |     9745 | `0xC2f8B5d893217462aE9c9879c9285A5a3AAbcb8F` | distribution     | current product docs | pending onchain proof |
| Katana          |   747474 | `0x8fCf9118fdD359f6277cDd143c2Da206e64140F3` | distribution     | current product docs | pending onchain proof |
| Fraxtal         |      252 | `0x8fCf9118fdD359f6277cDd143c2Da206e64140F3` | distribution     | current product docs | pending onchain proof |
| World Chain     |      480 | `0x8fCf9118fdD359f6277cDd143c2Da206e64140F3` | distribution     | current product docs | pending onchain proof |
| Hemi            |    43111 | `0x8fCf9118fdD359f6277cDd143c2Da206e64140F3` | distribution     | current product docs | pending onchain proof |

“Documented” means Parallel's implementation page publishes Bridging Module
parameters for that chain. It does not yet mean this indexer independently read
the deployed bridge contract, peers, DVNs, limits, and roles. The last eight
deployments appear in the current product address list but not in the bridge
parameter section inspected for this report, so they remain a separate proof
queue.

## Confirmed bridge behavior

Parallel's `BridgeableTokenP` is a LayerZero OFT. Its source code accepts either
the principal USDp token or the local OFT token when sending. For principal
USDp, the bridge calls `burnFrom` on the source. On receipt it mints principal
USDp up to daily/global credit limits and mints OFT balance for any remainder.
It tracks daily credit/debit use, a signed credit-debit balance, optional
isolation mode, fees, and message GUIDs. This is more specific than a generic
“bridge balance” model and determines which events and state must be indexed.

The documented initial configuration uses LayerZero with two required DVNs
(LayerZero Labs and Nethermind) plus one of two optional DVNs (Horizen or P2P),
2.5 million USDp daily mint/burn limits, 10 million global mint/burn limits,
zero fee, and isolation mode disabled. These are configuration claims to verify
onchain per deployment; they must not be hard-coded as permanent facts.

## Supply accounting decision

For a burn/mint omnichain asset, the current global circulating supply candidate
is:

`sum(USDp.totalSupply at one aligned finalized block per verified deployment)`

Do not add bridge flow totals to that sum. A completed transfer burns supply on
the source and mints it on the destination; adding sends/receives would double
count movement. Bridge events instead provide reconciliation evidence and an
in-flight liability view.

The candidate is promotable only when:

1. all 24 token addresses return matching metadata and expected code;
2. each snapshot is mapped to one aligned UTC observation window;
3. each BridgeableTokenP address and principal token relationship is proven;
4. LayerZero peer/EID configuration is captured for the connected mesh;
5. source debits and destination credits reconcile by message GUID, allowing a
   bounded in-flight set;
6. no deployment is duplicated, retired, isolated, or represented by an escrow
   model that changes the supply formula;
7. the aggregate stores included, missing, stale, and failed chains.

Until all seven pass, the API must continue exposing five-chain USDp supply and
global USDp supply as different metrics.

## Proposed schema additions

| Table                          | Purpose                                   | Key fields                                                                                  |
| ------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `usdp_deployment_manifests`    | Versioned product/contract registry       | chain ID, token, bridge, LayerZero EID, tier, source URL, status, effective range           |
| `usdp_supply_snapshots`        | Aligned per-chain total supply            | chain ID, block/hash/time, total supply, manifest version, freshness                        |
| `bridge_config_snapshots`      | Onchain bridge controls and relationships | principal token, peer, DVNs, limits, fee, isolate mode, block provenance                    |
| `bridge_messages`              | Cross-chain transfer lifecycle            | GUID, source/destination EID, debit/credit amounts, source/destination tx and block, status |
| `global_usdp_supply_snapshots` | Coverage-gated aggregate                  | observation time, summed supply, included/missing/stale chains, in-flight amount, status    |
| `bridge_reconciliations`       | Independent invariant result              | window, GUID counts, unmatched debit/credit, amount deltas, result/version                  |

Raw LayerZero endpoint packet evidence and Parallel bridge events should remain
immutable. Derived lifecycle rows can be rebuilt from raw evidence.

## Provider and rollout plan

1. Verify code, `name`, `symbol`, `decimals`, and `totalSupply` on all 24 chains
   using inexpensive finalized `eth_call` requests.
2. Discover BridgeableTokenP addresses from Parallel's repository/deployments
   and confirm each contract's `getPrincipalToken()` onchain.
3. Capture current bridge peers, LayerZero EIDs, limits, fees, isolation, and
   credit/debit balance. Fail closed when a getter or peer is unproven.
4. Add aligned current supply snapshots before any historical bridge scan. This
   produces a useful 24-chain distribution view at low RPC cost.
5. Backfill bridge messages per route in bounded, resumable windows, beginning
   with the 16 deployments that have published bridge configuration.
6. Reconcile message GUIDs and only then promote global supply from candidate to
   verified.

This order avoids spending archive credits merely to learn that a deployment or
peer mapping was wrong.

## Official sources

- Parallel USDp/sUSDp product and address list:
  <https://docs.parallel.best/products/parallel-v3/stablecoins-and-savings/usdp-and-susdp>
- Parallel implementation, including Parallelizer, Savings, and Bridging
  modules:
  <https://docs.parallel.best/products/parallel-v3/stablecoins-and-savings/usdp-and-susdp/implementation>
- Parallel token contracts and deployment list:
  <https://github.com/parallel-protocol/parallel-tokens>
- `BridgeableTokenP` source:
  <https://github.com/parallel-protocol/parallel-tokens/blob/main/contracts/tokens/BridgeableTokenP/BridgeableTokenP.sol>
- LayerZero OFT reference:
  <https://docs.layerzero.network/v2/concepts/technical-reference/oft-reference>
