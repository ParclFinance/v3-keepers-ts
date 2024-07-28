import { Address, MarginsWrapper, PreciseIntWrapper } from "@parcl-oss/v3-sdk";

interface AccountLiquidationStats {
  address: Address;
  profit: PreciseIntWrapper;
  liquidatedAt: Date;
}

export class BotStats {
  private startTime = performance.now();
  private accountsLiquidatedValue: AccountLiquidationStats[] = [];
  private atRiskAccounts: MarginsWrapper[] | undefined;
  private isBackgroundUpdatingMarginAccounts: Boolean = false;
  /**
   *
   * @param currentPriceCheckInterval TODO: This interval will change based on volatility of the market, if the market is more volatile we want to check for liquidations more often and be the first bot to liquidate.
   */
  constructor(private currentPriceCheckInterval: number) {}

  public addLiquidatedAccount(address: Address, profit: PreciseIntWrapper) {
    this.accountsLiquidatedValue.push({
      address: address,
      profit: profit,
      liquidatedAt: new Date(),
    });
  }

  public update(
    currentPriceCheckInterval: number,
    atRiskAccounts: MarginsWrapper[] | undefined,
    isBackgroundUpdatingMarginAccounts: Boolean
  ) {
    this.currentPriceCheckInterval = currentPriceCheckInterval;
    this.atRiskAccounts = atRiskAccounts;
    this.isBackgroundUpdatingMarginAccounts = isBackgroundUpdatingMarginAccounts;
  }

  public toString(): string {
    var percentages = this.atRiskAccounts?.map((a) => {
      return a.totalRequiredMargin().div(a.margins.availableMargin);
    });

    var averagePercentage = percentages
      ?.reduce((acc, curr) => curr.add(acc), PreciseIntWrapper.fromDecimal(0, 0))
      .div(PreciseIntWrapper.fromDecimal(1 * percentages.length, 0));
    var maxPercentage = percentages?.reduce(
      (acc, curr) => (curr.val.greaterThan(acc.val) ? curr : acc),
      PreciseIntWrapper.fromDecimal(0, 0)
    );
    let str = "----------------BOT STATS----------------\n";
    str += "Accounts Liquidated: " + this.accountsLiquidatedValue.length + "\n";
    str +=
      "Total Profit: " +
      this.accountsLiquidatedValue
        .reduce((acc, curr) => curr.profit.add(acc), PreciseIntWrapper.fromDecimal(0, 0))
        .val.toString() +
      "\n";
    if (this.accountsLiquidatedValue.length > 0) {
      str +=
        "Last Liquidation: " +
        this.accountsLiquidatedValue[this.accountsLiquidatedValue.length - 1].liquidatedAt +
        "\n";
    }

    str += "Total Time Running: " + (performance.now() - this.startTime) / 1000 + " seconds\n";
    str += "Current Price Check Interval: " + this.currentPriceCheckInterval + "ms\n";
    str += "Closest Percentage Margin Used Account: " + maxPercentage?.val.toString() + "\n";
    str +=
      "Average Percentage Margin Used (at risk only): " + averagePercentage?.val.toString() + "\n";
    str += "Accounts Over Margin Percentage: " + this.atRiskAccounts?.length + "\n";
    str +=
      "Is Background Updating Margin Accounts: " + this.isBackgroundUpdatingMarginAccounts + "\n";
    str += "-----------------------------------------\n";

    return str;
  }
}
