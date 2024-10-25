Trading Bot for Capturing Funding on Markets
This trading bot is designed to capture funding opportunities in various markets, executing trades based on specific criteria to maximize profitability while managing risks and fees. It was developed as part of a bounty task and focuses on strategic position management and fee optimization. This README explains how the bot functions and the underlying strategies it employs.

Overview
The bot monitors funding rates across multiple markets, identifying opportunities to open positions on the minority side of the market skew. Key functionalities include:

Market Data Fetching: The bot fetches data from all available markets to determine the current funding rates, market skews, and velocity of changes.
Criteria for Opening Positions: The bot will only open a position when it is on the minority side of the market skew and captures funding and seemed to be profitable.
Position Management: The bot automatically closes all open positions at 11:30 UTC, regardless of market conditions, to avoid index price change impact.
Automated Position Monitoring:
The bot not only opens positions but also monitors them over time. It periodically checks existing positions to ensure they remain profitable and handles adjustments based on market conditions.
Time-Sensitive Trading Logic:
The bot avoids trading during index update times (between minTime and maxTime) to prevent the risk of adverse price movements due to index adjustments. This ensures safer position management by avoiding periods of high volatility.
Market Analysis:
The bot simultaneously fetches market data and evaluates potential trades across multiple markets. It then filters out markets with expected PnL above a specific threshold (> 100) given that 100 is 0% PNL.

Profitability Calculation
The bot uses a formula to calculate the expected PnL (Profit and Loss) before entering any position:

Funding impact:
𝐹(𝑡)=Math.abs(𝑟0×𝑡+0.5×𝑣×𝑡2)

r₀: Initial funding rate.
v: Velocity of the funding rate changes.
t: Time left to hold the position (in hours).
This formula calculates the funding impact.

Trading Fees
The trading fees are calculated as follows:

Opening Fee: Must be maker fee (0.02%) because positions are always opened on the minority side of the skew & not exceeding it.
Closing Fee: Assumed to be the taker fee (0.1%) since the bot cannot predict whether it will remain on the minority side, thus will be taken into account as if we closed it at 11:30 UTC (minority skew side -> taker fee).
The net profitability formula is:

Funding impact:
𝐹(𝑡)=Math.abs(𝑟0×𝑡+0.5×𝑣×𝑡2)

Net PnL:Funding impact-Opening Fee - Closing Fee

Fee Optimization
To minimize fees and maximize profitability, the bot employs the following strategies:

Position Sizing:

The bot opens positions in the minority only up to the size of the market skew. For example, if a market has 10 more long shares than short, the bot will open a maximum of 10 short positions to ensure it remains on the minority side.
This approach prevents the bot from paying taker fees on any additional shares and ensures that positions do not shift into the majority side, avoiding the need for early position closure.
Dynamic Position Closing:

When closing a position when the position skew moves into the majority, the bot calculates how many shares exceed the minority threshold and calculate wether it should fully close the position or close the amount the shares have exceeded from the minority.
This strategy ensures that whenever we reach a majority side of the skew, our size close will be only paying maker fee.
Gas Fee Optimization
The bot reduces gas fees through transaction batching:

If multiple markets are detected as profitable at the same time, the bot groups trades into batches of 3 markets per transaction.
This approach reduces the number of transactions needed and saves on overall gas costs compared to sending separate transactions for each market.

Configuration
The bot can be configured by the user through a file named config.ts. Inside this file, users can adjust the following settings:

Trade Mode:
Choose whether to trade only the most profitable market or all profitable markets.
Commitment Amount:
Specify how many USD to commit for each trade, allowing for customizable risk management.
