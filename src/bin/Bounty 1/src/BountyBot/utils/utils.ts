import { type PriceData } from "@pythnetwork/client";
import { type PriceUpdateAccount } from "@pythnetwork/pyth-solana-receiver/lib/PythSolanaReceiver";
import type { PriceUpdateTimeUTC, PriceUpdateTimeEpoch } from "../types";
import Decimal from "decimal.js";

export function priceUpdateUTCToEpoch(
  indexTimes: PriceUpdateTimeUTC
): PriceUpdateTimeEpoch {
  const date = new Date();

  return {
    minTime: new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        indexTimes.min.hours,
        indexTimes.min.minutes
      )
    ).getTime(),
    maxTime: new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        indexTimes.max.hours,
        indexTimes.max.minutes
      )
    ).getTime(),
  };
}

export function getPriceFeed(
  priceFeed: PriceUpdateAccount | PriceData
): number {
  const isPythV2 = "priceMessage" in priceFeed;

  const indexPrice = isPythV2
    ? new Decimal(priceFeed.priceMessage.price.toString())
        .div(10 ** -priceFeed.priceMessage.exponent)
        .toNumber()
    : priceFeed.aggregate.price;

  return indexPrice;
}
