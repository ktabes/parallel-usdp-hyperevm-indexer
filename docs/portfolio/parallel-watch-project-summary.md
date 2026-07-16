# Parallel USDp + sUSDp indexer — project summary

I built an independent cross-chain indexer and analytics surface for Parallel
V3 USDp and sUSDp because the assets were not represented on StableWatch. The
project treats USDp as one omnichain stablecoin and sUSDp as its five-chain
ERC-4626 savings product, rather than reducing either asset to HyperEVM alone.

The implementation captures finalized contract state and logs, stores durable
block-level provenance in PostgreSQL, derives native flows and Yield Paid Out,
and gates every aggregate on coverage and reconciliation. Missing history is
returned as typed unavailable data instead of being estimated or silently
zeroed. The finished dataset includes complete lifetime USDp and sUSDp activity
on Ethereum, Base, Sonic, and Avalanche, plus one aligned, independently
reconciled seven-day YPO across all five sUSDp chains. The public inspection
page makes the exact coverage and calculation versions visible to a reviewer.

For integration, I added a versioned StableWatch-oriented API contract that
maps the evidence into a market row and asset detail while preserving exact
integer precision, source attribution, availability, and verification status.
The codebase includes tests, an OpenAPI handoff, methodology and schema notes,
resumable backfills, Railway deployment support, a credential-free public proof
command, and a documented path from complete 24-chain contract supply to
verified LayerZero bridge accounting.

Live service: <https://content-spirit-production-5efa.up.railway.app>

API: <https://content-spirit-production-5efa.up.railway.app/api/v1/stablewatch/assets/parallel-usdp-susdp>

Suggested check-in sentence:

> While you were reviewing my CV, I built a working cross-chain USDp/sUSDp
> indexer for an asset that StableWatch does not currently cover. It includes a
> public inspection dashboard, a versioned integration payload, and explicit
> coverage/reconciliation evidence rather than opaque totals. I would be glad
> to send the repository and walk through the data model.
