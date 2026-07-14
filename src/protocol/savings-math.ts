export const BASE_27 = 10n ** 27n;
export const HALF_BASE_27 = BASE_27 / 2n;

export function computeUpdatedAssets(
  currentBalance: bigint,
  ratePerSecond: bigint,
  elapsedSeconds: bigint,
) {
  if (elapsedSeconds === 0n || ratePerSecond === 0n) return currentBalance;

  const expMinusOne = elapsedSeconds - 1n;
  const expMinusTwo = elapsedSeconds > 2n ? elapsedSeconds - 2n : 0n;
  const basePowerTwo = (ratePerSecond * ratePerSecond + HALF_BASE_27) / BASE_27;
  const basePowerThree =
    (basePowerTwo * ratePerSecond + HALF_BASE_27) / BASE_27;
  const secondTerm = (elapsedSeconds * expMinusOne * basePowerTwo) / 2n;
  const thirdTerm =
    (elapsedSeconds * expMinusOne * expMinusTwo * basePowerThree) / 6n;

  return (
    (currentBalance *
      (BASE_27 + ratePerSecond * elapsedSeconds + secondTerm + thirdTerm)) /
    BASE_27
  );
}

export function calculatePendingYield(
  totalAssets: bigint,
  actualAssetBalance: bigint,
) {
  if (totalAssets < actualAssetBalance) {
    throw new Error("Pending yield cannot be negative");
  }
  return totalAssets - actualAssetBalance;
}

export function calculateNativeYpo(
  accruedInterest: bigint,
  pendingYieldAtStart: bigint,
  pendingYieldAtEnd: bigint,
) {
  const value = accruedInterest + pendingYieldAtEnd - pendingYieldAtStart;
  if (value < 0n) throw new Error("Native YPO cannot be negative");
  return value;
}
