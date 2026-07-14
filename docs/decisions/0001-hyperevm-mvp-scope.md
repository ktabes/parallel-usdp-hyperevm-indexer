# Decision 0001: HyperEVM-only Parallel MVP

- Status: accepted from owner brief; external publication decisions remain open
- Date: 2026-07-14

## Decision

Build the first shareable dataset for Parallel V3 USDp and sUSDp on HyperEVM. Index the issuer/parallelizer and ERC-4626 savings layer for the most recent finalized seven days. Treat native YPO, sUSDp state, exact flows, and reconciliation as the core proof.

External lending venues, cross-chain accounting, complete collateral valuation, and longer history are post-MVP work unless their absence prevents the core proof.

## Why

StableWatch does not currently present Parallel USDp/sUSDp, and its visible HyperEVM coverage is limited. A narrow, integration-ready implementation demonstrates chain knowledge and data-engineering rigor without confusing native savings semantics with lending-reserve semantics.

## Still requiring owner input before external actions

- Final public GitHub repository name and visibility.
- Railway project/environment and spending boundary.
- Whether StableWatch provides an expected adapter/export schema.
- Timing and wording of the CEO follow-up.
