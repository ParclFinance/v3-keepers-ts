//Hello, something I just wanted to mention in regards to the requirement "All trades must be minimum size to reduce impact on markets and associated trading fees" 
// is that the call in the sdk minpositionmargin does not actually give the minimum size to hold a position, I can go WAY below this, so feel free to manually set  
// this number to a low value like 0.0001 or something until this is fixed. Sorry I submitted slightly late, I didn't realize the UTC time changed as well as my own :joy:
// Hopefully this can serve you well, good luck. 

//Make sure to do the needed npm installs and additions
import { Connection, Keypair, ComputeBudgetProgram, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import {
  ParclV3Sdk,
  ParclV3AccountFetcher,
  parsePrice,
  getExchangePda,
  getMarginAccountPda,
  getMarketPda,
} from "../src"; // Ensure the correct package name
import * as dotenv from "dotenv";
import chalk from "chalk";
import Decimal from "decimal.js";

dotenv.config();

// Constants
const TRADE_INTERVAL = 5 * 60 * 1000; // 5-minute interval
const BATCH_SIZE = 5; // Number of markets per batch
// Define update times for all 22 markets (excluding crypto markets for obvious reasons)
const marketUpdateTimes: Record<number, { start: string; end: string }> = {
  1: { start: "11:30", end: "11:40" },
  2: { start: "11:30", end: "11:40" },
  3: { start: "11:30", end: "11:40" },
  4: { start: "11:30", end: "11:40" },
  5: { start: "11:30", end: "11:40" },
  6: { start: "11:30", end: "11:40" },
  7: { start: "11:30", end: "11:40" },
  8: { start: "11:30", end: "11:40" },
  9: { start: "11:30", end: "11:40" },
  10: { start: "11:30", end: "11:40" },
  11: { start: "11:30", end: "11:40" },
  12: { start: "11:30", end: "11:40" },
  13: { start: "11:30", end: "11:40" },
  14: { start: "11:30", end: "11:40" },
  15: { start: "11:30", end: "11:40" },
  16: { start: "11:30", end: "11:40" },
  17: { start: "11:30", end: "11:40" },
  18: { start: "11:30", end: "11:40" },
  19: { start: "11:30", end: "11:40" },
  20: { start: "11:30", end: "11:40" },
  21: { start: "11:30", end: "11:40" },
  22: { start: "11:30", end: "11:40" },
};

// SDK Initialization
const RPC_URL =
  "insertyourrpclinkhere";
const connection = new Connection(RPC_URL, "finalized");
const parclSDK = new ParclV3Sdk({ rpcUrl: RPC_URL });
const accountFetcher = new ParclV3AccountFetcher({ rpcUrl: RPC_URL });
const marginAccountId = 0;

// Private Key 
const keypairString = process.env.KEYPAIR;
if (!keypairString) throw new Error("KEYPAIR environment variable is not set");
const secretKey = bs58.decode(keypairString);
const signer = Keypair.fromSecretKey(secretKey);

// Market Wrapper Class
class MarketWrapper {
  market: any;
  marketAddress: PublicKey;

  constructor(market: any, marketAddress: PublicKey) {
    this.market = market;
    this.marketAddress = marketAddress;
  }
}

// Position tracker to store the sizeDelta for each marketId
const positionTracker = new Map<number, bigint>();

// Helper function to check if a specific market is within its update window
function isWithinMarketUpdateWindow(marketId: number): boolean {
  const updateWindow = marketUpdateTimes[marketId];
  if (!updateWindow) return false;

  const [startHour, startMinute] = updateWindow.start.split(":").map(Number);
  const [endHour, endMinute] = updateWindow.end.split(":").map(Number);

  const now = new Date();
  const startTime = new Date(now);
  const endTime = new Date(now);

  startTime.setUTCHours(startHour, startMinute, 0, 0);
  endTime.setUTCHours(endHour, endMinute, 0, 0);

  // Adjust endTime for midnight crossings
  if (endTime < startTime) {
    endTime.setDate(endTime.getDate() + 1);
  }

  return now >= startTime && now <= endTime;
}

// Helper function to filter out markets currently within their update window
function filterMarketsOutsideUpdateWindow(batch: MarketWrapper[]): MarketWrapper[] {
  return batch.filter((marketWrapper) => {
    const marketId = marketWrapper.market.id;
    const isExcluded = isWithinMarketUpdateWindow(marketId);
    if (isExcluded) {
      console.log(
        chalk.yellow(`Market ID ${marketId} is within its update window and will be skipped.`)
      );
    }
    return !isExcluded; // Only include markets outside their update window
  });
}

// Fetch index price using MarketWrapper
async function getIndexPrice(marketWrapper: MarketWrapper): Promise<number> {
  const priceFeed = await accountFetcher.getPythPriceFeed(
    marketWrapper.market.priceFeed
  );

  if (!priceFeed) throw new Error("Price feed not found");

  const isPythV2 = "priceMessage" in priceFeed!;
  const indexPrice = isPythV2
    ? new Decimal(priceFeed.priceMessage.price.toString())
        .div(10 ** -priceFeed.priceMessage.exponent)
        .toNumber()
    : priceFeed!.aggregate.price;

  return indexPrice;
}

// Fetch market data
async function fetchMarketData(): Promise<MarketWrapper[]> {
  try {
    const marketAccounts = await accountFetcher.getAllMarkets();

    if (!marketAccounts || marketAccounts.length === 0) {
      console.error("No market accounts found.");
      return [];
    }

    const [exchangeAddress] = getExchangePda(0);

    //Exclusion of crypto markets, not sure if these are to be included in the Data set with the RE markets. 
    return marketAccounts
      .filter((marketAccount: any) => {
        const marketId = marketAccount.account?.id;
        return marketAccount.account && marketId !== 23 && marketId !== 24;
      })

      .map((marketAccount: any) => {
        const marketId = marketAccount.account.id;
        const [marketAddress] = getMarketPda(exchangeAddress, marketId);
        const market = marketAccount.account;

        // Determine trade direction based on skew to always pay maker fees
        const skew = market.accounting.skew;
        const tradeDirection = skew > 0n ? "short" : "long"; // Use BigInt comparison

        console.log(
          chalk.green(`Fetched market ${marketId}:`),
          `skew=${skew}, tradeDirection=${tradeDirection}`
        );

        return new MarketWrapper(
          {
            ...market,
            tradeDirection,
          },
          marketAddress
        );
      });
  } catch (error) {
    console.error("Error fetching market data:", error);
    throw error;
  }
}

// Helper function to retry a transaction in case of failure
async function retryTransaction(
  transactionFn: () => Promise<void>,
  retries: number = 5,
  delay: number = 5000 // Delay between retries in milliseconds
) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await transactionFn(); // Execute the transaction function
      return; // If successful, exit the retry loop
    } catch (error) {
      console.error(
        chalk.red(`Transaction attempt ${attempt} failed: ${error.message}`)
      );
      if (attempt < retries) {
        console.log(chalk.yellow(`Retrying in ${delay / 1000} seconds...`));
        await new Promise((resolve) => setTimeout(resolve, delay)); // Wait before retrying
      } else {
        console.error(chalk.red("All retry attempts failed."));
        throw error; // Re-throw the error if retries are exhausted
      }
    }
  }
}

