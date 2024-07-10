import {
    ParclV3Sdk,
    getMarketPda,
    MarketMap,
    PriceFeedMap,
    Address,
    Exchange,
  } from "@parcl-oss/v3-sdk";
import { PublicKey } from "@solana/web3.js";
import { getMarketMapAndPriceFeedMap } from "./priceFeeds";
  
export function getAllMarketAddressesByExchange(exchangeAddress: Address, exchange: Exchange): PublicKey[] {
    const allMarketAddresses: PublicKey[] = [];
    for (const marketId of exchange.marketIds) {
      if (marketId === 0) {
        continue;
      }
      const [market] = getMarketPda(exchangeAddress, marketId);
      allMarketAddresses.push(market);
    } 
    return allMarketAddresses;
  }
  
export async function getMarketAccountsByExchange(
    sdk: ParclV3Sdk,
    exchangeAddress: Address,
): Promise<[Exchange, MarketMap, PriceFeedMap]> {
    let exchange = await sdk.accountFetcher.getExchange(exchangeAddress);
    if (exchange === undefined) {
      throw new Error("Invalid exchange address");
    }
    let allMarketAddresses = getAllMarketAddressesByExchange(exchangeAddress, exchange);
    const allMarkets = await sdk.accountFetcher.getMarkets(allMarketAddresses);
    const [markets, priceFeeds] = await getMarketMapAndPriceFeedMap(sdk, allMarkets);
    return [exchange, markets, priceFeeds];
}