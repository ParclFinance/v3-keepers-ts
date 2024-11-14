import {
  Connection,
  Keypair,
  MessageV0,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  getMarginAccountPda,
  getMarketPda,
  MarginAccountWrapper,
  ParclV3Sdk,
  parsePrice,
  parseSize,
} from "@parcl-oss/v3-sdk";
import { getPriceFromFeed } from "./utils";
import Decimal from 'decimal.js';

export async function closePosition(
  connection: Connection,
  sdk: ParclV3Sdk,
  exchangeAddress: PublicKey,
  fundingStrategySigner: Keypair,
  highestFundingRateId: number,
  force: boolean
) {
  const ma = getMarginAccountPda(exchangeAddress, fundingStrategySigner.publicKey, 0)[0];
  const latestBlockhash = await connection.getLatestBlockhash();
  const marginAccount = await sdk.accountFetcher.getMarginAccount(ma);
  if (marginAccount === undefined) {
    throw new Error("Invalid margin account");
  }
  const maWrapper = new MarginAccountWrapper(marginAccount);
  const positions = maWrapper.positions();
  if (positions.length === 0) {
    console.log("No position found");
    return true;
  }
  const position = positions[0];
  const marketId = position.marketId();

  //Only close if a different optimal market has been selected
  if (!force && position.marketId() === highestFundingRateId) {
    console.log("Still the same highest funding rate. Do nothing");
    return false;
  }

  const market = getMarketPda(exchangeAddress, marketId)[0];
  const marketData = await sdk.accountFetcher.getMarket(market);
  if (marketData === undefined) {
    throw new Error("Invalid market id");
  }
  const priceFeed = await sdk.accountFetcher.getPythPriceFeed(marketData.priceFeed);
  if (priceFeed === undefined) {
    throw new Error("Invalid price feed");
  }
  if (position === undefined) {
    throw new Error("No position found");
  }
  const size = position.size();

  // Go ahead and close it if the funding rate is on the wrong side
  if (size.val.mul(marketData.accounting.lastFundingRate).gt(0)) {
    console.log("Funding rate is on the wrong side. Close it");
    force = true;
  }

  // Unless we want to force to wait for majority side to close for the best rate
  if(!force) {
    //Only close if position is in the majority
    if (new Decimal(marketData.accounting.skew.toString())
        .mul(size.val)
        .lt(0)) {
      console.log("Skew is not in majority. Wait for better time to close it");
      return;
    }
  }

  const positionSize = parseSize(size.val.div(10 ** 15).toNumber());

  // @ts-expect-error I don't know why this doesn't work but the type should be correct
  const price = getPriceFromFeed(priceFeed);

  const acceptablePrice = size.val.lt(0)
    ? parsePrice(price + price * 0.1)
    : parsePrice(price - price * 0.1);
  const closePositionTx = sdk
    .transactionBuilder()
    .modifyPosition(
      {
        exchange: exchangeAddress,
        marginAccount: ma,
        signer: fundingStrategySigner.publicKey,
      },
      {
        marketId: marketId,
        sizeDelta: -positionSize,
        acceptablePrice,
      },
      [market],
      [marketData.priceFeed]
    )
    .feePayer(fundingStrategySigner.publicKey)
    .buildUnsigned();
  const tx = convertToV0(closePositionTx, latestBlockhash.blockhash);
  tx.sign([fundingStrategySigner]);

  const sig = await connection.sendTransaction(tx);
  await connection.confirmTransaction({
    signature: sig,
    ...latestBlockhash,
  });
  console.log("Position closed", sig);
  return true;
}

function convertToV0(tx: Transaction, blockhash: string): VersionedTransaction {
  tx.recentBlockhash = blockhash;
  const message = tx.compileMessage();
  const messageV0 = new MessageV0(message);
  return new VersionedTransaction(messageV0);
}
