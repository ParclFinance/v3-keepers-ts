import {
  getExchangePda,
  getMarginAccountPda,
  MarginAccountWrapper,
  ParclV3Sdk,
  type Exchange,
  type MarginAccount,
} from "../v3-sdk-ts/src";
import type { Commitment } from "@solana/web3.js";
import * as dotenv from "dotenv";
import config from "./config";
import { Keypair, Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { getIndexUpdateData, type IndexUpdate } from "./utility";

import {
  findProfitableMarkets,
  initializeMarketWrappers,
  processMarketBatch,
  type MarketToTrade,
} from "./utility/market";
import { handleOpenPositions } from "./utility/openpositions";
import { TransactionManager } from "./utility/blockhash";

dotenv.config();

type RunPrclBotParams = {
  prclSDK: ParclV3Sdk;
  exchange: Exchange;
  delayTime: number;
  indexUpdateData: IndexUpdate;
  amountToTradeUSD: number;
  exchangeAddress: PublicKey;
  signer: Keypair;
  marginAccountAddress: PublicKey;
  connection: Connection;
  tradeOnAllProfitableMarkets: boolean;
};

function calculateTotalSharePrice(profitableMarkets: MarketToTrade[]): number {
  return profitableMarkets.reduce((sum, market) => {
    const sharesToTradeUSD = Number(market.sharesToTrade) * market.pythPriceFeed.price!;
    return sum + sharesToTradeUSD;
  }, 0);
}

async function executeTradesBatched(
  prclSDK: ParclV3Sdk,
  profitableMarkets: MarketToTrade[],
  sumPrice: number,
  connection: Connection,
  signer: Keypair,
  exchangeAddress: PublicKey,
  marginAccountAddress: PublicKey,
  marginAccount: MarginAccount,
  amountToTradeUSD: number
): Promise<void> {
  const batchSize = 3;
  const ratio = amountToTradeUSD > sumPrice ? 1 : amountToTradeUSD / sumPrice;

  let previousBatchesMarketAddress: PublicKey[] = [];
  let previousBatchesMarketPriceFeeds: PublicKey[] = [];

  for (let i = 0; i < profitableMarkets.length; i += batchSize) {
    const currentBatch = profitableMarkets.slice(i, i + batchSize);

    console.log(
      "Handling batch:",
      currentBatch.map((market) => market.marketWrapper.market.id)
    );

    const [marketAddresses, priceFeeds] = await processMarketBatch(
      prclSDK,
      currentBatch,
      ratio,
      connection,
      signer,
      exchangeAddress,
      marginAccountAddress,
      previousBatchesMarketAddress,
      previousBatchesMarketPriceFeeds
    );

    previousBatchesMarketAddress = [...previousBatchesMarketAddress, ...marketAddresses];
    previousBatchesMarketPriceFeeds = [...previousBatchesMarketPriceFeeds, ...priceFeeds];
  }
}

async function runPrclBot({
  prclSDK,
  exchange,
  delayTime,
  indexUpdateData,
  amountToTradeUSD,
  exchangeAddress,
  signer,
  marginAccountAddress,
  connection,
  tradeOnAllProfitableMarkets,
}: RunPrclBotParams) {
  console.log(`\n\nPRCL BOT INITIALIZED: trading with: ${amountToTradeUSD}$`);

  let firstRun = true;
  while (true) {
    if (firstRun) {
      firstRun = false;
    } else {
      await new Promise((resolve) => setTimeout(resolve, delayTime * 1000));
    }

    const currentTime = Date.now();

    const marginAccount = await prclSDK.accountFetcher.getMarginAccount(marginAccountAddress);

    if (!marginAccount) {
      throw new Error("failed to get margin account");
    }

    const marginAccountWrapper = new MarginAccountWrapper(marginAccount);
    const marketWrappers = await initializeMarketWrappers(prclSDK, exchange, exchangeAddress);
    if (currentTime > indexUpdateData.minTime && currentTime < indexUpdateData.maxTime) {
      console.log("Can't trade during index time");
      console.log("Closing all open positions at index time...");
      const openPositions = marginAccountWrapper.positions();
      await handleOpenPositions(
        prclSDK,
        exchangeAddress,
        marginAccountAddress,
        signer,
        openPositions,
        marketWrappers,
        connection,
        true
      );
      continue;
    }

    console.time("bot iteration time");

    console.log("handling open positions");

    if (!firstRun) {
      const openPositions = marginAccountWrapper.positions();
      await handleOpenPositions(
        prclSDK,
        exchangeAddress,
        marginAccountAddress,
        signer,
        openPositions,
        marketWrappers,
        connection
      );

      console.log("open positions: " + openPositions.length);

      if (openPositions.length > 0) continue;
    }

    const profitableMarkets = await findProfitableMarkets(
      prclSDK,
      marketWrappers,
      amountToTradeUSD,
      indexUpdateData,
      currentTime,
      tradeOnAllProfitableMarkets
    );

    console.log("profitable markets: " + profitableMarkets.length);
    if (profitableMarkets.length === 0) continue;

    const sumPrice = calculateTotalSharePrice(profitableMarkets);
    await executeTradesBatched(
      prclSDK,
      profitableMarkets,
      sumPrice,
      connection,
      signer,
      exchangeAddress,
      marginAccountAddress,
      marginAccount,
      amountToTradeUSD
    );
  }
}

async function main() {
  if (!process.env.RPC_URL) {
    throw new Error("Missing rpc url");
  }

  const commitment = process.env.COMMITMENT as Commitment | undefined;
  const prclSDK = new ParclV3Sdk({
    rpcUrl: process.env.RPC_URL,
    commitment,
  });

  const [exchangeAddress] = getExchangePda(0);
  const exchange = await prclSDK.accountFetcher.getExchange(exchangeAddress);
  if (!exchange) {
    throw new Error("Failed to fetch exchange");
  }

  const signer = Keypair.fromSecretKey(bs58.decode(process.env.KEYPAIR as string));

  const [marginAccountAddress] = getMarginAccountPda(
    exchangeAddress,
    signer.publicKey,
    config.marginAccountId
  );

  const marginAccount = await prclSDK.accountFetcher.getMarginAccount(marginAccountAddress);

  if (!marginAccount) {
    throw new Error("failed to get margin account");
  }

  const botConfig: RunPrclBotParams = {
    prclSDK,
    exchange,
    delayTime: parseInt(process.env.DELAY_TIME ?? "300"),
    indexUpdateData: getIndexUpdateData(config.indexTimes),
    amountToTradeUSD: config.amountToTradeUSD,
    exchangeAddress,
    signer,
    marginAccountAddress,
    connection: new Connection(process.env.RPC_URL),
    tradeOnAllProfitableMarkets: config.tradeOnAllProfitableMarkets,
  };

  await runPrclBot(botConfig);
}

main();
