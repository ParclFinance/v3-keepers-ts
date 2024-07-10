import {
  ParclV3Sdk,
  Address,
} from "@parcl-oss/v3-sdk";
import {
  Connection,
  Keypair,
} from "@solana/web3.js";

export type RunLiquidatorParams = {
  sdk: ParclV3Sdk;
  connection: Connection;
  priceFeedsUpdateInterval: number,
  allMarginAccountsScanInterval: number;
  exchangeAddress: Address;
  liquidatorSigner: Keypair;
  liquidatorMarginAccount: Address;
};