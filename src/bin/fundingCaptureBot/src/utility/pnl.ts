import type { Market, MarketWrapper } from "../../v3-sdk-ts/src";

export function calculateExpectedPnL(
  marketWrapper: MarketWrapper,
  feePercentage: number,
  hourlyFundingRate: number,
  hoursUntilIndex: number,
  fundingVelocityDailyPercentage: number
): number {
  const takerFee = marketWrapper.market.settings.takerFeeRate / 1e2;

  const fundingVelocityHourlyPercentage = fundingVelocityDailyPercentage / 24;

  const fundingGainedPerc = Math.abs(
    hourlyFundingRate * hoursUntilIndex +
      0.5 * fundingVelocityHourlyPercentage * hoursUntilIndex ** 2
  );

  const totalProfitPercentage = fundingGainedPerc - feePercentage - takerFee; // takes the estimated profit from the funding (including velocity) and deducts the expected fees (opening fee and closing fee -> opening fee will be dependent on the size, closing fee must be taker unless closed on majority)

  const PnL = 100 + totalProfitPercentage;

  return PnL;
}
