import { RpcAccount, publicKey } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  Serializer,
  array,
  bytes,
  publicKey as publicKeySerializer,
  struct,
  u32,
  u64,
  u8,
} from "@metaplex-foundation/umi/serializers";
import {
  Address,
  MARGIN_ACCOUNT_DISCRIMINATOR,
  MarginAccount,
  MarginAccountWrapper,
  MarginsWrapper,
  MarketMap,
  PARCL_V3_PROGRAM_ID,
  ParclV3Sdk,
  Position,
  ProgramAccount,
} from "@parcl-oss/v3-sdk";
import { positionSerializer } from "@parcl-oss/v3-sdk/dist/cjs/types/accounts/serializers";
import { decode } from "bs58";
import Decimal from "decimal.js";
import { decorateLog } from "./dateTime";
import { getAccountClone } from "./programAccounts";

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
export const exchangeLUT = "D36r7C1FeBUARN7f6mkzdX67UJ1b1nUJKC7SWBpDNWsa";

export type HighRiskStore = {
  address: Address;
  score: number;
};
export type Liquidator = {
  liquidatorMarginAccount: string;
  privateKeyString: string;
};
export function calculateLiquidationProximityScore(margins: MarginsWrapper): number {
  const totalRequired = margins.totalRequiredMargin().val.toPrecision(9);
  //  val: 1276751502711168.411,
  const available = margins.margins.availableMargin.val.toPrecision(9);
  // available: PreciseIntWrapper {
  //   val: 26592083132837317.469,
  if (parseInt(totalRequired) === 0) return 0;
  // Calculate ratio using Decimal to maintain precision
  const ratio = new Decimal(totalRequired).div(new Decimal(available));

  const score = Decimal.max(
    Decimal.min(ratio.valueOf(), new Decimal(1).valueOf()),
    new Decimal(0).valueOf()
  )
    .times(100)
    .toNumber()
    .toPrecision(4);
  return parseInt(score);
}

export async function getActiveMarginAccounts(
  rpcUrl: string,
  addresses: Address[],
  log: boolean = false
) {
  const start = performance.now();
  const sdk = new ParclV3Sdk({ rpcUrl, commitment: "confirmed" });
  const marginAccounts = await sdk.accountFetcher.getMarginAccounts(addresses);
  const nonZeroAccounts = marginAccounts
    .filter(isDefined<ProgramAccount<MarginAccount>>)
    .filter((a) => a.account.margin !== BigInt(0));
  // nonZeroAccounts.forEach((a) => {
  //   if (a.account.owner.toString() === "DoZ1tbFkx663Pt8RUuw5jzCeypUKQsehXsfuezmmeXrt") {
  //     console.log(stringifiedMarginAccountData(a));
  //   }
  // });
  const end = performance.now();
  if (log)
    console.log(
      decorateLog(`Retrieved ${nonZeroAccounts.length} non-zero margin accounts`, start, end)
    );
  // console.log(stringifiedMarginAccountData(nonZeroAccounts[0]));
  return nonZeroAccounts;
}

export const discriminatorFilter = {
  memcmp: {
    offset: 0, // Offset for the discriminator
    bytes: new Uint8Array(MARGIN_ACCOUNT_DISCRIMINATOR),
  },
};
export const marginAccountFilter = {
  dataSize: 904, // Filter for accounts size in bytes
};
const filters = [discriminatorFilter];

export function filterPositioned(accounts: ProgramAccount<MarginAccount>[]) {
  return accounts.filter((account) =>
    account.account.positions.some((position) => position.size !== BigInt(0))
  );
}
export function filterMargined(accounts: ProgramAccount<MarginAccount>[]) {
  return accounts.filter((account) => account.account.margin !== BigInt(0));
}

export const marginAccountSerializer: Serializer<MarginAccount> = struct([
  ["positions", array(positionSerializer, { size: 12 })],
  ["margin", u64()],
  ["maxLiquidationFee", u64()],
  ["id", u32()],
  ["exchange", publicKeySerializer()],
  ["owner", publicKeySerializer()],
  ["delegate", publicKeySerializer()],
  ["inLiquidation", u8()],
  ["bump", u8()],
  ["_padding", bytes({ size: 10 })],
]);
type MarginMargin = {
  margin: bigint;
};
const mmSerializer: Serializer<MarginMargin> = struct([["margin", u64()]]);

export type MarginAccountPositionsOnly = {
  positions: Position[];
};
export const MarginAccountPositionsOnlySerializer: Serializer<MarginAccountPositionsOnly> = struct([
  ["positions", array(positionSerializer, { size: 12 })],
]);

