import type { MarketWrapper } from "../../v3-sdk-ts/src";

export async function calculateFee(
  marketWrapper: MarketWrapper,
  skewShares: number,
  isGoingLong: boolean,
  marketPrice: number,
  sharesToTrade: number
): Promise<number | undefined> {
  const makerFee = marketWrapper.market.settings.makerFeeRate / 1e2;
  const takerFee = marketWrapper.market.settings.takerFeeRate / 1e2;

  let initialFee;

  if (isGoingLong) {
    initialFee =
      skewShares + sharesToTrade < 0
        ? makerFee * sharesToTrade
        : takerFee * (skewShares + sharesToTrade) - makerFee * skewShares;
  } else {
    initialFee =
      skewShares - sharesToTrade > 0
        ? makerFee * sharesToTrade
        : takerFee * Math.abs(skewShares - sharesToTrade) +
          makerFee * skewShares;
  }

  const blendedFee = (initialFee * marketPrice) / 1e2;

  return blendedFee;
}
