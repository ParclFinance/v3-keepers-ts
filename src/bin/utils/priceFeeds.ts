import {
    ProgramAccount,
    Market,
    ParclV3Sdk,
    MarginAccountWrapper,
    MarketWrapper,
    MarketMap,
    PriceFeedMap,
    Address,
    Exchange,
  } from "@parcl-oss/v3-sdk";
import { PublicKey } from "@solana/web3.js";
import { getAllMarketAddressesByExchange } from "./marketAccounts";

export async function getAllMarketsAndPriceFeedsByExchange(sdk: ParclV3Sdk, exchangeAddress: PublicKey, exchange: Exchange) {
  const allMarketAddresses = getAllMarketAddressesByExchange(exchangeAddress, exchange);
  const allMarkets = await sdk.accountFetcher.getMarkets(allMarketAddresses);
  return await getMarketMapAndPriceFeedMap(sdk, allMarkets);
}

export async function getMarketMapAndPriceFeedMap(
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

export function getMarketsAndPriceFeeds(
  marginAccount: MarginAccountWrapper,
  markets: MarketMap
): [Address[], Address[]] {
  const marketAddresses: Address[] = [];
  const priceFeedAddresses: Address[] = [];
  for (const position of marginAccount.positions()) {
    const market = markets[position.marketId()];
    if (market.address === undefined) {
      throw new Error(`Market is missing from markets map (id=${position.marketId()})`);
    }
    marketAddresses.push(market.address);
    priceFeedAddresses.push(market.priceFeed());
  }
  return [marketAddresses, priceFeedAddresses];
}