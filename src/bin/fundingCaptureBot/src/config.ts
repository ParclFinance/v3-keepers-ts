export type IndexTimes = {
  minHours: number;
  minMinutes: number;
  maxHours: number;
  maxMinutes: number;
};

export type Config = {
  amountToTradeUSD: number;
  indexTimes: IndexTimes;
  marginAccountId: number;
  tradeOnAllProfitableMarkets: boolean; //if this is false, it will choose the most profitable one.
};

const config: Config = {
  amountToTradeUSD: 20,
  marginAccountId: 0,
  indexTimes: {
    minHours: 11,
    minMinutes: 30,
    maxHours: 11,
    maxMinutes: 40,
  },
  tradeOnAllProfitableMarkets: true,
};

export default config;
