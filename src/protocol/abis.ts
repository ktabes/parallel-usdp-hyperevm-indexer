import { parseAbi, toEventSelector } from "viem";

export const erc20Abi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

export const savingsAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function asset() view returns (address)",
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function rate() view returns (uint208)",
  "function lastUpdate() view returns (uint40)",
  "function estimatedAPR() view returns (uint256)",
  "function maxRate() view returns (uint256)",
  "function paused() view returns (uint8)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)",
  "event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)",
  "event Accrued(uint256 interest)",
  "event RateUpdated(uint256 newRate)",
  "event MaxRateUpdated(uint256 newMaxRate)",
  "event ToggledPause(uint128 pauseStatus)",
]);

export const parallelizerAbi = parseAbi([
  "function tokenP() view returns (address)",
  "function getCollateralList() view returns (address[])",
  "function getTotalIssued() view returns (uint256)",
  "function getCollateralRatio() view returns (uint64 collateralRatio, uint256 stablecoinsIssued)",
  "function facetAddresses() view returns (address[])",
  "event Swap(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address indexed from, address to)",
  "event Redeemed(uint256 amount, address[] tokens, uint256[] amounts, address[] forfeitTokens, address indexed from, address indexed to)",
]);

export const chainlinkAggregatorAbi = parseAbi([
  "function decimals() view returns (uint8)",
  "function description() view returns (string)",
  "function version() view returns (uint256)",
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
]);

export const protocolEventTopics = {
  transfer: toEventSelector("Transfer(address,address,uint256)"),
  deposit: toEventSelector("Deposit(address,address,uint256,uint256)"),
  withdraw: toEventSelector(
    "Withdraw(address,address,address,uint256,uint256)",
  ),
  accrued: toEventSelector("Accrued(uint256)"),
  rateUpdated: toEventSelector("RateUpdated(uint256)"),
  maxRateUpdated: toEventSelector("MaxRateUpdated(uint256)"),
  toggledPause: toEventSelector("ToggledPause(uint128)"),
  swap: toEventSelector(
    "Swap(address,address,uint256,uint256,address,address)",
  ),
  redeemed: toEventSelector(
    "Redeemed(uint256,address[],uint256[],address[],address,address)",
  ),
} as const;

export const ERC1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
