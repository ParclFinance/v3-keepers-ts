export interface PriceUpdateTimeUTC {
  min: {
    hours: number;
    minutes: number;
  };
  max: {
    hours: number;
    minutes: number;
  };
}

export type PriceUpdateTimeEpoch = {
  minTime: number;
  maxTime: number;
};
