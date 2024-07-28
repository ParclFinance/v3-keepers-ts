import {
  Address,
  Exchange,
  ExchangeWrapper,
  getMarketPda,
  LiquidateAccounts,
  LiquidateParams,
  MarginAccount,
  MarginAccountWrapper,
  MarginsWrapper,
  Market,
  MarketMap,
  MarketWrapper,
  ParclV3Sdk,
  PreciseIntWrapper,
  PriceFeedMap,
  ProgramAccount,
} from "@parcl-oss/v3-sdk";
import { Connection, PublicKey, sendAndConfirmTransaction, Signer } from "@solana/web3.js";

export interface MarketMapAndPriceFeedMap {
  markets: MarketMap;
  priceFeeds: PriceFeedMap;
}
export interface ExchangeAndMarkets {
  exchange: Exchange;
  markets: ProgramAccount<Market>[];
}
export function getAtRiskMarginAccounts(
  accounts: ProgramAccount<MarginAccount>[],
  exchange: Exchange,
  markets: MarketMap,
  priceFeeds: PriceFeedMap,
  marginPercentageWatch: number
): ProgramAccount<MarginAccount>[] {
  var atRiskAccounts: ProgramAccount<MarginAccount>[] = [];
  for (var account of accounts) {
    const marginAccount = new MarginAccountWrapper(account.account, account.address);

    const margins = getAccountMargins(marginAccount, exchange, markets, priceFeeds);

    if (margins.canLiquidate()) {
      atRiskAccounts.push(account);
      continue;
    }

    const totalRequiredMargin = margins.totalRequiredMargin();
    const availableMargin = margins.margins.availableMargin;

    if (!totalRequiredMargin.isZero() && !availableMargin.isZero()) {
      var percentage = totalRequiredMargin.div(availableMargin);
      var marginToAdd = PreciseIntWrapper.fromDecimal(1 * marginPercentageWatch, -2);
      var withMargin = percentage.add(marginToAdd);
      var one = PreciseIntWrapper.fromDecimal(1, 0);
      //I can't figure out why the > does not work without .val
      if (withMargin.val.greaterThan(one.val)) {
        atRiskAccounts.push(account);
        continue;
      }
    }
  }

  return atRiskAccounts;
}

export function getAccountMargins(
  account: MarginAccountWrapper,
  exchange: Exchange,
  markets: MarketMap,
  priceFeeds: PriceFeedMap
): MarginsWrapper {
  const margins = account.getAccountMargins(
    new ExchangeWrapper(exchange),
    markets,
    priceFeeds,
    Math.floor(Date.now() / 1000)
  );

  return margins;
}
function getMarketsAndPriceFeeds(
  marginAccount: MarginAccountWrapper,
  markets: MarketMap
): [Address[], Address[]] {
  const marketAddresses: Address[] = [];
  const priceFeedAddresses: Address[] = [];
  for (const position of marginAccount.positions()) {
    const market = markets[position.marketId()];
    if (market.address === undefined) {
      throw new Error(`Market is missing from markets map (id=${position.marketId()})`);
    }
    marketAddresses.push(market.address);
    priceFeedAddresses.push(market.priceFeed());
  }
  return [marketAddresses, priceFeedAddresses];
}

export async function liquidate(
  sdk: ParclV3Sdk,
  connection: Connection,
  marginAccount: MarginAccountWrapper,
  liquidateAccounts: LiquidateAccounts,
  markets: MarketMap,
  signers: Signer[],
  feePayer: Address,
  params?: LiquidateParams
): Promise<string> {
  const [marketAddresses, priceFeedAddresses] = getMarketsAndPriceFeeds(marginAccount, markets);
  const { blockhash: recentBlockhash } = await connection.getLatestBlockhash();
  const tx = sdk
    .transactionBuilder()
    .liquidate(liquidateAccounts, marketAddresses, priceFeedAddresses, params)
    .feePayer(feePayer)
    .buildSigned(signers, recentBlockhash);
  return await sendAndConfirmTransaction(connection, tx, signers);
}

export async function getMarketMapAndPriceFeedMap(
  sdk: ParclV3Sdk,
  allMarkets: ProgramAccount<Market>[]
): Promise<MarketMapAndPriceFeedMap> {
  const markets: MarketMap = {};
  for (const market of allMarkets) {
    markets[market.account.id] = new MarketWrapper(market.account, market.address);
  }
  const allPriceFeedAddresses = allMarkets.map((market) => market.account.priceFeed);
  const allPriceFeeds = await sdk.accountFetcher.getPythPriceFeeds(allPriceFeedAddresses);
  const priceFeeds: PriceFeedMap = {};
  for (let i = 0; i < allPriceFeeds.length; i++) {
    const priceFeed = allPriceFeeds[i];
    if (priceFeed === undefined) {
      continue;
    }
    priceFeeds[allPriceFeedAddresses[i]] = priceFeed;
  }
  return { markets: markets, priceFeeds: priceFeeds };
}

export async function getExchangeAndMarkets(
  sdk: ParclV3Sdk,
  exchangeAddress: Address
): Promise<ExchangeAndMarkets> {
  const exchange = await sdk.accountFetcher.getExchange(exchangeAddress);
  if (exchange === undefined) {
    throw new Error("Invalid exchange address");
  }
  const allMarketAddresses: PublicKey[] = [];
  for (const marketId of exchange.marketIds) {
    if (marketId === 0) {
      continue;
    }
    const [market] = getMarketPda(exchangeAddress, marketId);
    allMarketAddresses.push(market);
  }
  const allMarkets = (await sdk.accountFetcher.getMarkets(allMarketAddresses)).filter(
    (market) => market !== undefined
  ) as ProgramAccount<Market>[];

  return { exchange: exchange, markets: allMarkets };
}
