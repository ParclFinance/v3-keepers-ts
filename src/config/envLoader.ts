import type { Liquidator } from "@/utils/marginAccounts";
import { publicKey } from "@metaplex-foundation/umi";
import type { Commitment } from "@solana/web3.js";
import * as dotenv from "dotenv";

dotenv.config();

export const privateKeyString = process.env.PRIVATE_KEY;
if (!privateKeyString) throw new Error("Missing PRIVATE_KEY");

export const rpcUrl = process.env.RPC_URL;
if (!rpcUrl) throw new Error("Missing RPC_URL");

export const liquidatorAddress = process.env.LIQUIDATOR_MARGIN_ACCOUNT;
if (!liquidatorAddress) throw new Error("Missing LIQUIDATOR_MARGIN_ACCOUNT");
export const liquidator: Liquidator = {
  liquidatorMarginAccount: publicKey(liquidatorAddress),
  privateKeyString,
};

// Max number of accounts to check by worker
export const instantCheck = parseInt(process.env.INSTANT_CHECK_QUANTITY ?? "50");
export const interval = parseInt(process.env.INTERVAL ?? "300");
export const commitment = (process.env.COMMITMENT ?? "confirmed") as Commitment;

// Fast-check account lookup limit
export const lookupLimit = parseInt(process.env.LOOKUP_LIMIT ?? "50000");

// Accounts above this risk level will be checked by worker
export const threshhold = parseInt(process.env.THRESHHOLD ?? "75");
// Worker interval in seconds
export const workerInterval = parseInt(process.env.WORKER_INTERVAL ?? "5") * 1000;

// Optional tx logging to discord webhook
export const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
// For Helius priority fee API, if main rpc is a different provider
export const heliusUrl = process.env.HELIUS_URL;
