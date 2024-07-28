import { ParclV3Sdk, getExchangePda, Address, translateAddress } from "@parcl-oss/v3-sdk";
import { Commitment, Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import * as dotenv from "dotenv";
import { LiquidatorBot } from "../model/liquidatorBot.js";
dotenv.config();

(async function main() {
  console.log("Starting liquidator");
  if (process.env.RPC_URL === undefined) {
    throw new Error("Missing rpc url");
  }
  if (process.env.LIQUIDATOR_MARGIN_ACCOUNT === undefined) {
    throw new Error("Missing liquidator margin account");
  }
  if (process.env.PRIVATE_KEY === undefined) {
    throw new Error("Missing liquidator signer");
  }

  const enableLogging = process.env.ENABLE_LOGGING === "true";
  // Note: only handling single exchange
  const [exchangeAddress] = getExchangePda(0);
  const liquidatorMarginAccount = translateAddress(process.env.LIQUIDATOR_MARGIN_ACCOUNT);
  const liquidatorSigner = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY));

  const priceFeedInterval = parseInt(process.env.PRICE_FEED_INTERVAL ?? "300");
  const fullAccountInterval = parseInt(process.env.FULL_ACCOUNT_INTERVAL ?? "300000");
  const marginPercentageWatch = parseInt(process.env.MARGIN_PERCENTAGE_WATCH ?? "10");
  const commitment = process.env.COMMITMENT as Commitment | undefined;
  const sdk = new ParclV3Sdk({ rpcUrl: process.env.RPC_URL, commitment });
  const connection = new Connection(process.env.RPC_URL, commitment);

  await runLiquidator({
    sdk,
    connection,

    priceFeedInterval: priceFeedInterval,
    fullAccountInterval,
    marginPercentageWatch,
    exchangeAddress,
    liquidatorSigner,
    liquidatorMarginAccount,
    enableLogging: enableLogging,
  });
})();

type RunLiquidatorParams = {
  sdk: ParclV3Sdk;
  connection: Connection;

  priceFeedInterval: number;
  fullAccountInterval: number;
  marginPercentageWatch: number;
  exchangeAddress: Address;
  liquidatorSigner: Keypair;
  liquidatorMarginAccount: Address;
  enableLogging: boolean;
};

async function runLiquidator({
  sdk,
  connection,

  priceFeedInterval: fastPriceFeedInterval,
  fullAccountInterval,
  marginPercentageWatch,
  exchangeAddress,
  liquidatorSigner,
  liquidatorMarginAccount,
  enableLogging,
}: RunLiquidatorParams): Promise<void> {
  const liquidatorBot = new LiquidatorBot(
    exchangeAddress,
    fastPriceFeedInterval,
    fullAccountInterval,
    marginPercentageWatch,
    sdk,
    connection,
    liquidatorSigner,
    liquidatorMarginAccount,
    enableLogging
  );
  while (true) {
    await liquidatorBot.update();
  }
}
