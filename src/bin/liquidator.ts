import {
  Address,
  Exchange,
  MarginAccount,
  MarketMap,
  ParclV3Sdk,
  PriceFeedMap,
  ProgramAccount,
  getExchangePda,
  translateAddress,
} from "@parcl-oss/v3-sdk";
import {
  Commitment,
  Connection,
  Keypair,
} from "@solana/web3.js";
import bs58 from "bs58";
import { RunLiquidatorParams } from "./types";
import { 
  getAllMarketAddressesByExchange, 
  getMarketAccountsByExchange, 
  getMarketMapAndPriceFeedMap, 
  scanAndLiquidateMarginAccounts, 
  createMarginAccountsDataFrame,
  getMarginAccountsAtBoundedMarginLevels,
} from "./utils";
import * as dotenv from "dotenv";
import { DataFrame } from "nodejs-polars";
dotenv.config();

(async function main() {
  console.log("Starting liquidator");
  if (process.env.RPC_URL === undefined) {
    throw new Error("Missing rpc url");
  }
  if (process.env.LIQUIDATOR_MARGIN_ACCOUNT === undefined) {
    throw new Error("Missing liquidator margin account");
  }
  if (process.env.PRIVATE_KEY === undefined) {
    throw new Error("Missing liquidator signer");
  }
  // Note: only handling single exchange
  const [exchangeAddress] = getExchangePda(0);
  const liquidatorMarginAccount = translateAddress(process.env.LIQUIDATOR_MARGIN_ACCOUNT);
  const liquidatorSigner = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY));
  const priceFeedsUpdateInterval = parseInt(process.env.PRICE_FEEDS_UPDATE_INTERVAL ?? "60");
  const allMarginAccountsScanInterval = parseInt(process.env.ALL_MARGIN_ACCOUNTS_SCAN_INTERVAL ?? "600");
  const commitment = process.env.COMMITMENT as Commitment | undefined;
  const sdk = new ParclV3Sdk({ rpcUrl: process.env.RPC_URL, commitment });
  const connection = new Connection(process.env.RPC_URL, commitment);
  await runLiquidator({
    sdk,
    connection,
    priceFeedsUpdateInterval,
    allMarginAccountsScanInterval,
    exchangeAddress,
    liquidatorSigner,
    liquidatorMarginAccount,
  });
})();

