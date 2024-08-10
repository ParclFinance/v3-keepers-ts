import {
  Address,
  Exchange,
  getMarketPda,
  Market,
  MarketMap,
  MarketWrapper,
  ParclV3Sdk,
  PriceFeedMap,
  ProgramAccount,
} from "@parcl-oss/v3-sdk";

export async function fetchMarketData(
  exchange: Exchange,
  exchangeAddress: Address,
  sdk: ParclV3Sdk
): Promise<[MarketMap, PriceFeedMap]> {
  const marketIdsToFetch = exchange.marketIds.filter((marketId) => marketId !== 0);
  const allMarketAddresses = marketIdsToFetch.map(
    (marketId) => getMarketPda(exchangeAddress, marketId)[0]
  );
  const allMarkets = await sdk.accountFetcher.getMarkets(allMarketAddresses);
  return await getMarketMapAndPriceFeedMap(sdk, allMarkets);

  // const marketMap = await exchange.getMarketMap();
  // const priceFeedMap = await exchange.getPriceFeedMap();
  // return [marketMap, priceFeedMap];
}

async function getMarketMapAndPriceFeedMap(
  sdk: ParclV3Sdk,
  allMarkets: (ProgramAccount<Market> | undefined)[]
): Promise<[MarketMap, PriceFeedMap]> {
  const markets: MarketMap = {};
  for (const market of allMarkets) {
    if (market === undefined) {
      continue;
    }
    markets[market.account.id] = new MarketWrapper(market.account, market.address);
  }
  const allPriceFeedAddresses = (allMarkets as ProgramAccount<Market>[]).map(
    (market) => market.account.priceFeed
  );
  const allPriceFeeds = await sdk.accountFetcher.getPythPriceFeeds(allPriceFeedAddresses);
  const priceFeeds: PriceFeedMap = {};
  for (let i = 0; i < allPriceFeeds.length; i++) {
    const priceFeed = allPriceFeeds[i];
    if (priceFeed === undefined) {
      continue;
    }
    priceFeeds[allPriceFeedAddresses[i]] = priceFeed;
  }
  return [markets, priceFeeds];
}
