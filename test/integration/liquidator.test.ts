import { 
    getMarketMapAndPriceFeedMap, 
    getMarketAccountsByExchange, 
    getAllMarketAddressesByExchange,
    createMarginAccountsDataFrame,
    getMarginAccountsAtBoundedMarginLevels
} from "../../src/bin/utils";
import { describe } from "mocha";
import {
  ProgramAccount,
  ParclV3Sdk,
  getExchangePda,
  MarketMap,
  PriceFeedMap,
  MarginAccount,
  Exchange,
} from "@parcl-oss/v3-sdk";
import {
  Commitment,
  PublicKey,
} from "@solana/web3.js";
import * as dotenv from "dotenv";
import pl, { DataFrame } from "nodejs-polars";
dotenv.config();

describe("Testing Liquidator Helpers", async () => {
    let sdk: ParclV3Sdk;
    let exchangeAddress: PublicKey;
    let exchange: Exchange;
    let markets: MarketMap;
    let priceFeeds: PriceFeedMap;
    let priorityMarginAccounts: (ProgramAccount<MarginAccount> | undefined)[];
    let marginAccountsAtLiquidationMarginLevelDataFrame: DataFrame;
    let priorityMarginAccountsDataFrame: DataFrame;
    let allMarginAccountsDataFrame: DataFrame;
    const commitment: Commitment = "processed";

    before("Test Setup", async () => {
        if (process.env.RPC_URL === undefined) {
            throw new Error("Missing rpc url");
        }        
        sdk = new ParclV3Sdk({ rpcUrl: process.env.RPC_URL, commitment });
        [exchangeAddress] = getExchangePda(0);
        [exchange, markets, priceFeeds] = await getMarketAccountsByExchange(sdk, exchangeAddress);
        allMarginAccountsDataFrame = pl.readCSV("./test/data/marginAccountsWithMargin.csv");
        priorityMarginAccountsDataFrame = getMarginAccountsAtBoundedMarginLevels(allMarginAccountsDataFrame, 0, 1.1e+16);
    });

    it("priceFeedUpdateRoutine", async () => {
        console.log("Price Feed Update");
        let priceFeedRoutineStart = performance.now();

        // update price feeds
        const allMarketAddresses = getAllMarketAddressesByExchange(exchangeAddress, exchange);
        const allMarkets = await sdk.accountFetcher.getMarkets(allMarketAddresses);
        [markets, priceFeeds] = await getMarketMapAndPriceFeedMap(sdk, allMarkets);

        priorityMarginAccounts = await sdk.accountFetcher.getMarginAccounts(priorityMarginAccountsDataFrame.getColumn("addresses").toArray());
        priorityMarginAccountsDataFrame = createMarginAccountsDataFrame(priorityMarginAccounts, exchange, markets, priceFeeds); 
        priorityMarginAccountsDataFrame = getMarginAccountsAtBoundedMarginLevels(priorityMarginAccountsDataFrame, 0, 1.1e+16);

        console.log(`Scanning ${priorityMarginAccounts.length} priority margin accounts`);
        // await scanAndLiquidateMarginAccounts(sdk, connection, priorityMarginAccounts, markets, priceFeeds, exchange, liquidatorSigner, liquidatorMarginAccount);
        let timePriceFeedRoutineEnds= performance.now();
        console.log(`priceFeed routine took ${timePriceFeedRoutineEnds - priceFeedRoutineStart} milliseconds.`);
    });

    it("how many account's availableMargin is less than their totalRequiredMargins", async () => {
        let allMarginAccounts = await sdk.accountFetcher.getAllMarginAccounts();
        allMarginAccountsDataFrame = createMarginAccountsDataFrame(allMarginAccounts, exchange, markets, priceFeeds);
        marginAccountsAtLiquidationMarginLevelDataFrame = allMarginAccountsDataFrame.filter(pl.col("availableMargins").lt(pl.col("totalRequiredMargins")));
        console.log(marginAccountsAtLiquidationMarginLevelDataFrame.shape);
    })

    it("allMarginAccounts scanning routine", async () => {

    });

});