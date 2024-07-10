import pl, { DataFrame } from "nodejs-polars";
import { existsSync } from "fs";
import {
  Address, 
  Exchange, 
  ExchangeWrapper, 
  MarginAccount, 
  MarginAccountWrapper, 
  MarketMap, 
  PreciseIntWrapper, 
  PriceFeedMap, 
  ProgramAccount
} from "@parcl-oss/v3-sdk";

export function createMarginAccountsDataFrame(
  rawMarginAccounts: (ProgramAccount<MarginAccount> | undefined)[],
  exchange: Exchange,
  markets: MarketMap,
  priceFeeds: PriceFeedMap,
): DataFrame {
  let marginAccountAddresses: Address[] = [];
  let marginLevels: number[] = [];
  let totalRequiredMargins: number[] = [];
  let numberOfPositions: number[] = [];
  let marginAmounts: number[] = [];
  let availableMargins: number[] = [];
  let inLiquidations: boolean[] = [];
  let PnLs: number[] = [];
  for (const rawMarginAccount of rawMarginAccounts) {
    if (rawMarginAccount) {
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

      let totalPnl = PreciseIntWrapper.zero();
      for (const position of marginAccount.positions()) {
        const market = markets[position.marketId()];
        const priceFeed = priceFeeds[market.priceFeed().toBase58()];
        const indexPrice = PreciseIntWrapper.fromDecimal(priceFeed.aggregate.price, 0);
        const nextFunding = market.getFundingPerUnit(
          indexPrice,
          PreciseIntWrapper.fromDecimal(Math.floor(Date.now()) / 1000, 0)
        );
        const pnlInfo = position.getPnl(indexPrice, nextFunding);
        totalPnl = totalPnl.add(pnlInfo.pnl);
      }
      const availableMargin = marginAccount.margin(exchange.collateralExpo).add(totalPnl);
      let marginLevel = availableMargin.div(margins.totalRequiredMargin());
      PnLs.push(totalPnl.val.toNumber());
      inLiquidations.push(marginAccount.inLiquidation());
      availableMargins.push(availableMargin.val.toNumber());
      marginLevels.push(marginLevel.val.toNumber());
      numberOfPositions.push(marginAccount.positions().length);
      marginAmounts.push(marginAccount.margin(exchange.collateralExpo).val.toNumber());
      totalRequiredMargins.push(margins.totalRequiredMargin().val.toNumber());
      marginAccountAddresses.push(rawMarginAccount.address);
    }
  }
  return pl.DataFrame({
    "addresses": marginAccountAddresses,
    "inLiquidations": inLiquidations,
    "PnLs": PnLs,
    "numberOfPositions": numberOfPositions,
    "availableMargins": availableMargins,
    "totalRequiredMargins": totalRequiredMargins,
    "marginLevels": marginLevels,
  }).sort("marginLevels", false, true);
}

export function getMarginAccountsAtBoundedMarginLevels(
    marginAccountsDataFrame: DataFrame,
    lowerBound: number,
    upperBound: number
): DataFrame {
    return marginAccountsDataFrame
        .filter(
            pl.col("marginLevels").gtEq(lowerBound)
              .and(pl.col("marginLevels").ltEq(upperBound))
        );
}

export function getMarginAccountsAtLiquidationLevel(
  marginAccountsDataFrame: DataFrame
): DataFrame {
  return marginAccountsDataFrame.filter(pl.col("marginLevels").lt(1.0e+15));
}

// need to refactor this into what is actually needed
// more of a POC
export function readInMarginAccountsJsonIntoDataFrameOrCreateNewDataFrame(): DataFrame {
  const MARGIN_ACCOUNTS_FILENAME = process.env.MARGIN_ACCOUNTS_FILENAME as string ?? "MARGIN_ACCOUNTS";
  let allMarginAccountsDataFrame: DataFrame;
  const MARGIN_ACCOUNTS_FILE_EXISTS = existsSync(`./data/${MARGIN_ACCOUNTS_FILENAME}.json`);
  if (MARGIN_ACCOUNTS_FILE_EXISTS) {
    allMarginAccountsDataFrame = pl.readJSON(`./data/${MARGIN_ACCOUNTS_FILENAME}.json`);
  } else {
    allMarginAccountsDataFrame = pl.DataFrame({
      "addresses": [],
      "liquidation_ratios": [],
    });
  }
  return allMarginAccountsDataFrame;
}