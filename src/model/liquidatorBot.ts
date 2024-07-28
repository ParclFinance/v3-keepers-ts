import {
  Address,
  Exchange,
  ExchangeWrapper,
  MarginAccount,
  MarginAccountWrapper,
  MarketMap,
  ParclV3Sdk,
  PriceFeedMap,
  ProgramAccount,
} from "@parcl-oss/v3-sdk";
import { BotStats } from "./botStats.js";
import { Connection, Keypair } from "@solana/web3.js";
import { TimedUpdater } from "./timedUpdater.js";
import { EXCHANGE_UPDATE } from "../constants/index.js";
import {
  ExchangeAndMarkets,
  getAccountMargins,
  getAtRiskMarginAccounts,
  getExchangeAndMarkets,
  getMarketMapAndPriceFeedMap,
  liquidate,
  MarketMapAndPriceFeedMap,
} from "./util.js";
import logUpdate from "log-update";

export class LiquidatorBot {
  private botStats: BotStats;

  private exchangeLastUpdate: TimedUpdater<ExchangeAndMarkets>;
  private allMarginAccountsTracker: TimedUpdater<ProgramAccount<MarginAccount>[]>;
  private marginAccountsInDanger: TimedUpdater<ProgramAccount<MarginAccount>[]>;

  private marketAndPriceFeedMaps: TimedUpdater<MarketMapAndPriceFeedMap>;
  constructor(
    private exchangeAddress: Address,
    private priceFeedInterval: number,
    private fullAccountInterval: number,
    private marginPercentageWatch: number,
    private sdk: ParclV3Sdk,
    private connection: Connection,
    private liquidatorSigner: Keypair,
    private liquidatorMarginAccount: Address,
    private enableLogging: boolean = false
  ) {
    this.exchangeLastUpdate = new TimedUpdater(EXCHANGE_UPDATE, (_) =>
      this.updateExchangeAndMarkets()
    );
    this.allMarginAccountsTracker = new TimedUpdater(this.fullAccountInterval, (_) =>
      this.sdk.accountFetcher.getAllMarginAccounts()
    );
    this.marginAccountsInDanger = new TimedUpdater(this.priceFeedInterval, (prev) =>
      this.updateAccountsInDanger(prev)
    );
    this.marketAndPriceFeedMaps = new TimedUpdater(this.priceFeedInterval, (_) =>
      this.updatePriceAndMarketMaps()
    );
    this.botStats = new BotStats(priceFeedInterval);
  }

  public async update() {
    var startUpdate = Date.now();
    if (this.exchangeLastUpdate.needsUpdate) {
      await this.exchangeLastUpdate.update();
    }

    if (this.marketAndPriceFeedMaps.needsUpdate) {
      await this.marketAndPriceFeedMaps.update();
    }

    if (this.marginAccountsInDanger.needsUpdate) {
      await this.marginAccountsInDanger.update();
    }

    if (this.allMarginAccountsTracker.needsUpdate) {
      this.allMarginAccountsTracker.updateBackground((allMarginAccounts) => {
        var latestExchangeAndMarkets = this.exchangeLastUpdate.currentValue;
        var latestMarketAndPriceMaps = this.marketAndPriceFeedMaps.currentValue;

        if (latestExchangeAndMarkets !== undefined && latestMarketAndPriceMaps !== undefined) {
          var atRiskAccounts = getAtRiskMarginAccounts(
            allMarginAccounts,
            latestExchangeAndMarkets.exchange,
            latestMarketAndPriceMaps.markets,
            latestMarketAndPriceMaps.priceFeeds,
            this.marginPercentageWatch
          );

          this.marginAccountsInDanger = new TimedUpdater(
            this.priceFeedInterval,
            (prev) => this.updateAccountsInDanger(prev),
            atRiskAccounts
          );
        }
      });
    }

    var currentAtRiskAccounts = this.marginAccountsInDanger.currentValue;
    var currentExchangeAndMarkets = this.exchangeLastUpdate.currentValue;
    var currentMarketAndPriceMaps = this.marketAndPriceFeedMaps.currentValue;
    if (
      currentAtRiskAccounts === undefined ||
      currentExchangeAndMarkets === undefined ||
      currentMarketAndPriceMaps === undefined
    ) {
      return;
    }

    await this.checkAndLiquidateAtRiskAccounts(
      currentAtRiskAccounts,
      currentExchangeAndMarkets.exchange,
      currentMarketAndPriceMaps.markets,
      currentMarketAndPriceMaps.priceFeeds
    );

    var accountMarginsForAtRiskAccount = this.marginAccountsInDanger.currentValue?.map((a) => {
      var accountWrapper = new MarginAccountWrapper(a.account, a.address);
      return getAccountMargins(
        accountWrapper,
        currentExchangeAndMarkets!.exchange,
        currentMarketAndPriceMaps!.markets,
        currentMarketAndPriceMaps!.priceFeeds
      );
    });

    this.botStats.update(
      this.priceFeedInterval,
      accountMarginsForAtRiskAccount,
      this.allMarginAccountsTracker.isBackgroundUpdating
    );
    if (this.enableLogging) {
      logUpdate(this.botStats.toString());
    }

    var endUpdate = Date.now();

    // Sleep for the remaining time in the interval if needed
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, this.priceFeedInterval - (endUpdate - startUpdate)))
    );
  }

  private async checkAndLiquidateAtRiskAccounts(
    accounts: ProgramAccount<MarginAccount>[],
    exchange: Exchange,
    markets: MarketMap,
    priceFeeds: PriceFeedMap
  ) {
    for (var account of accounts) {
      const marginAccount = new MarginAccountWrapper(account.account, account.address);

      const margins = marginAccount.getAccountMargins(
        new ExchangeWrapper(exchange),
        markets,
        priceFeeds,
        Math.floor(Date.now() / 1000)
      );

      if (marginAccount.inLiquidation() || margins.canLiquidate()) {
        await liquidate(
          this.sdk,
          this.connection,
          marginAccount,
          {
            marginAccount: account.address,
            exchange: account.account.exchange,
            owner: account.account.owner,
            liquidator: this.liquidatorSigner.publicKey,
            liquidatorMarginAccount: this.liquidatorMarginAccount,
          },
          markets,
          [this.liquidatorSigner],
          this.liquidatorSigner.publicKey
        );

        this.botStats.addLiquidatedAccount(
          account.address,
          margins.margins.requiredLiquidationFeeMargin
        );
      }
    }
  }

  private async updatePriceAndMarketMaps(): Promise<MarketMapAndPriceFeedMap> {
    var currentExchange = this.exchangeLastUpdate.currentValue;
    if (currentExchange === undefined) {
      throw new Error("Exchange not found");
    }
    return await getMarketMapAndPriceFeedMap(this.sdk, currentExchange.markets);
  }

  private async updateAccountsInDanger(
    previousAccounts: ProgramAccount<MarginAccount>[] | undefined
  ): Promise<ProgramAccount<MarginAccount>[]> {
    if (previousAccounts === undefined || previousAccounts.length === 0) {
      return [];
    }
    return (
      await this.sdk.accountFetcher.getMarginAccounts(
        previousAccounts.map((account) => account.address)
      )
    ).filter((account) => account !== undefined) as ProgramAccount<MarginAccount>[];
  }
  private async updateExchangeAndMarkets(): Promise<ExchangeAndMarkets> {
    return await getExchangeAndMarkets(this.sdk, this.exchangeAddress);
  }
}
