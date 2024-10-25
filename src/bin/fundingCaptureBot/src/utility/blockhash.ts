import { Connection, PublicKey, Keypair, Transaction } from "@solana/web3.js";
import { ParclV3Sdk } from "../../v3-sdk-ts/src";

export class TransactionManager {
  private connection: Connection;
  private lastBlockhash: string | null = null;
  private lastBlockhashTime: number = 0;
  private readonly BLOCKHASH_REFRESH_INTERVAL = 45 * 1000;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  async getLatestBlockhash(): Promise<string> {
    const now = Date.now();
    if (
      !this.lastBlockhash ||
      now - this.lastBlockhashTime >= this.BLOCKHASH_REFRESH_INTERVAL
    ) {
      for (let i = 0; i < this.MAX_RETRIES; i++) {
        try {
          const { blockhash } = await this.connection.getLatestBlockhash(
            "confirmed"
          );
          this.lastBlockhash = blockhash;
          this.lastBlockhashTime = now;
          break;
        } catch (error) {
          if (i === this.MAX_RETRIES - 1) throw error;
          await new Promise((resolve) => setTimeout(resolve, this.RETRY_DELAY));
        }
      }
    }

    return this.lastBlockhash!;
  }

  async verifyBlockhash(blockhash: string): Promise<boolean> {
    try {
      const { value } = await this.connection.getFeeCalculatorForBlockhash(
        blockhash,
        "confirmed"
      );
      return !!value;
    } catch {
      return false;
    }
  }

  async executeTransactionWithRetry(
    prclSDK: ParclV3Sdk,
    buildTransaction: (blockhash: string) => Promise<Transaction>,
    signer: Keypair
  ): Promise<string> {
    for (let i = 0; i < this.MAX_RETRIES; i++) {
      try {
        const blockhash = await this.getLatestBlockhash();
        const transaction = await buildTransaction(blockhash);

        if (!(await this.verifyBlockhash(blockhash))) {
          continue;
        }

        const signature = await this.connection.sendTransaction(transaction, [
          signer,
        ]);
        await this.connection.confirmTransaction(signature);
        return signature;
      } catch (error: any) {
        if (
          error?.message?.includes("Blockhash not found") ||
          error?.message?.includes("block height exceeded")
        ) {
          this.lastBlockhash = null;
          continue;
        }

        if (i === this.MAX_RETRIES - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, this.RETRY_DELAY));
      }
    }
    throw new Error("Failed to execute transaction after max retries");
  }
}
