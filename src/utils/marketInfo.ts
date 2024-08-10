import { Decimal } from "decimal.js";
import {
  ParclV3Sdk,
  getExchangePda,
  MarketWrapper,
  // ExchangeWrapper,
  PreciseIntWrapper,
} from "@parcl-oss/v3-sdk";
// import { PublicKey } from "@solana/web3.js";
// import { PriceData } from "@pythnetwork/client";

async function printMarketInfo(sdk: ParclV3Sdk) {
  const [exchangeAddress] = getExchangePda(0);
  const exchange = await sdk.accountFetcher.getExchange(exchangeAddress);
  if (!exchange) throw new Error("Exchange not found");

  // const exchangeWrapper = new ExchangeWrapper(exchange, exchangeAddress);

  const markets = await sdk.accountFetcher.getAllMarkets();

  console.log("=== Market Information ===");

  for (const market of markets) {
    const marketWrapper = new MarketWrapper(market.account, market.address);
    const priceFeed = await sdk.accountFetcher.getPythPriceFeed(market.account.priceFeed);

    if (!priceFeed) {
      console.log(`Price feed not found for market ${market.account.id}`);
      continue;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const epochStartTime = Number(market.account.accounting.firstLiquidationEpochStartTime);
    const epochLength = Number(market.account.settings.maxSecondsInLiquidationEpoch);
    const currentEpoch = Math.floor((currentTime - epochStartTime) / epochLength);
    const remainingTime = epochLength - ((currentTime - epochStartTime) % epochLength);

    const skew = new PreciseIntWrapper(new Decimal(market.account.accounting.skew.toString()));
    const size = new PreciseIntWrapper(new Decimal(market.account.accounting.size.toString()));
    const skewPercentage =
      size.val === new Decimal("0") ? 0 : (Number(skew.val) / Number(size.val)) * 100;

    console.log(`\nMarket ID: ${market.account.id}`);
    console.log(`Market Address: ${market.address}`);
    console.log(
      `Price Feed: ${priceFeed.aggregate.price} (conf: ${priceFeed.aggregate.confidence})`
    );
    console.log(`Current Liquidation Epoch: ${currentEpoch}`);
    console.log(`Remaining Time in Epoch: ${remainingTime} seconds`);
    console.log(`Max Seconds in Liquidation Epoch: ${epochLength} seconds`);
    console.log(`Skew: ${skew.toString()} (${skewPercentage.toFixed(2)}% of total size)`);
    console.log(`Total Size: ${size.toString()}`);
    console.log(`Max Side Size: ${market.account.settings.maxSideSize}`);
    console.log(`Maker Fee Rate: ${market.account.settings.makerFeeRate}`);
    console.log(`Taker Fee Rate: ${market.account.settings.takerFeeRate}`);
    console.log(
      `Last Funding Rate: ${new PreciseIntWrapper(
        market.account.accounting.lastFundingRate
      ).toString()}`
    );
    console.log(
      `Weighted Position Price: ${new PreciseIntWrapper(
        new Decimal(market.account.accounting.weightedPositionPrice.toString())
      ).toString()}`
    );
    console.log(`Min Position Margin: ${market.account.settings.minPositionMargin}`);
    console.log(`Liquidation Fee Rate: ${market.account.settings.liquidationFeeRate}`);
    console.log(`Max Liquidation PD: ${market.account.settings.maxLiquidationPd}`);

    const utilizationPercentage =
      (Number(market.account.accounting.lastUtilizedLiquidationCapacity) /
        Number(market.account.settings.maxLiquidationLimitAccumulationMultiplier)) *
      100;
    console.log(`Liquidation Capacity Utilization: ${utilizationPercentage.toFixed(2)}%`);

    // Additional metrics
    const openInterest = Number(size.val);
    console.log(`Open Interest: ${openInterest}`);

    const fundingRate = marketWrapper.getFundingRate(
      new PreciseIntWrapper(new Decimal(currentTime))
    );
    console.log(`Current Funding Rate: ${fundingRate.toString()}`);

    const premiumDiscount = skew.div(
      new PreciseIntWrapper(new Decimal(market.account.settings.skewScale.toString()))
    );
    console.log(`Premium/Discount: ${premiumDiscount.toString()}`);
  }
}

// Usage
const rpcUrl = process.env.RPC_URL as string;
const sdk = new ParclV3Sdk({ rpcUrl });
printMarketInfo(sdk).catch(console.error);
