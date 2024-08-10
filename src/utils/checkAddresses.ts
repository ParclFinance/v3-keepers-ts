import { lookupLimit, threshhold } from "@/config/envLoader";
import {
  Address,
  Exchange,
  ExchangeWrapper,
  MarginAccountWrapper,
  MarketMap,
  ParclV3Sdk,
  PriceFeedMap,
} from "@parcl-oss/v3-sdk";
import { Keypair } from "@solana/web3.js";
import { decode } from "bs58";
import { liquidate, LiquidateInputs } from "./liquidate";
import {
  HighRiskStore,
  Liquidator,
  calculateLiquidationProximityScore,
  getActiveMarginAccounts,
} from "./marginAccounts";
import { decorateLog } from "./dateTime";

export type MarketDataCheck = {
  exchange: Exchange;
  dataMaps: [MarketMap, PriceFeedMap];
};

export async function checkAddresses(
  rpcUrl: string,
  addresses: Address[],
  liquidator: Liquidator,
  marketData: MarketDataCheck,
  log: boolean = false,
  tryLiquidate?: Address
): Promise<HighRiskStore[]> {
  const sdk = new ParclV3Sdk({ rpcUrl, commitment: "confirmed" });
  const {
    exchange,
    dataMaps: [markets, priceFeeds],
  } = marketData;
  const { liquidatorMarginAccount, privateKeyString } = liquidator;
  const liquidatorSigner = Keypair.fromSecretKey(decode(privateKeyString));

  const limit = lookupLimit ? parseInt(lookupLimit) : undefined;
  const addressesToGet = addresses.slice(0, limit);

  const activeMarginAccounts = await getActiveMarginAccounts(rpcUrl, addressesToGet, log);
  const highRiskStore: HighRiskStore[] = [];

  for (const rawMarginAccount of activeMarginAccounts) {
    const { account, address } = rawMarginAccount;
    const marginAccount = new MarginAccountWrapper(account, address);
    const liquidateParams: LiquidateInputs = {
      sdk,
      marginAccount,
      accounts: {
        marginAccount: address,
        exchange: account.exchange,
        owner: account.owner,
        liquidator: liquidatorSigner.publicKey,
        liquidatorMarginAccount,
      },
      markets,
      privateKeyString,
    };

    if (marginAccount.inLiquidation()) {
      console.log(`Liquidating account already in liquidation (${marginAccount.address})`);
      await liquidate(liquidateParams, {
        ignoreSimulationFailure: true,
        isFullLiquidation: false,
      });
      continue;
    }

    if (tryLiquidate && marginAccount.address === tryLiquidate) {
      console.log(`Attempting to liquidate ${marginAccount.address}`);
      await liquidate(liquidateParams, {
        ignoreSimulationFailure: true,
        isFullLiquidation: true,
      });
      continue;
    }

    const margins = marginAccount.getAccountMargins(
      new ExchangeWrapper(exchange),
      markets,
      priceFeeds,
      Math.floor(Date.now() / 1000)
    );

    if (margins.canLiquidate()) {
      console.log(`Starting liquidation for ${marginAccount.address}`);
      const signature = await liquidate(liquidateParams, {
        ignoreSimulationFailure: true,
        isFullLiquidation: true,
      });
      console.log(decorateLog(`Signature: ${signature}`));
    }

    const score = calculateLiquidationProximityScore(margins);
    if (score > threshhold) {
      highRiskStore.push({ address: address, score });
    }
  }

  return highRiskStore;
}
