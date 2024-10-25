import type { MarketWrapper, ParclV3Sdk, PositionWrapper } from "../../v3-sdk-ts/src";
import { Keypair, PublicKey, Connection, sendAndConfirmTransaction } from "@solana/web3.js";
import { calculateAcceptablePrice } from "./transaction";
import { type PriceData } from "@pythnetwork/client";

import { getMarketPda, parsePrice, parseSize } from "../../v3-sdk-ts/src";
import { TransactionManager } from "./blockhash";
import { ComputeBudgetProgram } from "@solana/web3.js";

export async function handleOpenPositions(
  prclSDK: ParclV3Sdk,
  exchangeAddress: PublicKey,
  marginAccountAddress: PublicKey,
  signer: Keypair,
  openPositions: PositionWrapper[],
  marketWrappers: MarketWrapper[],
  connection: Connection,
  closeAtIndex?: boolean
) {
  const marketMap = new Map(marketWrappers.map((market) => [market.market.id, market]));

  const allMarketData: {
    marketAddress: PublicKey;
    priceFeed: PublicKey;
  }[] = [];

  for (const position of openPositions) {
    const marketToTrade = marketMap.get(position.marketId());
    if (!marketToTrade) continue;

    const [marketAddress] = getMarketPda(exchangeAddress, position.marketId());
    allMarketData.push({
      marketAddress,
      priceFeed: marketToTrade.priceFeed(),
    });
  }

  let remainingMarketAddresses = allMarketData.map((data) => data.marketAddress);
  let remainingPriceFeeds = allMarketData.map((data) => data.priceFeed);

  for (let i = 0; i < openPositions.length; i += 3) {
    const currentBatch = openPositions.slice(i, i + 3);
    const currentBatchData: {
      closingSize: number;
      market: PositionWrapper;
      acceptablePrice: bigint;
      marketAddress: PublicKey;
      priceFeed: PublicKey;
    }[] = [];

    for (const position of currentBatch) {
      const marketToTrade = marketMap.get(position.marketId());
      if (!marketToTrade) continue;

      const marketSkew = Number(marketToTrade.market.accounting.skew);
      const marketSize = position.size().val.dividedBy(1e9);

      const oppositeSkewShort = marketSize.greaterThan(0) && marketSkew > 0;
      const oppositeSkewLong = marketSize.lessThan(0) && marketSkew < 0;

      if (oppositeSkewShort || oppositeSkewLong || closeAtIndex) {
        let closingSize;
        if (closeAtIndex) {
          closingSize = -Number(marketSize);
        } else {
          if (!oppositeSkewShort) {
            closingSize = Number(marketSize.greaterThan(marketSkew) ? marketSize : marketSkew) * -1;
          } else {
            closingSize = Number(marketSize.lessThan(marketSkew) ? marketSize : marketSkew) * -1;
          }
        }

        const pythPriceFeed = (await prclSDK.accountFetcher.getPythPriceFeed(
          marketToTrade.priceFeed()
        )) as PriceData;

        if (!pythPriceFeed?.price) continue;

        const acceptablePrice = closeAtIndex
          ? (parsePrice((closingSize > 0 ? 1.1 : 0.9) * pythPriceFeed.price) as bigint)
          : (calculateAcceptablePrice(oppositeSkewLong, pythPriceFeed.price) as bigint);

        const [marketAddress] = getMarketPda(exchangeAddress, position.marketId());

        currentBatchData.push({
          closingSize,
          market: position,
          acceptablePrice,
          marketAddress,
          priceFeed: marketToTrade.priceFeed(),
        });
      }
    }

    if (currentBatchData.length > 0) {
      const tm = new TransactionManager(connection);
      const blockhash = await tm.getLatestBlockhash();

      let transaction = prclSDK.transactionBuilder().instruction(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: remainingMarketAddresses.length * 200_000,
        })
      );

      for (const data of currentBatchData) {
        console.log("closing market: " + data.market.marketId());
        transaction.modifyPosition(
          {
            exchange: exchangeAddress,
            marginAccount: marginAccountAddress,
            signer: signer.publicKey,
          },
          {
            sizeDelta: data.closingSize,
            marketId: data.market.marketId(),
            acceptablePrice: data.acceptablePrice,
          },
          remainingMarketAddresses,
          remainingPriceFeeds
        );
      }

      const tx = transaction.feePayer(signer.publicKey).buildSigned([signer], blockhash);

      try {
        const result = await sendAndConfirmTransaction(connection, tx, [signer]);

        const processedMarketAddresses = new Set(
          currentBatchData.map((data) => data.marketAddress.toString())
        );
        const processedPriceFeeds = new Set(
          currentBatchData.map((data) => data.priceFeed.toString())
        );

        remainingMarketAddresses = remainingMarketAddresses.filter(
          (addr) => !processedMarketAddresses.has(addr.toString())
        );
        remainingPriceFeeds = remainingPriceFeeds.filter(
          (feed) => !processedPriceFeeds.has(feed.toString())
        );
      } catch (e) {
        if (JSON.stringify(e).includes("Error Number: 6000")) {
          i -= 3;
          continue;
        }
        console.error(e);
      }
    }
  }
}
