import { PriceData } from "@pythnetwork/client";
import { PriceUpdateAccount } from "@pythnetwork/pyth-solana-receiver/lib/PythSolanaReceiver";

type PriceFeed = PriceData | PriceUpdateAccount;

export function getPriceFromFeed(priceFeed: PriceFeed) {
  if ("priceMessage" in priceFeed) {
    if (
      priceFeed.priceMessage.price === undefined ||
      priceFeed.priceMessage.exponent === undefined
    ) {
      throw new Error("Invalid price feed");
    }
    return priceFeed.priceMessage.price.toNumber() * 10 ** priceFeed.priceMessage.exponent;
  } else {
    return priceFeed.aggregate.price;
  }
}
