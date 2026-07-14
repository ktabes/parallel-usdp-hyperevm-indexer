# Evidence record: Phase 1 protocol discovery candidate

- Date/time: 2026-07-14 19:00 UTC
- Git commit: repository commit containing this record
- Operator: Codex, testing the owner-selected Alchemy key and OnFinality public archive against the public HyperEVM baseline
- Manifest version: `hyperevm-usdp-candidate-v1`
- Current-state reference block: HyperEVM `40459916`, hash `0x90b628e9e0a19fded2afabe79e8382c5c4adef3e2aa8ffadd1cf182ab2479c81`
- Environment: local client with Railway-injected secrets; Railway PostgreSQL and service were already healthy

## Commands and results

```text
railway run npm run cli -- discover --rpc alchemy --block 40462847
CANDIDATE/CAPABILITY LIMIT - Alchemy returned every requested contract read, but the sUSDp oracle round ID was 40462859, twelve blocks after requested block 40462847. The response therefore does not prove pinned historical eth_call state and is not approval evidence.
PASS/SPARSE ARCHIVE PROBE - OnFinality returned exact sUSDp deployment block 5119222 and lastUpdate() = 0 at that block, proving the historical block parameter was honored for the sparse probe.

five OnFinality public block requests spaced five seconds apart
CAPACITY LIMIT - two succeeded and three returned HTTP 429. Full discovery on the anonymous shared endpoint is not reliable; an authenticated free-tier key is required for the approval run.

HYPEREVM_RPC_URL=https://rpc.hyperliquid.xyz/evm FINALITY_LAG=5 RPC_LOG_CHUNK_SIZE=50 npm run cli -- discover --block latest
PASS/CANDIDATE - chain 999; contract code, ERC-1967 implementations, token relationships, Parallelizer facets, collateral metadata, and DIA feeds verified. No failed checks.
EXPECTED WARN - the public provider ignored a historical eth_call block parameter, so this result is current-state discovery rather than pinned historical state.

HYPEREVM_RPC_URL=https://rpc.hyperliquid.xyz/evm FINALITY_LAG=5 RPC_LOG_CHUNK_SIZE=50 npm run cli -- preflight
PASS/CAPACITY LIMIT - bounded 1,000-block log sample completed. A complete seven-day scan would require 12,296 public-RPC requests at the provider's required 50-block chunks; lifetime sUSDp history would require 706,809.

npm run check
PASS - secret scan, formatting, ESLint, strict TypeScript, 27 deterministic tests, and the Next.js production build passed. Two opt-in integration/network tests were skipped by the default gate as designed.

RUN_NETWORK_TESTS=1 HYPEREVM_RPC_URL=https://rpc.hyperliquid.xyz/evm npm run test:network
PASS - the public endpoint returned HyperEVM mainnet chain ID 999.
```

## Provenance and identities

- USDp proxy `0xBE65F0F410A72BeC163dC65d46c83699e957D588` was deployed at block `5035286` in transaction `0x915212321e7364fe67bb474b74698b91e0bcf62d20f2537c862bd3523eb5c9ae`. The pinned ERC-1967 implementation equals official implementation `0x24CeF236056834f38e9247A1Fff6681Dd313D3aA`.
- sUSDp proxy `0x9B3a8f7CEC208e247d97dEE13313690977e24459` was deployed at block `5119222`; its live implementation equals `0x769F533139eb1723c41cADEc243ce10BC4d400Fd`, and `asset()` equals USDp.
- Parallelizer diamond `0x1250304F66404cd153fA39388DDCDAec7E0f1707` was deployed at block `5117819`. All eight expected facets were present, and `tokenP()` equals USDp.
- Deployment and ABI provenance is pinned to Parallel's official repositories at commits `b16007cec636f563c8a21e78349893b6a3720522` (`parallel-tokens`) and `fcfe2771edf64a604f015eb2682ef6a45c90d417` (`parallel-parallelizer`).

## Current-state evidence

In the Alchemy observation requested at block `40462847` (not accepted as pinned evidence):

- USDp total supply: `950896.580436635605778008` USDp.
- sUSDp total assets: `42044.039997139380042665` USDp.
- sUSDp shares: `39224.111233784315203117` sUSDp.
- Actual USDp balance held by sUSDp: `41914.762799964919629431` USDp.
- Pending native yield: `129.277197174460413234` USDp.
- Contract-estimated APR: approximately `10%` (`99999999999999984` fixed-18).
- `paused()` returned `1`. This is an observed current contract state, not a hard-coded protocol assumption.
- Parallelizer collateral list returned USDe (`0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34`) and sUSDe (`0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2`), both 18 decimals.

## Price evidence

- Official DIA USDp/USD feed `0x2189f3d9Be89808Dfe6C34446FE7aaDA7A5aD1b6`: `0.998001341791529856` USD, 18 decimals, fresh within the documented 12-hour maximum age.
- Official DIA sUSDp/USD feed `0xdcA437D1492Db6E9438A82Ad31Cab92E2eE159E1`: `1.069750391064082695` USD, 18 decimals.
- The sUSDp feed exactly matched, at 18-decimal precision in this observation, `USDp/USD * sUSDp.totalAssets() / sUSDp.totalSupply()`; measured difference was `0` basis points.

## Public RPC capacity evidence

The preflight finalized at block `40459629`:

- Seven-day range: blocks `39844836..40459629`, 614,794 blocks, 12,296 required `eth_getLogs` requests.
- Lifetime sUSDp range: blocks `5119222..40459629`, 35,340,408 blocks, 706,809 required requests.
- Bounded sample: blocks `40458630..40459629`, 1,000 blocks, completed with zero matching logs in that sample.

The zero-log sample is not evidence of zero historical protocol activity. It only proves the request shape and provider range constraint work.

## Provider boundaries and next gate

- The public Hyperliquid RPC remains suitable for current state and 50-block log chunks, but its historical `eth_call` behavior is not archival.
- The configured Alchemy endpoint returns recent reads but does not retain the old sUSDp deployment block. A future oracle round in a pinned request also prevents the project from labeling it as historical-state proof.
- OnFinality public archive returned the exact deployment block and historically correct contract state. Its shared public endpoint rate-limited a concurrent full-discovery attempt, so the implementation restricts it to paced, sparse historical proof calls.
- Phase 1 remains a candidate. Approval requires one complete discovery at a pinned finalized block through an authenticated OnFinality archive endpoint; the optional `ONFINALITY_API_KEY` integration is implemented for that run.
- The Alchemy key remains useful as a recent-state/log fallback. The public Hyperliquid RPC can still support a checkpointed seven-day demo backfill in 50-block chunks, but no historical or reconciled metric will be claimed before the relevant evidence gate passes.