// Open positions for a batch of markets (chose the number of markets in a txn above in the constants section)
async function sendBatchTrades(batch: MarketWrapper[]) {
  const filteredBatch = filterMarketsOutsideUpdateWindow(batch);

  if (filteredBatch.length === 0) {
    console.log(chalk.yellow("All markets in this batch are within their update windows. Skipping this batch."));
    return;
  }

  await retryTransaction(async () => {
    try {
      const { blockhash } = await connection.getLatestBlockhash();

      const [exchangeAddress] = getExchangePda(0);
      const [marginAccount] = getMarginAccountPda(exchangeAddress, signer.publicKey, marginAccountId);

      const allMarketPublicKeys = filteredBatch.map((marketWrapper) => marketWrapper.marketAddress);
      const allPriceFeedPublicKeys = filteredBatch.map((marketWrapper) => marketWrapper.market.priceFeed);

      const transaction = parclSDK.transactionBuilder();

      // Manually adjust gas fees here for optimization, but keep in mind you will have to raise CU budget as you increase number of markets per txn. 
      transaction
        .instruction(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_500_000 }))
        .instruction(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 15_000 }));

      for (const marketWrapper of filteredBatch) {
        const tradeDirection = marketWrapper.market.tradeDirection;
        const indexPrice = await getIndexPrice(marketWrapper);
        const acceptablePrice =
          tradeDirection === "long"
            ? parsePrice(1.2 * indexPrice)
            : parsePrice(0.8 * indexPrice);

        const sizeDelta =
          tradeDirection === "short"
            ? -marketWrapper.market.settings.minPositionMargin
            : marketWrapper.market.settings.minPositionMargin;

        console.log(
          chalk.green(
            `Market ID: ${marketWrapper.market.id}, Trade Direction: ${tradeDirection}, SizeDelta: ${sizeDelta}`
          )
        );

        transaction.modifyPosition(
          {
            exchange: exchangeAddress,
            marginAccount,
            signer: signer.publicKey,
          },
          {
            sizeDelta,
            marketId: marketWrapper.market.id,
            acceptablePrice,
          },
          allMarketPublicKeys,
          allPriceFeedPublicKeys
        );

        positionTracker.set(marketWrapper.market.id, sizeDelta);
      }

      transaction.feePayer(signer.publicKey);
      const signedTransaction = transaction.buildSigned([signer], blockhash);

      const rawTransaction = signedTransaction.serialize();
      const txSignature = await connection.sendRawTransaction(rawTransaction, { skipPreflight: true });

      console.log("Transaction Sent. Awaiting Confirmation...");
      const confirmation = await connection.confirmTransaction(txSignature, "finalized");

      if (confirmation.value.err) {
        console.error("Transaction failed:", confirmation.value.err);
        throw new Error("Transaction failed");
      } else {
        console.log(`Transaction confirmed: ${txSignature}`);
      }
    } catch (error) {
      console.error("Error in sendBatchTrades:", error);
      throw error; // Ensure the retry logic catches this error
    }
  });
}

