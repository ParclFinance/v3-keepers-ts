import { Connection, Keypair, MessageV0, PublicKey, VersionedTransaction } from "@solana/web3.js";
import {
  getMarginAccountPda,
  getMarketPda,
  ParclV3Sdk,
  parsePrice,
  parseSize,
} from "@parcl-oss/v3-sdk";
import { getPriceFromFeed } from "./utils";

export async function openPosition(
  connection: Connection,
  sdk: ParclV3Sdk,
  exchangeAddress: PublicKey,
  fundingStrategySigner: Keypair,
  marketId: number,
  leverage: number,
  isLong: boolean
) {
  const marginAccountAddress = getMarginAccountPda(
    exchangeAddress,
    fundingStrategySigner.publicKey,
    0
  )[0];
  const latestBlockhash = await connection.getLatestBlockhash();
  const market = getMarketPda(exchangeAddress, marketId)[0];
  const marketData = await sdk.accountFetcher.getMarket(market);
  if (marketData === undefined) {
    throw new Error("Invalid market id");
  }
  const priceFeed = await sdk.accountFetcher.getPythPriceFeed(marketData.priceFeed);
  if (priceFeed === undefined) {
    throw new Error("Invalid price feed");
  }
  // @ts-expect-error I don't know why this doesn't work but the type should be correct
  const price = getPriceFromFeed(priceFeed);

  const marginAccount = await sdk.accountFetcher.getMarginAccount(marginAccountAddress);
  if (marginAccount === undefined) {
    throw new Error("Invalid margin account");
  }
  const margin = marginAccount.margin;

  const rawSize = (Number(margin) * leverage) / (price * 1e6);
  const directionalSize = isLong ? rawSize : -rawSize;
  const size = parseSize(directionalSize);

  const fillPriceLimit = isLong ? price * 1.1 : price * 0.9;
  const acceptablePrice = parsePrice(fillPriceLimit);
  const openPositionTx = sdk
    .transactionBuilder()
    .modifyPosition(
      {
        exchange: exchangeAddress,
        marginAccount: marginAccountAddress,
        signer: fundingStrategySigner.publicKey,
      },
      {
        marketId: marketId,
        sizeDelta: size,
        acceptablePrice,
      },
      [market],
      [marketData.priceFeed]
    )
    .feePayer(fundingStrategySigner.publicKey)
    .buildSigned([fundingStrategySigner], latestBlockhash.blockhash);

  const message = openPositionTx.compileMessage();
  const messageV0 = new MessageV0(message);
  const versionedTx = new VersionedTransaction(messageV0);
  versionedTx.sign([fundingStrategySigner]);

  const sig = await connection.sendTransaction(versionedTx);
  await connection.confirmTransaction({
    signature: sig,
    ...latestBlockhash,
  });

  console.log("Position opened", sig);
}
