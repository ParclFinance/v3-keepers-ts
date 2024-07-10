import { getMarketAccountsByExchange } from "../../src/bin/utils";
import { describe } from "mocha";
import {
    ExchangeWrapper,
    MarginAccountWrapper,
    ParclV3Sdk,
    getExchangePda,
    MarketMap,
    PriceFeedMap,
    Exchange,
    Address,
    PreciseIntWrapper,
} from "@parcl-oss/v3-sdk";
import {
    Commitment,
    PublicKey,
} from "@solana/web3.js";
import pl from "nodejs-polars";
import * as dotenv from "dotenv";
dotenv.config();

describe("Margin Account Utilities", async () => {
    let sdk: ParclV3Sdk;
    let exchangeAddress: PublicKey;
    let exchange: Exchange;
    let markets: MarketMap;
    let priceFeeds: PriceFeedMap;

    const commitment: Commitment = "processed";

    before("Test Setup", async () => {
        if (process.env.RPC_URL === undefined) {
            throw new Error("Missing rpc url");
        }
        sdk = new ParclV3Sdk({ rpcUrl: process.env.RPC_URL, commitment });
        [exchangeAddress] = getExchangePda(0);
        [exchange, markets, priceFeeds] = await getMarketAccountsByExchange(sdk, exchangeAddress);
    });

    it("create all margin accounts dataframe", async () => {
        let rawMarginAccounts = await sdk.accountFetcher.getAllMarginAccounts();
        let marginAccountAddresses: Address[] = [];
        let marginLevels: number[] = [];
        let totalRequiredMargins: number[] = [];
        let numberOfPositions: number[] = [];
        let marginAmounts: number[] = [];
        let availableMargins: number[] = [];
        for (const rawMarginAccount of rawMarginAccounts) {
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
            availableMargins.push(availableMargin.val.toNumber());
            marginLevels.push(marginLevel.val.toNumber());
            numberOfPositions.push(marginAccount.positions().length);
            marginAmounts.push(marginAccount.margin(exchange.collateralExpo).val.toNumber());
            totalRequiredMargins.push(margins.totalRequiredMargin().val.toNumber());
            marginAccountAddresses.push(rawMarginAccount.address);
        }
        pl.DataFrame({
            "addresses": marginAccountAddresses,
            "numberOfPositions": numberOfPositions,
            "availableMargins": availableMargins,
            "totalRequiredMargins": totalRequiredMargins,
            "marginLevels": marginLevels,
        }).sort("marginlevels", false, true).writeCSV("./test/data/marginAccountsWithMargin.csv");
    });

    it("calculate margin level", async () => {
        let rawMarginAccounts = await sdk.accountFetcher.getMarginAccounts(["CkhnGuLD79ko5Lptqd6aswa1LC6HyNv7NtNqFfwx5MiN"]);
        if (rawMarginAccounts[0]) {
            const marginAccount = new MarginAccountWrapper(
                rawMarginAccounts[0].account,
                rawMarginAccounts[0].address
            );

            const margins = marginAccount.getAccountMargins(
                new ExchangeWrapper(exchange),
                markets,
                priceFeeds,
                Math.floor(Date.now() / 1000)
            );

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

            let margin = marginAccount.margin(exchange.collateralExpo).val;
            let rawMargin = rawMarginAccounts[0].account.margin;

            let collateralExpo = exchange.collateralExpo;
            let totalRequiredMargin = margins.totalRequiredMargin().val.toExponential();
            let marginLevel = availableMargin.div(margins.totalRequiredMargin()).val.toExponential();

            console.log(`margin: ${margin}`);
            console.log(`rawMargin: ${rawMargin}`);
            console.log(`PnL: ${totalPnl.val}`);
            console.log(`availableMargin: ${availableMargin.val.toExponential()}`);
            console.log(`collateralExpo: ${collateralExpo}`);
            console.log(`totalRequiredMargin: ${totalRequiredMargin}`);
            console.log(`marginLevel: ${marginLevel}`);
        }
    });

});
