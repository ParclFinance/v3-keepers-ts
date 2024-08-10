import { checkAddresses, MarketDataCheck } from "@/utils/checkAddresses";
import { decorateLog, liquidStart } from "@/utils/dateTime";
import { Liquidator, HighRiskStore } from "@/utils/marginAccounts";

export type ProcessHighRiskAccountsParams = {
  rpcUrl: string;
  liquidator: Liquidator;
  marketData: MarketDataCheck;
  highRiskStore: HighRiskStore[];
  instantCheck: number;
  log?: boolean;
};

export async function processHighRiskAccounts({
  rpcUrl,
  liquidator,
  marketData,
  highRiskStore,
  instantCheck,
  log = false,
}: ProcessHighRiskAccountsParams) {
  const firstLoop = Date.now() - liquidStart < 2000 * 60;
  if (highRiskStore.length > 0) {
    const highRiskScoreSorted = highRiskStore.sort((a, b) => b.score - a.score);
    if (highRiskScoreSorted.length < instantCheck && !firstLoop)
      console.info(
        "Stored high risk accounts < INSTANT_CHECK_QUANTITY. Try lowering the threshold."
      );
    const slicedHighRisk = highRiskScoreSorted.slice(0, instantCheck);
    if (log)
      console.log(
        `Checking ${slicedHighRisk.length} high risk accounts. Highest is ${slicedHighRisk[0].address} with risk score ${slicedHighRisk[0].score}/100`
      );
    const highRiskAddresses = slicedHighRisk.map((a) => a.address);
    await checkAddresses(rpcUrl, highRiskAddresses, liquidator, marketData, log);
  } else {
    console.log(decorateLog("No high risk accounts in store."));
  }
}
