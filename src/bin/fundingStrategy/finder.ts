import { getMarketPda, Market, MarketWrapper, ParclV3Sdk, ProgramAccount } from "@parcl-oss/v3-sdk";
import { PublicKey } from "@solana/web3.js";
import Decimal from "decimal.js";


export async function findHighestFundingRate(
  sdk: ParclV3Sdk,
  exchangeAddress: PublicKey,
) {
  const exchange = await sdk.accountFetcher.getExchange(exchangeAddress);
  if (exchange === undefined) {
    throw new Error("Invalid exchange address");
  }
  const allMarketAddresses: PublicKey[] = [];
  const marketIds = exchange.marketIds.filter(marketId => marketId <= 22);
  for (const marketId of marketIds) {
    if (marketId === 0) {
      continue;
    }
    const [market] = getMarketPda(exchangeAddress, marketId);
    allMarketAddresses.push(market);
  }
  const allMarkets = await sdk.accountFetcher.getMarkets(allMarketAddresses);
  const highestAbsoluteFundingRate: { market: ProgramAccount<Market> | undefined; value: Decimal } =
    { market: undefined, value: new Decimal(0) };
  for (const market of allMarkets) {
    if (market === undefined) {
      continue;
    }
    //Only use if skew is less than 2%, so there is a decent chance of flipping maker/taker before 24 hours
    const size = parseFloat(market.account.accounting.size.toString());
    const skew = parseFloat(market.account.accounting.skew.toString());
    const skewPercent = .5 - (size/2 + skew/2)/size; //divide skew by 2 to match website
    console.log(`marketId ${market.account.id}, skewPercent: ${skewPercent}`);
    if(Math.abs(skewPercent) > 0.02) {
        continue;
    }
    const marketWrapper = new MarketWrapper(market.account);
    // Only use if funding rate pays the minority skew side
    if (
        (new Decimal(market.account.accounting.skew.toString())
            .mul(marketWrapper.lastFundingRate().val)
            .lt(0))) {
        continue;
    }
    const fundingRate = marketWrapper.lastFundingRate().val;
    if (Decimal.abs(fundingRate).gt(Decimal.abs(highestAbsoluteFundingRate.value))) {
      highestAbsoluteFundingRate.market = market;
      highestAbsoluteFundingRate.value = fundingRate;
    }
  }
  return highestAbsoluteFundingRate;
}
