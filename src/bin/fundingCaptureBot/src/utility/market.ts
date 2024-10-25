import type { IndexUpdate } from ".";
import {
  getMarketPda,
  MarketWrapper,
  ParclV3Sdk,
  parseSize,
  type Exchange,
} from "../../v3-sdk-ts/src";
import { calculateExpectedPnL } from "./pnl";
import { getSkewData } from "./skew";
import { type PriceData } from "@pythnetwork/client";
import { Connection, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import { calculateAcceptablePrice } from "./transaction";
import type { Keypair } from "@solana/web3.js";
import { TransactionManager } from "./blockhash";
import { ComputeBudgetProgram } from "@solana/web3.js";
import { sign } from "crypto";

const HOURS_PER_DAY = 24;
const MS_TO_HOURS = 1000 * 60 * 60;
const FUNDING_RATE_DENOMINATOR = 1e13;
const FUNDING_VELOCITY_DENOMINATOR = 1e11;
const PERCENTAGE_MULTIPLIER = 100;

export interface MarketToTrade {
  marketWrapper: MarketWrapper;
  expectedPnL: number;
  sharesToTrade: number;
  pythPriceFeed: PriceData;
  isGoingLong: boolean;
}

export async function getMarketData(
  prclSDK: ParclV3Sdk,
  marketWrapper: MarketWrapper,
  amountToTradeUSD: number,
  indexUpdateData: IndexUpdate,
  currentTime: number
): Promise<MarketToTrade | undefined> {
  const [skewData, pythPriceFeed] = await Promise.all([
    Promise.resolve(getSkewData(marketWrapper.market)),
    prclSDK.accountFetcher.getPythPriceFeed(marketWrapper.priceFeed()) as Promise<PriceData>,
  ]);

  if (!pythPriceFeed?.price) {
    return undefined;
  }

  const lastFundingRateValue = marketWrapper
    .lastFundingRate()
    .val.dividedBy(FUNDING_RATE_DENOMINATOR);

  const shouldGoLong = !skewData.skewLonged && lastFundingRateValue.lessThan(0);
  const shouldGoShort = skewData.skewLonged && lastFundingRateValue.greaterThan(0);

  if (!shouldGoLong && !shouldGoShort) {
    return undefined;
  }

  const isGoingLong = shouldGoLong;

  const sharesToTrade = Math.abs(Number(marketWrapper.market.accounting.skew) / 1000000);

  const fee = marketWrapper.market.settings.makerFeeRate / 1e2;

  if (!fee) {
    return undefined;
  }

  const hourlyFundingRate = Number(lastFundingRateValue.dividedBy(HOURS_PER_DAY));
  const fundingVelocityDailyPercentage = Number(
    marketWrapper.getCurrentFundingVelocity().val.dividedBy(FUNDING_VELOCITY_DENOMINATOR)
  );
  const timeUntilIndexHours = (indexUpdateData.minTime - currentTime) / MS_TO_HOURS + HOURS_PER_DAY;

  const expectedPnL = calculateExpectedPnL(
    marketWrapper,
    fee,
    hourlyFundingRate,
    timeUntilIndexHours,
    fundingVelocityDailyPercentage
  );

  const marketData: MarketToTrade = {
    marketWrapper,
    expectedPnL,
    sharesToTrade,
    pythPriceFeed,
    isGoingLong,
  };

  return marketData;
}

export async function initializeMarketWrappers(
  prclSDK: ParclV3Sdk,
  exchange: Exchange,
  exchangeAddress: PublicKey
): Promise<MarketWrapper[]> {
  const marketAddresses = exchange.marketIds.map((marketId) => {
    const [marketAddress] = getMarketPda(exchangeAddress, marketId);
    return marketAddress;
  });

  const markets = await prclSDK.accountFetcher.getMarkets(marketAddresses);
  return markets
    .filter((market) => market !== undefined)
    .map((market) => new MarketWrapper(market.account));
}

export async function findProfitableMarkets(
  prclSDK: ParclV3Sdk,
  marketWrappers: MarketWrapper[],
  amountToTradeUSD: number,
  indexUpdateData: IndexUpdate,
  currentTime: number,
  tradeOnAllProfitableMarkets: boolean
): Promise<MarketToTrade[]> {
  const marketPromises = marketWrappers.map((marketWrapper) =>
    getMarketData(prclSDK, marketWrapper, amountToTradeUSD, indexUpdateData, currentTime)
  );

  const marketResults = await Promise.all(marketPromises);
  let profitableMarkets = marketResults.filter(
    (result): result is MarketToTrade => result !== undefined && result.expectedPnL > 100
  );

  if (!tradeOnAllProfitableMarkets) {
    profitableMarkets.sort((a, b) => b.expectedPnL - a.expectedPnL);
    profitableMarkets.length = 1;
  }

  return profitableMarkets;
}
export async function processMarketBatch(
  prclSDK: ParclV3Sdk,
  batch: MarketToTrade[],
  ratio: number,
  connection: Connection,
  signer: Keypair,
  exchangeAddress: PublicKey,
  marginAccountAddress: PublicKey,
  previousBatchesMarketAddress: PublicKey[],
  previousBatchesMarketPriceFeeds: PublicKey[]
): Promise<PublicKey[][]> {
  let transaction = prclSDK.transactionBuilder();

  const marketsAddresses = batch.map((market) => {
    const [marketAddress] = getMarketPda(exchangeAddress, market.marketWrapper.market.id);
    return marketAddress;
  });

  const marketsPriceFeeds = batch.map((market) => market.marketWrapper.priceFeed());

  const allMarketAddresses = [...previousBatchesMarketAddress, ...marketsAddresses];
  const allPriceFeeds = [...previousBatchesMarketPriceFeeds, ...marketsPriceFeeds];

  for (const marketToTrade of batch) {
    transaction.modifyPosition(
      {
        exchange: exchangeAddress,
        marginAccount: marginAccountAddress,
        signer: signer.publicKey,
      },
      {
        sizeDelta: parseSize(
          ((ratio * Number(marketToTrade.marketWrapper.market.accounting.skew)) / 1e6) * -1
        ),
        marketId: marketToTrade.marketWrapper.market.id,
        acceptablePrice: calculateAcceptablePrice(
          marketToTrade.isGoingLong,
          marketToTrade.pythPriceFeed.price!
        ),
      },
      allMarketAddresses,
      allPriceFeeds
    );
  }

  transaction.instruction(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: allMarketAddresses.length * 200_000,
    })
  );

  const tm = new TransactionManager(connection);
  const blockhash = await tm.getLatestBlockhash();

  const tx = transaction.feePayer(signer.publicKey).buildSigned([signer], blockhash);

  try {
    const result = await sendAndConfirmTransaction(connection, tx, [signer]);
  } catch (e) {
    if (JSON.stringify(e).includes("Error Number: 6000")) {
      //prcl integer overflow bug - completely random

      await processMarketBatch(
        prclSDK,
        batch,
        ratio,
        connection,
        signer,
        exchangeAddress,
        marginAccountAddress,
        previousBatchesMarketAddress,
        previousBatchesMarketPriceFeeds
      );
    }
  }

  return [marketsAddresses, marketsPriceFeeds];
}
