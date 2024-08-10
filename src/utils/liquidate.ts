import { publicKey } from "@metaplex-foundation/umi-public-keys";
import {
  LiquidateAccounts,
  LiquidateParams,
  MarginAccountWrapper,
  MarketMap,
  ParclV3Sdk,
  liquidateParamsSerializer,
} from "@parcl-oss/v3-sdk";
import { Keypair } from "@solana/web3.js";
import { decode } from "bs58";
import { pushNotify } from "./dateTime";
import { sendAndConfirmTransactionOptimized } from "./landTransaction";
import { exchangeLUT, getMarketsAndPriceFeeds } from "./marginAccounts";
// import { getLogs } from "@solana-developers/helpers";

export type LiquidateInputs = {
  sdk: ParclV3Sdk;
  marginAccount: MarginAccountWrapper;
  accounts: LiquidateAccounts;
  markets: MarketMap;
  privateKeyString: string;
};
type LiquidateOptions = {
  ignoreSimulationFailure: boolean;
  isFullLiquidation: boolean;
};
export async function liquidate(
  liquidateInputs: LiquidateInputs,
  options: LiquidateOptions = {
    ignoreSimulationFailure: false,
    isFullLiquidation: false,
  }
): Promise<string> {
  const { sdk, marginAccount, accounts, markets, privateKeyString } = liquidateInputs;
  try {
    pushNotify("Liquidating account: " + accounts.marginAccount);
  } catch (e) {
    console.error(e, "Error liquidating account: ", accounts.marginAccount);
  }
  const [marketAddresses, priceFeedAddresses] = getMarketsAndPriceFeeds(marginAccount, markets);
  const liquidatorSigner = Keypair.fromSecretKey(decode(privateKeyString));
  const params: LiquidateParams = {
    isFullLiquidation: options.isFullLiquidation,
  };
  // const fromKeypair = Keypair.fromSecretKey(decode(privateKeyString));
  // const connection = new Connection(process.env.RPC_URL as string, "confirmed");
  // const { blockhash: recentBlockhash } = await connection.getLatestBlockhash();
  const tx = sdk
    .transactionBuilder()
    .liquidate(accounts, marketAddresses, priceFeedAddresses, params)
    .feePayer(liquidatorSigner.publicKey)
    .buildUnsigned();
  // .buildSigned([liquidatorSigner], recentBlockhash);
  // return await sendAndConfirmTransaction(connection, tx, [liquidatorSigner])
  // alternatively:
  // await helius.rpc.sendSmartTransaction([instructions], [fromKeypair]);

  try {
    const result = await sendAndConfirmTransactionOptimized(
      tx,
      privateKeyString,
      [publicKey(exchangeLUT)],
      options.ignoreSimulationFailure
    );
    return result;
  } catch (e) {
    if (e instanceof Error && e.message.includes("liquidatable")) {
      // const logs = getLogs(connection, result);
      // console.error(`Error logs: ${logs}`);
      console.info("Margin account is not liquidatable");
    }
    console.info(`Error liquidating: ${e}`);
    return (e as Error).message;
  }
}

export function decodeLiquidateParams(data: number[] | string | Buffer) {
  if (typeof data === "string") {
    return liquidateParamsSerializer.deserialize(Buffer.from(data, "hex"))[0];
  } else if (Array.isArray(data)) {
    return liquidateParamsSerializer.deserialize(Buffer.from(data));
  } else {
    return liquidateParamsSerializer.deserialize(data);
  }
}
export const exampleBuiltUnsignedTransaction = {
  recentBlockhash: null,
  feePayer: "tribix5FTHbkTe757qWvTebdjx11Qo3pW7oFFjLeGxe",
  nonceInfo: null,
  instructions: [
    {
      keys: [
        {
          pubkey: "82dGS7Jt4Km8ZgwZVRsJ2V6vPXEhVdgDaMP7cqPGG1TW",
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: "7gUkzEhQtjzhrEtHpW1S12iaNvg8kaS4awghpgUjwhSa",
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: "4bY615h6GwpMZXdc9ZAEgPj4GuUn1ZuT2Wboz6sWFD2Y",
          isSigner: false,
          isWritable: true,
        },
        { pubkey: "tribix5FTHbkTe757qWvTebdjx11Qo3pW7oFFjLeGxe", isSigner: true, isWritable: true },
        {
          pubkey: "4KKXMypjtiyiiy1YgaHgfQzZJ9eW49v27HGckEZ456Nm",
          isSigner: false,
          isWritable: true,
        },
        { pubkey: "11111111111111111111111111111111", isSigner: false, isWritable: false },
        {
          pubkey: "SysvarRent111111111111111111111111111111111",
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: "HVptGRTGDt8FyTwuzEmSgZAPqEoPNqeRcn9eKcmpgSae",
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: "3parcLrT7WnXAcyPfkCz49oofuuf2guUKkjuFkAhZW8Y",
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: "9uEFb5P4cqajWciHfQES3mVrp3Ni8m6J1wM3wdXDfw4w",
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: "8ReSPaa5N1kuQ5YABmKhbWYdAAP9mMy9mpPdMPG23sg",
          isSigner: false,
          isWritable: false,
        },
      ],
      programId: "3parcLrT7WnXAcyPfkCz49oofuuf2guUKkjuFkAhZW8Y",
      data: [223, 179, 226, 125, 48, 46, 39, 74, 0],
    },
  ],
  signers: [],
};
