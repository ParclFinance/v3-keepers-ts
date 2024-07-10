import {
  ProgramAccount,
  MarginAccountWrapper,
  ExchangeWrapper,
  MarketMap,
  PriceFeedMap,
  MarginAccount,
  Exchange,
} from "@parcl-oss/v3-sdk";
import {
  PublicKey,
} from "@solana/web3.js";
import Decimal from "decimal.js";

export function getMarginAccountAddressesAndMarginLevels(
  marginAccounts: ProgramAccount<MarginAccount>[],
  exchange: Exchange,
  markets: MarketMap,
  priceFeeds: PriceFeedMap,
): [(string | PublicKey)[], Decimal[]] {
  let marginAccountAddresses = [];
  let marginAccountLiquidationRatios = [];
  for (const rawMarginAccount of marginAccounts) {
    const marginAccount = new MarginAccountWrapper(
      rawMarginAccount.account,
      rawMarginAccount.address
    );
    const margins = marginAccount.getAccountMargins(
      new ExchangeWrapper(exchange),
      markets,
      priceFeeds,
      Math.floor(Date.now() / 1000)
    );
    if (margins.totalRequiredMargin().isZero()) {
      continue;
    }
    let marginLevel = marginAccount.margin(exchange.collateralExpo).div(margins.totalRequiredMargin());
    marginAccountAddresses.push(rawMarginAccount.address);
    marginAccountLiquidationRatios.push(marginLevel.val);
  }
  return [marginAccountAddresses, marginAccountLiquidationRatios];
}