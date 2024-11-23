import type { PriceUpdateTimeUTC } from "./BountyBot/types";

export interface Config {
  priceUpdateTimeUTC: PriceUpdateTimeUTC;
}

const config: Config = {
  priceUpdateTimeUTC: {
    min: {
      hours: 12,
      minutes: 30,
    },
    max: {
      hours: 12,
      minutes: 40,
    },
  },
};

export default config;
