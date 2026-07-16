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

## Review links

- Live dashboard: <https://content-spirit-production-5efa.up.railway.app>
- Public repository:
  <https://github.com/ktabes/parallel-usdp-hyperevm-indexer>
- StableWatch integration API:
  <https://content-spirit-production-5efa.up.railway.app/api/v1/stablewatch/assets/parallel-usdp-susdp>
- Five-minute reviewer walkthrough:
  <https://github.com/ktabes/parallel-usdp-hyperevm-indexer/blob/main/docs/reviewer-runbook.md>

The credential-free command `npm run reviewer:proof` verifies service health,
complete 24-chain USDp supply, four-chain lifetime USDp+sUSDp analytics,
five-chain reconciled YPO, and the versioned StableWatch projection against the
public deployment.

## Suggested check-in message

> Hi — I wanted to follow up while you are reviewing my CV and share something
> directly relevant to StableWatch. I built a working cross-chain indexer and
> analytics dashboard for Parallel USDp and sUSDp, which are not currently
> represented on the StableWatch dashboard. It covers current USDp supply
> across 24 deployments, current sUSDp state on five chains, complete lifetime
> activity on Ethereum, Base, Sonic, and Avalanche, and a reconciled seven-day
> Yield Paid Out window that includes HyperEVM. I also included a versioned
> StableWatch-oriented API, explicit methodology/provenance, and a
> credential-free reviewer proof. Dashboard:
> https://content-spirit-production-5efa.up.railway.app — Repository:
> https://github.com/ktabes/parallel-usdp-hyperevm-indexer. I would really value
> any feedback and would be happy to walk through the schema and indexing
> decisions.
