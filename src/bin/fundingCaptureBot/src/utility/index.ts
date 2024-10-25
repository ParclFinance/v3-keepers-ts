import type { IndexTimes } from "../config";

export type IndexUpdate = {
  minTime: number;
  maxTime: number;
};

export function getIndexUpdateData(indexTimes: IndexTimes): IndexUpdate {
  const date = new Date();

  return {
    minTime: new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        indexTimes.minHours,
        indexTimes.minMinutes
      )
    ).getTime(),
    maxTime: new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        indexTimes.maxHours,
        indexTimes.maxMinutes
      )
    ).getTime(),
  };
}
