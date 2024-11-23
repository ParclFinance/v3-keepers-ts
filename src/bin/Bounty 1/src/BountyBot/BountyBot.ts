import {
  ComputeBudgetProgram,
  PublicKey,
  sendAndConfirmTransaction,
  type Commitment,
  type Connection,
  type Keypair,
} from "@solana/web3.js";
import {
  MarginAccountWrapper,
  ParclV3TransactionBuilder,
  parsePrice,
  parseSize,
  PositionWrapper,
  type Address,
  type Market,
  type ParclV3Sdk,
  type ProgramAccount,
  type U64,
} from "../../include/v3-sdk-ts/src";
import type { PriceUpdateTimeUTC, PriceUpdateTimeEpoch } from "./types";
import { getPriceFeed, priceUpdateUTCToEpoch } from "./utils/utils";
import { Transaction } from "@solana/web3.js";

export interface BountyBotParams {
  signer: Keypair;
  connection: Connection;
  parclSDK: ParclV3Sdk;
  marginAccountAddress: PublicKey;
  exchangeAddress: PublicKey;
  commitment: Commitment;
  priceUpdateTimeUTC: PriceUpdateTimeUTC;
}

const SOLANA_MAX_TRANSACTION_SIZE = 1213;

export default class BountyBot {
  private readonly _signer: Keypair;
  private readonly _connection: Connection;
  private readonly _parclSDK: ParclV3Sdk;
  private readonly _marginAccountAddress: PublicKey;
  private readonly _exchangeAddress: PublicKey;
  private readonly _commitment: Commitment;
  private readonly _priceUpdateTimeUTC: PriceUpdateTimeEpoch;

  constructor({
    signer,
    connection,
    parclSDK,
    marginAccountAddress,
    exchangeAddress,
    commitment,
    priceUpdateTimeUTC,
  }: BountyBotParams) {
    this._signer = signer;
    this._connection = connection;
    this._parclSDK = parclSDK;
    this._marginAccountAddress = marginAccountAddress;
    this._exchangeAddress = exchangeAddress;
    this._commitment = commitment;
    this._priceUpdateTimeUTC = priceUpdateUTCToEpoch(priceUpdateTimeUTC);
  }

  async openPositionOnAllMarkets() {
    const markets = (
      await this._parclSDK.accountFetcher.getAllMarkets()
    ).filter((market) => market.account.id < 23); //filter btc and sol
    try {
      const signature = await this.openPosition(markets);
    } catch (e) {
      console.error("failed to open position: " + e);
    }
  }

  async closePosition(
    positions: PositionWrapper[],
    markets: ProgramAccount<Market>[]
  ): Promise<string[]> {
    if (positions.length === 0) return [];

    let signatures: string[] = [];

    let transaction = this.initializeNewTransaction();

    let marketAddresses: PublicKey[] = [];
    let marketPriceFeeds: PublicKey[] = [];
    for (const position of positions) {
      const latestBlockhash = await this._connection.getLatestBlockhash();
      const market = markets.find(
        (market) => market.account.id === position.marketId()
      );
      if (!market) continue;

      const pythPrice = await this._parclSDK.accountFetcher.getPythPriceFeed(
        market.account.priceFeed
      );
      if (!pythPrice) continue;

      const indexPrice = getPriceFeed(pythPrice);
      const closingSize = -position.size().val.toNumber() / 1e9;

      const marginAccount =
        await this._parclSDK.accountFetcher.getMarginAccount(
          this._marginAccountAddress
        );
      if (!marginAccount) {
        throw new Error("failed to get margin account");
      }

      const marginAccountWrapper = new MarginAccountWrapper(marginAccount);

      const uniqueAccounts = this._getUniqueMarketAccounts(
        [...marketAddresses, new PublicKey(market.address)],
        [...marketPriceFeeds, new PublicKey(market.account.priceFeed)],
        marginAccountWrapper,
        markets
      );

      marketAddresses = uniqueAccounts.marketAddresses;
      marketPriceFeeds = uniqueAccounts.marketPriceFeeds;

      const result = await this.checkAndExecutesafeBatchTransaction(
        transaction,
        indexPrice,
        closingSize > 0,
        marketAddresses,
        marketPriceFeeds,
        market.account.id,
        closingSize,
        latestBlockhash.blockhash
      );
      if (result.signature) {
        console.log("sent batch with signature: " + result.signature);
        signatures.push(result.signature);
        marketAddresses = [];
        marketPriceFeeds = [];
      }
      transaction = result.transaction;
    }

    if (transaction._instructions.length === 0) return signatures;

    const latestBlockhash = await this._connection.getLatestBlockhash();

    const signedTx = transaction.buildSigned(
      [this._signer],
      latestBlockhash.blockhash
    );

    const signature = await this.executeTransaction(signedTx);
    if (signature) signatures.push(signature);
    return signatures;
  }

