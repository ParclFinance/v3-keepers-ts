import { Connection, Keypair, type Commitment } from "@solana/web3.js";
import bs58 from "bs58";
import {
  getExchangePda,
  getMarginAccountPda,
  ParclV3Sdk,
} from "../include/v3-sdk-ts/src";
import BountyBot from "./BountyBot/BountyBot";
import config from "./config";

(async function main() {
  console.clear();
  if (!process.env.KEYPAIR) {
    throw new Error("failed to get keypair");
  }

  if (!process.env.RPC_URL) {
    throw new Error("failed to get rpc url");
  }

  const signer = Keypair.fromSecretKey(bs58.decode(process.env.KEYPAIR));

  const commitment = process.env.COMMITMENT as Commitment;

  const connection = new Connection(process.env.RPC_URL, commitment);

  const [exchangeAddress] = getExchangePda(0);

  const [marginAccountAddress] = getMarginAccountPda(
    exchangeAddress,
    signer.publicKey,
    0
  );

  const parclSDK = new ParclV3Sdk({
    rpcUrl: process.env.RPC_URL,
    commitment,
  });

  const bountyBot = new BountyBot({
    signer,
    connection,
    parclSDK,
    commitment,
    marginAccountAddress,
    exchangeAddress,
    priceUpdateTimeUTC: config.priceUpdateTimeUTC,
  });

  await bountyBot.run();
})();
