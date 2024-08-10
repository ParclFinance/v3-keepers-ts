import {
  commitment,
  instantCheck,
  liquidator,
  privateKeyString,
  rpcUrl,
  workerInterval,
} from "@/config/envLoader";
import type { MarketDataCheck } from "@/utils/checkAddresses";
import { clockTime, decorateLog } from "@/utils/dateTime";
import { fetchMarketData } from "@/utils/fetchMarketData";
import { HighRiskStore } from "@/utils/marginAccounts";
import { getExchangePda, ParclV3Sdk } from "@parcl-oss/v3-sdk";
import {
  processHighRiskAccounts,
  ProcessHighRiskAccountsParams,
} from "@workers/processHighRiskAccounts";

// prevents TS errors
declare const self: Worker;

if (!rpcUrl || !privateKeyString || !liquidator) throw new Error("Missing env variables");
// export const ensureBundled = true;

const workerDataStatic: WorkerDataStatic = {
  rpcUrl,
  liquidator,
  instantCheck,
};

type WorkerDataStatic = Omit<ProcessHighRiskAccountsParams, "marketData" | "highRiskStore" | "log">;

type WorkerData = WorkerDataStatic & WorkerDataDynamic;

type WorkerDataDynamic = {
  marketData: MarketDataCheck | null;
  highRiskStore: HighRiskStore[] | null;
  log?: boolean;
};

const [exchangeAddress] = getExchangePda(0);
const sdk = new ParclV3Sdk({ rpcUrl, commitment });

const workerData: WorkerData = {
  ...workerDataStatic,
  marketData: null,
  // exchange: null,
  // dataMaps: null,
  highRiskStore: null,
  log: true,
};

self.onmessage = (event) => {
  const newData = event.data as WorkerDataDynamic;
  if (newData.highRiskStore?.length ?? 0 > 0) workerData.highRiskStore = newData.highRiskStore;
  if (newData.log) workerData.log = newData.log;
};

const startWorker = () => {
  setInterval(async () => {
    try {
      if (!workerData.highRiskStore || workerData.highRiskStore.length === 0) {
        return;
      }
      const exchange = await sdk.accountFetcher.getExchange(exchangeAddress);
      if (!exchange) throw new Error("Invalid exchange address");
      if (workerData.log) console.log(`${clockTime()}Worker is fetching market data`);
      const start = performance.now();
      const dataMaps = await fetchMarketData(exchange, exchangeAddress, sdk);
      const end = performance.now();
      if (workerData.log) console.log(`${decorateLog("Market data fetched", start, end)}`);
      const marketData = { exchange, dataMaps };
      workerData.marketData = marketData;
      if (workerData.highRiskStore?.length ?? 0 > 0) {
        await processHighRiskAccounts(workerData as ProcessHighRiskAccountsParams);
        if (workerData.log) {
          console.log(decorateLog("High risk accounts processed"));
          workerData.log = false;
        }
      }
    } catch (error) {
      console.error("An error occurred:", error);
      startWorker(); // Restart the worker
    }
  }, workerInterval); // Run every 5 seconds
};

startWorker();

export {};