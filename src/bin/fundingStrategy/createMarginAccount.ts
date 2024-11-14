import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import { getCollateralVaultPda, getMarginAccountPda, ParclV3Sdk } from "@parcl-oss/v3-sdk";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

export async function createMarginAccount(
  connection: Connection,
  sdk: ParclV3Sdk,
  exchangeAddress: PublicKey,
  fundingStrategySigner: Keypair
) {
  const ma = getMarginAccountPda(exchangeAddress, fundingStrategySigner.publicKey, 0)[0];
  const latestBlockhash = await connection.getLatestBlockhash();
  const collateralVault = getCollateralVaultPda(exchangeAddress, USDC)[0];
  const signerTokenAccount = getAssociatedTokenAddressSync(USDC, fundingStrategySigner.publicKey);
  const createMarginAccountIx = sdk
    .transactionBuilder()
    .createMarginAccount(
      {
        exchange: exchangeAddress,
        marginAccount: ma,
        owner: fundingStrategySigner.publicKey,
      },
      {
        marginAccountId: 0,
      }
    )
    .depositMargin(
      {
        exchange: exchangeAddress,
        marginAccount: ma,
        collateralVault,
        signerTokenAccount,
        signer: fundingStrategySigner.publicKey,
      },
      {
        margin: BigInt(10_000_000),
      }
    )
    .feePayer(fundingStrategySigner.publicKey)
    .buildSigned([fundingStrategySigner], latestBlockhash.blockhash);

  const sig = await sendAndConfirmTransaction(connection, createMarginAccountIx, [
    fundingStrategySigner,
  ]);
  console.log("Margin account created", sig);
}
