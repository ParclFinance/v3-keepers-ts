import {
  ParclV3Sdk,
  MarginAccountWrapper,
  LiquidateAccounts,
  LiquidateParams,
  MarketMap,
  Address,
  Exchange,
  ExchangeWrapper,
  MarginAccount,
  PriceFeedMap,
  ProgramAccount,
} from "@parcl-oss/v3-sdk";
import {
  Connection,
  Keypair,
  Signer,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { getMarketsAndPriceFeeds } from "./priceFeeds";

export async function scanAndLiquidateMarginAccounts(
  sdk: ParclV3Sdk,
  connection: Connection,
  rawMarginAccounts: (ProgramAccount<MarginAccount> | undefined)[],
  markets: MarketMap,
  priceFeeds: PriceFeedMap,
  exchange: Exchange,
  liquidatorSigner: Keypair,
  liquidatorMarginAccount: Address,
) {
  for (const rawMarginAccount of rawMarginAccounts) {
    if (rawMarginAccount !== undefined) {
      const marginAccount = new MarginAccountWrapper(
        rawMarginAccount.account,
        rawMarginAccount.address,
      );
      if (marginAccount.inLiquidation()) {
        console.log(`Liquidating account already in liquidation (${marginAccount.address})`);
        await liquidate(
          sdk,
          connection,
          marginAccount,
          {
            marginAccount: rawMarginAccount.address,
            exchange: rawMarginAccount.account.exchange,
            owner: rawMarginAccount.account.owner,
            liquidator: liquidatorSigner.publicKey,
            liquidatorMarginAccount,
          },
          markets,
          [liquidatorSigner],
          liquidatorSigner.publicKey
        );
      }
      const margins = marginAccount.getAccountMargins(
        new ExchangeWrapper(exchange),
        markets,
        priceFeeds,
        Math.floor(Date.now() / 1000)
      );
      if (margins.canLiquidate()) {
        console.log(`Starting liquidation for ${marginAccount.address}`);
        const signature = await liquidate(
          sdk,
          connection,
          marginAccount,
          {
            marginAccount: rawMarginAccount.address,
            exchange: rawMarginAccount.account.exchange,
            owner: rawMarginAccount.account.owner,
            liquidator: liquidatorSigner.publicKey,
            liquidatorMarginAccount,
          },
          markets,
          [liquidatorSigner],
          liquidatorSigner.publicKey
        );
        console.log("Signature: ", signature);
      }
    }
  }
}

export async function liquidate(
    sdk: ParclV3Sdk,
    connection: Connection,
    marginAccount: MarginAccountWrapper,
    accounts: LiquidateAccounts,
    markets: MarketMap,
    signers: Signer[],
    feePayer: Address,
    params?: LiquidateParams
): Promise<string> {
    const [marketAddresses, priceFeedAddresses] = getMarketsAndPriceFeeds(marginAccount, markets);
    const { blockhash: recentBlockhash } = await connection.getLatestBlockhash();
    const tx = sdk
        .transactionBuilder()
        .liquidate(accounts, marketAddresses, priceFeedAddresses, params)
        .feePayer(feePayer)
        .buildSigned(signers, recentBlockhash);
    return await sendAndConfirmTransaction(connection, tx, signers);
}