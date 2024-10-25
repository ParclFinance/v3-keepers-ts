import {
  parseSize,
  type MarginAccount,
  type ParclV3Sdk,
  parsePrice,
  type Market,
  getMarketPda,
  type U64,
} from "../../v3-sdk-ts/src";
import { Keypair, PublicKey, VersionedMessage } from "@solana/web3.js";
import { type Price, type PriceData } from "@pythnetwork/client";
import { Connection } from "@solana/web3.js";
import { VersionedTransaction } from "@solana/web3.js";

export function calculateAcceptablePrice(
  isGoingLong: boolean,
  priceFeed: number
): U64 {
  const acceptablePrice = parsePrice((isGoingLong ? 1.1 : 0.9) * priceFeed);

  return acceptablePrice;
}

export async function buildTransaction(
  prclSDK: ParclV3Sdk,
  blockhash: string,
  exchangeAddress: PublicKey,
  marginAccountAddress: PublicKey,
  signer: Keypair,
  sharesToTrade: number,
  market: Market,
  pythPriceFeed: PriceData,
  isGoingLong: boolean,
  accounts: PublicKey[],
  priceFeeds: PublicKey[]
) {
  const acceptablePrice = calculateAcceptablePrice(
    isGoingLong,
    pythPriceFeed.price!
  );

  const transaction = prclSDK.transactionBuilder().modifyPosition(
    {
      exchange: exchangeAddress,
      marginAccount: marginAccountAddress,
      signer: signer.publicKey,
    },
    {
      sizeDelta: parseSize(sharesToTrade) as bigint,
      marketId: market.id,
      acceptablePrice: acceptablePrice as bigint,
    },
    accounts,
    priceFeeds
  );

  return transaction;
}

export async function simulateTranscation(
  prclSDK: ParclV3Sdk,
  blockhash: string,
  exchangeAddress: PublicKey,
  marginAccount: MarginAccount,
  marginAccountAddress: PublicKey,
  signer: Keypair,
  sharesToTrade: number,
  market: Market,
  pythPriceFeed: PriceData,
  isGoingLong: boolean,
  connection: Connection
) {
  const [marketAddress] = getMarketPda(exchangeAddress, market.id);

  let accounts = [marketAddress];
  let priceFeeds = [market.priceFeed];

  const transaction = await buildTransaction(
    prclSDK,
    blockhash,
    exchangeAddress,
    marginAccountAddress,
    signer,
    sharesToTrade,
    market,
    pythPriceFeed,
    isGoingLong,
    accounts,
    priceFeeds as any //werid that the public key is different...
  );

  const versionedMessage = VersionedMessage.deserialize(
    new Uint8Array(
      transaction
        .feePayer(signer.publicKey)
        .buildSigned([signer], blockhash)
        .serializeMessage()
    )
  );

  const simulationResult = await connection.simulateTransaction(
    new VersionedTransaction(versionedMessage)
  );

  if (simulationResult.value.err) {
    const error = JSON.stringify(simulationResult.value.err);
    if (!error.includes("6000")) {
      //6000 - integer overflow error, seems to be random and not an actual error. need to be fixed by prcl
      throw new Error(
        "failed to simulate transaction. error: " + simulationResult.value.logs
      );
    }
  }
}
