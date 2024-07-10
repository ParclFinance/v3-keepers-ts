import { describe } from "mocha";
import pl, { DataFrame } from "nodejs-polars";
import { getMarginAccountsAtBoundedMarginLevels } from "../../src/bin/utils";
import * as dotenv from "dotenv";
dotenv.config();

describe("Polar Utils", async () => {
    let marginAccountsWithMargin: DataFrame;
    const lowerBound = 1.0e+16;
    const upperBound = 1.1e+16;

    before("Test Setup", async () => {
        marginAccountsWithMargin = pl.readCSV("./test/data/marginAccountsWithMargin.csv");
    });

    it("filter dataframe by a range of marginLevels", async () => {
        let priorityMarginAccountsDataFrame = marginAccountsWithMargin.filter(
            pl.col("marginLevels").gtEq(lowerBound)
                .and(pl.col("marginLevels").ltEq(upperBound))
        );
        console.log(priorityMarginAccountsDataFrame.head());
        console.log(priorityMarginAccountsDataFrame.shape);
    });
    
    it("getMarginAccountsAtBoundedMarginLevels", async () => {
        let priorityMarginAccountsDataFrame = getMarginAccountsAtBoundedMarginLevels(marginAccountsWithMargin, lowerBound, upperBound);
        console.log(priorityMarginAccountsDataFrame.head());
        console.log(priorityMarginAccountsDataFrame.shape);
    });

});
