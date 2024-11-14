<div align="center">
<img height="180" src="https://app.parcl.co/favicon.png"/>
<h1>v3-keepers-ts</h1>
</div>

Example parcl-v3 keeper bots written in TypeScript.

## Alpha Software

These example keepers are in alpha. Keepers may contain bugs.

## Development

Pull requests welcome. Please reach out in the discord dev channel with any questions.

## Keepers

| Keeper Name           | Info                                                                                                                                                                                                                                                                             |
|-----------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Liquidator            | Watches margin accounts for liquidatable accounts and accounts currently in liquidation. If an account is found, then the service attempts to liquidate the account. Liquidator's margin account earns the liquidation fee rate applied to the total notional liquidated amount. |
| Settler               | Watches settlement requests and processes the mature requests. Each settlement request has a optional tip that goes to the settler keeper.                                                                                                                                       |
| Funding Rate Strategy | Maintains one position with the maximum absolute value funding rate.                                                                                                                                                                                                             |


## Using the funding rate strategy keeper

Start with one or less positions for your margin account. Running the strategy with `open` in the
command line parameter will do the following
1) Find the highest absolute value funding rate
2) Check if a current position is open for that market, leave it alone and exit if it is, and otherwise close the position 
3) Open a position on the minority side

Use `crontab -e` to schedule the funding strategy updates. You will need to adjust the times to your timezone
and the username and paths to match your setup.

Option 1: Only use token positions during the real estate index updates. 
```cron
# Update parcl funding rate position
0 0-4,6-23 * * * cd /home/user/repos/v3-keepers-ts && /home/user/.nvm/versions/node/v18.13.0/bin/node dist/esm/bin/fundingStrategy.js open 
# Update parcl funding rate for update, but don't use real estate markets
0 5 * * * cd /home/user/repos/v3-keepers-ts && /home/user/.nvm/versions/node/v18.13.0/bin/node  dist/esm/bin/fundingStrategy.js open tokens
```

Option 2: Don't leave any positions open during real estate index update.
```cron
# Update parcl funding rate position
0 0-4,6-23 * * * cd /home/user/repos/v3-keepers-ts && /home/user/.nvm/versions/node/v18.13.0/bin/node dist/esm/bin/fundingStrategy.js open 
# Update parcl funding rate for update, but don't use real estate markets
0 5 * * * cd /home/user/repos/v3-keepers-ts && /home/user/.nvm/versions/node/v18.13.0/bin/node  dist/esm/bin/fundingStrategy.js close 
```

Choose how aggressive you want to be with the `LEVERAGE` variable in the `fundingStrategy.ts` file.