export async function runLiquidator({
  sdk,
  connection,
  priceFeedsUpdateInterval,
  allMarginAccountsScanInterval,
  exchangeAddress,
  liquidatorSigner,
  liquidatorMarginAccount,
}: RunLiquidatorParams): Promise<void> {

  // Initial Price Feed Update
  console.log("Initial Price Update");
  let [exchange, markets, priceFeeds] = await getMarketAccountsByExchange(sdk, exchangeAddress);
  const allMarketAddresses = getAllMarketAddressesByExchange(exchangeAddress, exchange);
  let timePriceFeedsLastUpdated = performance.now();
  
  // Init Full Margin Account Scan
  console.log("Initial Full Margin Account Scan");
  let [priorityMarginAccounts, priorityMarginAccountsDataFrame] = await fullMarginAccountScanRoutine(sdk, exchange, markets, priceFeeds);

  let timeAllMarginAccountsLastScanned = performance.now();
  console.log(`Initial Full Margin Account Scan took ${(timeAllMarginAccountsLastScanned - timePriceFeedsLastUpdated) / 1000} seconds.`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let now = performance.now();

    // priceFeedsUpdateRoutine
    if (now - timePriceFeedsLastUpdated > priceFeedsUpdateInterval * 1000) {
      console.log("Price Feed Update Routine");
      [markets, priceFeeds, priorityMarginAccountsDataFrame, priorityMarginAccounts] = await priceFeedsUpdateRoutine(
        sdk, 
        connection,
        allMarketAddresses,
        exchange,
        priorityMarginAccountsDataFrame,
        liquidatorSigner,
        liquidatorMarginAccount
      );
      timePriceFeedsLastUpdated = performance.now();
      console.log(`Scanned ${priorityMarginAccounts.length} priority margin accounts.`);
      console.log(`Price Feed Update Routine took ${(timePriceFeedsLastUpdated - now) / 1000} seconds.`);
    }

    // fullMarginAccountScanRoutine
    if (now - timeAllMarginAccountsLastScanned > allMarginAccountsScanInterval * 1000) {
      console.log("Full Margin Account Scan Routine");
      [priorityMarginAccounts, priorityMarginAccountsDataFrame] = await fullMarginAccountScanRoutine(sdk, exchange, markets, priceFeeds);
      timeAllMarginAccountsLastScanned = performance.now();
      console.log(`Scanned ${priorityMarginAccounts.length} margin accounts`);
      console.log(`Full Margin Account Scan routine took ${(timeAllMarginAccountsLastScanned - now) / 1000} seconds.`);
    }

    // Sleep
    console.log("Sleeping for a second...");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

export async function fullMarginAccountScanRoutine(
  sdk: ParclV3Sdk,
  exchange: Exchange,
  markets: MarketMap,
  priceFeeds: PriceFeedMap, 
): Promise<[(ProgramAccount<MarginAccount> | undefined)[], DataFrame]> {
  // Scan all margin accounts and distill down to priority accounts
  let allMarginAccounts = await sdk.accountFetcher.getAllMarginAccounts();
  let allMarginAccountsDataFrame = createMarginAccountsDataFrame(allMarginAccounts, exchange, markets, priceFeeds);
  let priorityMarginAccountsDataFrame = getMarginAccountsAtBoundedMarginLevels(allMarginAccountsDataFrame, 0, 1.1e+16);
  let allMarginAccountAddresses = allMarginAccountsDataFrame.getColumn("addresses").toArray();
  let priorityMarginAccounts = allMarginAccounts.filter((marginAccount) => allMarginAccountAddresses.includes(marginAccount.address));

  // Write to disk
  console.log("Saving All Margin Accounts && Priority Margin Accounts to disk");
  allMarginAccountsDataFrame.writeCSV(`./data/All-Margin-Accounts-${Date.now()/1000}.csv`);
  priorityMarginAccountsDataFrame.writeCSV(`./data/Priority-Margin-Accounts-${Date.now()/1000}.csv`);

  return [
    priorityMarginAccounts,
    priorityMarginAccountsDataFrame,
  ];
}

export async function priceFeedsUpdateRoutine(
  sdk: ParclV3Sdk,
  connection: Connection, 
  allMarketAddresses: Address[],
  exchange: Exchange,
  priorityMarginAccountsDataFrame: DataFrame,
  liquidatorSigner: Keypair,
  liquidatorMarginAccount: Address,
): Promise<[MarketMap, PriceFeedMap, DataFrame, (ProgramAccount<MarginAccount> | undefined)[]]> {
  // Update price feeds
  const allMarkets = await sdk.accountFetcher.getMarkets(allMarketAddresses);
  let [markets, priceFeeds] = await getMarketMapAndPriceFeedMap(sdk, allMarkets);

  // Update Priority Accounts DataFrame and filter it down if possible
  let priorityMarginAccounts = await sdk.accountFetcher.getMarginAccounts(priorityMarginAccountsDataFrame.getColumn("addresses").toArray());
  priorityMarginAccountsDataFrame = createMarginAccountsDataFrame(priorityMarginAccounts, exchange, markets, priceFeeds); 
  priorityMarginAccountsDataFrame = getMarginAccountsAtBoundedMarginLevels(priorityMarginAccountsDataFrame, 0, 1.1e+16);

  // Remove any margin accounts that were eliminated from priority margin accounts
  // This should be handled with better care as it seems possible to lose accounts that should be tracked
  let priorityMarginAccountAddresses = priorityMarginAccountsDataFrame.getColumn("addresses").toArray();
  priorityMarginAccounts = priorityMarginAccounts.filter((marginAccount) => priorityMarginAccountAddresses.includes(marginAccount?.address));

  // Refactor scanAndLiquidateMarginAccounts and bring this operation up one layer of abstraction in order to make it more composable with other routines
  await scanAndLiquidateMarginAccounts(sdk, connection, priorityMarginAccounts, markets, priceFeeds, exchange, liquidatorSigner, liquidatorMarginAccount);

  return [
    markets, 
    priceFeeds,
    priorityMarginAccountsDataFrame,
    priorityMarginAccounts
  ];
}