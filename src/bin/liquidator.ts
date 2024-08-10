import { liquidator, liquidatorAddress } from "@/config/envLoader";
import { checkAddresses } from "@/utils/checkAddresses";
import { fetchMarketData } from "@/utils/fetchMarketData";
import { Address, ParclV3Sdk, getExchangePda } from "@parcl-oss/v3-sdk";
import { Commitment } from "@solana/web3.js";
import { HighRiskStore, Liquidator, getMarginAddressesFromSlice } from "@utils/marginAccounts";

import { commitment, interval, privateKeyString, rpcUrl, lookupLimit } from "@/config/envLoader";
import { decorateLog } from "@/utils/dateTime";
// import { ensureBundled } from "@/workers/highRiskWorker";

let lastLog = Date.now() - 1000 * 60 * 60;

(async function main() {
  console.log(decorateLog("Starting liquidator"));
  if (!rpcUrl) throw new Error("Missing RPC_URL");
  if (!liquidatorAddress) throw new Error("Missing LIQUIDATOR_MARGIN_ACCOUNT");
  if (!privateKeyString) throw new Error("Missing PRIVATE_KEY");
  if (!commitment) throw new Error("Missing PRIVATE_KEY");
  if (lookupLimit < 50000)
    throw new Error(
      `LOOKUP_LIMIT can be set in the thousands. `
      // ${!ensureBundled ? "Ensure you have bundled the worker." : ""
      // }
    );
  const [exchangeAddress] = getExchangePda(0);

  await runLiquidator({
    rpcUrl,
    commitment,
    interval,
    exchangeAddress,
    liquidator,
  });
})();

type RunLiquidatorParams = {
  rpcUrl: string;
  commitment: Commitment;
  interval: number;
  exchangeAddress: Address;
  liquidator: Liquidator;
};

async function runLiquidator({
  rpcUrl,
  commitment,
  interval,
  exchangeAddress,
  liquidator,
}: RunLiquidatorParams): Promise<void> {
  const highRiskStore: HighRiskStore[] = [
    // { address: "7gUkzEhQtjzhrEtHpW1S12iaNvg8kaS4awghpgUjwhSa", score: 99 },
  ];
  const sdk = new ParclV3Sdk({ rpcUrl, commitment });
  const exchange = await sdk.accountFetcher.getExchange(exchangeAddress);
  if (!exchange) throw new Error("Invalid exchange address");

  // Create a worker using Bun's Worker API
  const worker = new Worker("./src/workers/highRiskWorker.js");

  const executeLiquidatorCycle = async (firstRun: boolean) => {
    try {
      const log = Date.now() - lastLog > 1000 * 60 * 5;
      if (log) lastLog = Date.now();
      worker.postMessage({
        highRiskStore,
        log,
      });
      const dataMaps = await fetchMarketData(exchange, exchangeAddress, sdk);
      const marketData = { exchange, dataMaps };
      const [markets] = dataMaps;
      if (firstRun)
        console.log(
          decorateLog(
            `Fetched ${
              Object.keys(markets).length
            } market and price feeds. Performing full margin account sweep, which may take over 100s.`
          )
        );

      const addressSlices = await getMarginAddressesFromSlice(rpcUrl, log);
      // TODO: this should only be done once, then subscribe to onProgramAccountChange with margin account filter
      // TODO: similarly, yellowstone/geyser can be used to subscribe to market + margin account updates
      // unable to access "Source Code URL	https://github.com/ParclFinance/parcl-v3"

      const highRisk = await checkAddresses(rpcUrl, addressSlices, liquidator, marketData, log);
      // replace high risk store with new values
      highRiskStore.length = 0;
      highRiskStore.push(...highRisk);

      // Send updated data to the worker
      if (highRiskStore.length > 0)
        worker.postMessage({
          highRiskStore,
        });

      setTimeout(() => executeLiquidatorCycle(false), interval * 1000);
    } catch (error) {
      console.error("Error during liquidator cycle:", error);
      setTimeout(() => executeLiquidatorCycle(false), interval * 1000);
    }
  };

  await executeLiquidatorCycle(true);
}
