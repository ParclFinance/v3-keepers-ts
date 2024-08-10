<div align="center">
<img height="180" src="https://app.parcl.co/favicon.png"/>
<h1>v3-keepers-ts</h1>
</div>

Example parcl-v3 keeper bots written in TypeScript.

## Alpha Software

These example keepers are in alpha. Keepers may contain bugs.

## Development

Pull requests welcome. Please reach out in the discord dev channel with any questions.

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/ParclFinance/v3-keepers-ts.git
   cd v3-keepers-ts
   ```

2. Install Bun globally (if not already installed):
   ```
   npm i -g bun
   ```

3. Install dependencies:
   ```
   bun install
   ```

4. Set up your environment variables:
   - Copy the `.env.example` file to `.env`
   - Fill in the required values in the `.env` file

## Usage

To start the liquidator bot:

```
bun liquid
```

This command will run the liquidator bot, which will monitor margin accounts for liquidatable positions and attempt to liquidate them when found.

Note: Ensure you have properly configured your `.env` file with the necessary credentials and settings before running the bot.

## Keepers

| Keeper Name | Info                                                                                                                                                                                                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Liquidator  | Watches margin accounts for liquidatable accounts and accounts currently in liquidation. If an account is found, then the service attempts to liquidate the account. Liquidator's margin account earns the liquidation fee rate applied to the total notional liquidated amount. |
| Settler     | Watches settlement requests and processes the mature requests. Each settlement request has a optional tip that goes to the settler keeper.                                                                                                                                       |