export const test = {
  hasZeroMargin: 0,
  hasZeroInFirstPosition: 661,
};
// filters: RpcDataFilterMemcmp[]

export async function getMarginAddressesFromSlice(rpcUrl: string, log: boolean = false) {
  const umi = createUmi(rpcUrl);
  const start = performance.now();
  const rawAccounts = await umi.rpc.getProgramAccounts(publicKey(PARCL_V3_PROGRAM_ID), {
    dataSlice: { offset: 776, length: 8 },
    filters: [...filters, marginAccountFilter],
  });
  const end = performance.now();
  if (log) console.log(decorateLog(`Fetched ${rawAccounts.length} slices`, start, end));

  const marginedAccountAddresses = rawAccounts
    .filter((account) => {
      return deserializeMargin(account.data) !== BigInt(0);
    })
    .map((rawAccount) => rawAccount.publicKey);
  return marginedAccountAddresses as Address[];
}

export const exampleMarginAccount = decode(
  "1111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111115UBz9xkCbCAG9EXkHyKRM8L56X8DDDATAqzKVQsHDmEwLLsDqCGZZACbhZyxu1EK4sA1JvHSn6mgvsjeXBgoz1Lq9KozXSHBxAVENvyXdj2XC4S5aaAG8xTryqnoZK9eDjNoBcu1FkW7iuDuDs2sfKxbNM4gKh62H683Hc3LS87WFJQvHL6Yg7LMhh"
);

export const deserializeMargin = (data: Uint8Array, offset: number = 0) => {
  return mmSerializer.deserialize(data.slice(offset, offset + 8))[0].margin;
};

export function findOffset(
  dataBuffer: Uint8Array,
  dataLength: number = 0,
  deserializeFn: (data: Uint8Array) => bigint | string,
  findMatch: string | bigint
) {
  // console.log(encode(dataBuffer.slice(820, 852))); //owner EK1wdQLoPKy9DtPWUFVpFwt9bdszoQ6qjxA7aCR7trZz
  for (let i = 0; i < dataBuffer.length - dataLength; i++) {
    if (deserializeFn(dataBuffer.slice(i, i + dataLength)) === findMatch) {
      console.log(`match at ${i} bytes`); // or 788?
    }
  }
}

export function filterNonZeroMargins(accounts: RpcAccount[]) {
  console.log(`starting with: ${accounts.length} accounts`);
  return accounts.filter((account) => {
    const margin = u64().deserialize(account.data);
    return margin[0] !== BigInt(0);
  });
}

export async function getPositionedMarginAccounts(rpcUrl: string) {
  const allAccounts = await getAccountClone(rpcUrl, filters);
  const filteredAccounts = filterMargined(allAccounts);
  return filterPositioned(filteredAccounts);
}
const positionCount = 12; // Total number of positions
const positionSize = 56; // Size of each position in bytes

export const positionFilters = Array.from({ length: positionCount })
  .map((_, i) => i)
  .map((i) => ({
    memcmp: {
      offset: 8 + i * positionSize, // Offset for the size field of each position
      bytes: new Uint8Array(Array.from({ length: 8 }).fill(0) as number[]), // Filter for non-zero size
    },
  }));

export function stringifiedMarginAccountData(account: ProgramAccount<MarginAccount>) {
  return JSON.stringify(
    {
      address: account.address.toString(),
      account: {
        positions: account.account.positions.map((position) => ({
          marketId: position.marketId.toString(),
          size: position.size.toString(),
        })),
        delegate: account.account.delegate.toString(),
        exchange: account.account.exchange.toString(),
        owner: account.account.owner.toString(),
        margin: account.account.margin.toString(),
        maxLiquidationFee: account.account.maxLiquidationFee.toString(),
      },
    },
    null,
    2
  );
}

export function getMarketsAndPriceFeeds(
  marginAccount: MarginAccountWrapper,
  markets: MarketMap
): [Address[], Address[]] {
  const marketAddresses: Address[] = [];
  const priceFeedAddresses: Address[] = [];
  for (const position of marginAccount.positions()) {
    const market = markets[position.marketId()];
    if (market.address === undefined) {
      throw new Error(`Market is missing from markets map (id=${position.marketId()})`);
    }
    marketAddresses.push(market.address);
    priceFeedAddresses.push(market.priceFeed());
  }
  return [marketAddresses, priceFeedAddresses];
}
