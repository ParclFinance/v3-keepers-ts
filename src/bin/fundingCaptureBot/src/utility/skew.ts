import type { Market } from "../../v3-sdk-ts/src";

export type SkewData = {
  marketSkew: bigint;
  skewScale: bigint;
  skewLonged: boolean;
  skewShares: number;
  accountingSize: bigint;
};

export function getSkewData(marketAccount: Market): SkewData {
  const marketSkew = marketAccount.accounting.skew;
  const skewScale = marketAccount.settings.skewScale;
  const skewLonged = marketSkew > 0;
  const accountingSize = marketAccount.accounting.size;

  const skewShares = Number(marketAccount.accounting.skew) / 1e6;

  return {
    marketSkew,
    skewScale,
    skewLonged,
    accountingSize,
    skewShares,
  };
}