// Close positions for a batch of markets
async function closeBatchTrades(batch: MarketWrapper[]) {
  await retryTransaction(async () => {
    try {
      const { blockhash } = await connection.getLatestBlockhash();

      const [exchangeAddress] = getExchangePda(0);
      const [marginAccount] = getMarginAccountPda(exchangeAddress, signer.publicKey, marginAccountId);

      const allMarketPublicKeys = batch.map((marketWrapper) => marketWrapper.marketAddress);
      const allPriceFeedPublicKeys = batch.map((marketWrapper) => marketWrapper.market.priceFeed);

      const transaction = parclSDK.transactionBuilder();

            // Manually adjust gas fees here for optimization, but keep in mind you will have to raise CU budget as you increase number of markets per txn. 
      transaction
        .instruction(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_500_000 }))
        .instruction(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 15_000 }));

      for (const marketWrapper of batch) {
        const marketId = marketWrapper.market.id;

        const recordedSizeDelta = positionTracker.get(marketId);

        if (!recordedSizeDelta) {
          console.log(
            chalk.gray(`Market ID: ${marketId} has no recorded position, skipping.`)
          );
          continue;
        }

        const sizeDelta = -recordedSizeDelta;
        const indexPrice = await getIndexPrice(marketWrapper);

        const acceptablePrice =
          recordedSizeDelta < 0
            ? parsePrice(1.2 * indexPrice)
            : parsePrice(0.8 * indexPrice);

        console.log(
          chalk.yellow(
            `Closing position for Market ID: ${marketId}`
          )
        );

        transaction.modifyPosition(
          {
            exchange: exchangeAddress,
            marginAccount,
            signer: signer.publicKey,
          },
          {
            sizeDelta,
            marketId,
            acceptablePrice,
          },
          allMarketPublicKeys,
          allPriceFeedPublicKeys
        );

        positionTracker.delete(marketId);
      }

      transaction.feePayer(signer.publicKey);
      const signedTransaction = transaction.buildSigned([signer], blockhash);

      const rawTransaction = signedTransaction.serialize();
      const txSignature = await connection.sendRawTransaction(rawTransaction, { skipPreflight: true });

      console.log("Close Transaction Sent. Awaiting Confirmation...");
      const confirmation = await connection.confirmTransaction(txSignature, "finalized");

      if (confirmation.value.err) {
        console.error("Close transaction failed:", confirmation.value.err);
        throw new Error("Close transaction failed");
      } else {
        console.log(`Close transaction confirmed: ${txSignature}`);
      }
    } catch (error) {
      console.error("Error in closeBatchTrades:", error);
      throw error; // Ensure the retry logic catches this error
    }
  });
}

// Main bot logic
async function main() {
  const marketWrappers = await fetchMarketData();
  marketWrappers.forEach((wrapper) => {
    console.log(
      chalk.green(`Market ID: ${wrapper.market.id}`),
      {
        address: wrapper.marketAddress.toBase58(),
        priceFeed: wrapper.market.priceFeed,
        skew: wrapper.market.accounting.skew,
        minPositionMargin: wrapper.market.settings.minPositionMargin.toString(),
      }
    );
  });

  while (true) {
    console.log(chalk.blue("Executing batch trades..."));

    // Filter out markets within their update windows
    const availableMarkets = marketWrappers.filter(
      (wrapper) => !isWithinMarketUpdateWindow(wrapper.market.id)
    );

    if (availableMarkets.length === 0) {
      console.log(
        chalk.yellow(
          "All markets are currently within their update windows. Pausing until the next interval."
        )
      );
      await new Promise((resolve) => setTimeout(resolve, TRADE_INTERVAL));
      continue; // Skip to the next interval
    }

    const batches: MarketWrapper[][] = [];
    for (let i = 0; i < availableMarkets.length; i += BATCH_SIZE) {
      batches.push(availableMarkets.slice(i, i + BATCH_SIZE));
    }

    for (const batch of batches) {
      console.log(`Processing batch of ${batch.length} markets...`);
      try {
        // Attempt to open trades for the batch
        await sendBatchTrades(batch);

        // If successful, proceed to close the positions
        console.log(chalk.yellow("Closing positions for the batch..."));
        await closeBatchTrades(batch);
      } catch (error) {
        console.error(
          chalk.red(
            `Error processing batch trades for markets: ${batch.map(
              (wrapper) => wrapper.market.id
            )}. Skipping close function for this batch.`
            )
          );
        console.error(chalk.red(`Error details: ${error.message}`));
        continue; // Move to the next batch
      }
    }

    console.log(chalk.blue("Sleeping until next interval..."));
    await new Promise((resolve) => setTimeout(resolve, TRADE_INTERVAL));
  }
}

main().catch(console.error);