  // async getOptimizedUnitLimits(
  //   signedTx: Transaction
  // ): Promise<number | undefined> {
  //   try {
  //     const simulation = await this._connection.simulateTransaction(
  //       signedTx.compileMessage()
  //     );

  //     //we dont check for simulation error as we expect it will get an error, because it will exceed compute units. we will keep preflight on in the transaction.

  //     const computeUnitLimits = simulation.value.unitsConsumed; //gas fees optimization

  //     console.log("used compute units: " + computeUnitLimits);

  //     return computeUnitLimits;
  //   } catch (e) {
  //     console.error("simulation failed: " + e);
  //   }
  // }

  async executeTransaction(signedTx: Transaction) {
    try {
      console.log("executing transaction...");
      const signature = await sendAndConfirmTransaction(
        this._connection,
        signedTx,
        [this._signer]
      );
      return signature;
    } catch (e) {
      console.error("failed to execute transaction: " + e);
    }
  }

  initializeNewTransaction() {
    return this._parclSDK
      .transactionBuilder()
      .feePayer(this._signer.publicKey)
      .instruction(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 1_400_000,
        })
      );
  }

  /*
  function to execute the maximum amount of markets possible per transaction,
  since we open on EVERY market, this is very important to minimize as much gas fees as possible
  */
  async checkAndExecutesafeBatchTransaction(
    transaction: ParclV3TransactionBuilder,
    indexPrice: number,
    goLong: boolean,
    marketAddresses: PublicKey[],
    marketPriceFeeds: PublicKey[],
    marketId: number,
    sizeDelta: U64,
    blockhash: string
  ): Promise<{
    signature: string | undefined;
    transaction: ParclV3TransactionBuilder;
  }> {
    let testTransaction = this.initializeNewTransaction();

    testTransaction._instructions = [...transaction._instructions]; //not use refrence;

    testTransaction.modifyPosition(
      {
        exchange: this._exchangeAddress,
        marginAccount: this._marginAccountAddress,
        signer: this._signer.publicKey,
      },
      {
        sizeDelta: sizeDelta,
        acceptablePrice: parsePrice(indexPrice * (goLong ? 1.1 : 0.9)),
        marketId: marketId,
      },
      marketAddresses,
      marketPriceFeeds
    );

    const signedTestTx = testTransaction.buildSigned([this._signer], blockhash);

    try {
      const s = signedTestTx.serialize(); //if error, then transaction is over SOLANA_MAX_TRANSACTION_SIZE
      const simulation = await this._connection.simulateTransaction(
        signedTestTx.compileMessage()
      ); // Will fail if exceed Max Compute per transaction in solana (1_400_000)
      if (
        simulation.value.unitsConsumed &&
        simulation.value.unitsConsumed >= 1_400_000
      ) {
        throw new Error("test transaction exceeds max compute inits");
      }
    } catch (e) {
      console.log("executing batch transaction");

      const signature = await this.executeTransaction(
        transaction.buildSigned([this._signer], blockhash)
      );

      return {
        transaction: this.initializeNewTransaction(),
        signature: signature,
      };
    }

    console.log("not executing batch");

    return {
      transaction: testTransaction,
      signature: undefined,
    };
  }

  private _getUniqueMarketAccounts(
    currentMarkets: PublicKey[],
    currentPriceFeeds: PublicKey[],
    marginAccountWrapper: MarginAccountWrapper,
    allMarkets: ProgramAccount<Market>[]
  ): {
    marketAddresses: PublicKey[];
    marketPriceFeeds: PublicKey[];
  } {
    const uniqueMarketAddresses = new Set<Address>();
    const uniquePriceFeeds = new Set<string>();

    currentMarkets.forEach((market) =>
      uniqueMarketAddresses.add(market.toBase58())
    );
    currentPriceFeeds.forEach((feed) => uniquePriceFeeds.add(feed.toBase58()));

    marginAccountWrapper.positions().forEach((position) => {
      const market = allMarkets.find(
        (m) => m.account.id === position.marketId()
      );
      if (market) {
        uniqueMarketAddresses.add(market.address);
        uniquePriceFeeds.add(market.account.priceFeed);
      }
    });

    return {
      marketAddresses: Array.from(uniqueMarketAddresses).map(
        (addr) => new PublicKey(addr)
      ),
      marketPriceFeeds: Array.from(uniquePriceFeeds).map(
        (addr) => new PublicKey(addr)
      ),
    };
  }

  async openPosition(markets: ProgramAccount<Market>[]): Promise<string[]> {
    let signatures: string[] = [];
    let transaction = this.initializeNewTransaction();

    let marketAddresses: PublicKey[] = [];
    let marketPriceFeeds: PublicKey[] = [];

    for (const market of markets) {
      // if (market.account.settings.minPositionMargin > 100000n) continue;
      const latestBlockhash = await this._connection.getLatestBlockhash();
      const pythPrice = await this._parclSDK.accountFetcher.getPythPriceFeed(
        market.account.priceFeed
      );
      if (!pythPrice) continue;
      const indexPrice = getPriceFeed(pythPrice);
      const goLong = market.account.accounting.skew < 0; //always open on minority

      const marginAccount =
        await this._parclSDK.accountFetcher.getMarginAccount(
          this._marginAccountAddress
        );

      if (!marginAccount) {
        throw new Error("failed to fetch margin account");
      }

      const marginAccountWrapper = new MarginAccountWrapper(marginAccount);

      const uniqueAccounts = this._getUniqueMarketAccounts(
        [...marketAddresses, new PublicKey(market.address)],
        [...marketPriceFeeds, new PublicKey(market.account.priceFeed)],
        marginAccountWrapper,
        markets
      );

      marketAddresses = uniqueAccounts.marketAddresses;
      marketPriceFeeds = uniqueAccounts.marketPriceFeeds;

      const result = await this.checkAndExecutesafeBatchTransaction(
        transaction,
        indexPrice,
        goLong,
        marketAddresses,
        marketPriceFeeds,
        market.account.id,
        goLong ? 1n : -1n, //trade minimal size
        latestBlockhash.blockhash
      );
      if (result.signature) {
        console.log("sent batch with signature: " + result.signature);
        signatures.push(result.signature);
        marketAddresses = [];
        marketPriceFeeds = [];
      }
      transaction = result.transaction;
    }

    console.log("cleaning up batch");

    if (transaction._instructions.length === 0) return signatures;

    const latestBlockhash = await this._connection.getLatestBlockhash();

    const signedTx = transaction.buildSigned(
      [this._signer],
      latestBlockhash.blockhash
    );

    const signature = await this.executeTransaction(signedTx);
    if (signature) signatures.push(signature);
    return signatures;
  }

  async closeAllPositions() {
    const markets = (
      await this._parclSDK.accountFetcher.getAllMarkets()
    ).filter((market) => market.account.id < 23); //filter btc and sol

    const marginAccount = await this._parclSDK.accountFetcher.getMarginAccount(
      this._marginAccountAddress
    );

    if (!marginAccount) {
      throw new Error("failed to fetch margin account");
    }

    const marginAccountWrapper = new MarginAccountWrapper(marginAccount);

    await this.closePosition(marginAccountWrapper.positions(), markets);
  }

  async run() {
    let firstRun = true;
    let priceUpdateHandled = false;
    while (true) {
      if (firstRun) {
        firstRun = false;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 5 *60 * 1000)); // trade every 5 minutes
      }

      const currentTime = Date.now();
      if (
        currentTime > this._priceUpdateTimeUTC.minTime &&
        currentTime < this._priceUpdateTimeUTC.maxTime
      ) {
        if (!priceUpdateHandled) {
          priceUpdateHandled = true;
          console.log("price update, closing all positions...");
          await this.closeAllPositions();
        }
        continue;
      } else if (priceUpdateHandled) priceUpdateHandled = false;

      console.log("opening positions on all markets");

      await this.openPositionOnAllMarkets();
    }
  }
}
