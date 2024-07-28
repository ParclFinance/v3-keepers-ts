<div align="center">
<img height="180" src="https://app.parcl.co/favicon.png"/>
<h1>v3-keepers-ts</h1>
</div>

Example parcl-v3 keeper bots written in TypeScript.

## Alpha Software

These example keepers are in alpha. Keepers may contain bugs.

## Development

Pull requests welcome. Please reach out in the discord dev channel with any questions.

## Liquidator Bot

### Installation

To install `git clone https://github.com/ParclFinance/v3-keepers-ts`.
Navigate into directory `cd v3-keepers-ts`.
Install required packages `npm i`.
Run the program `npm start`.

### Hypothesis for fastest bot

The most important factor for having the fastest liquidator bot is to monitor at risk margin accounts and to update them frequently (their positions and market price feeds). This bot acheives that by storing at risk margin accounts in a separate array allowing for extremely fast updates.

### Explanation

This bot takes over 1 minute to query all existing margin accounts, but once queried, tracks only margin accounts in danger of being liquidated. The user can set the priceFeedInterval (in ms) which determines the speed of checking for at risk margin accounts. The default value is 200ms, but this can be closer to 54ms if desired. Of course this is limited by your network speeds and by how many at risk margin accounts their are (this setting is also configurable).

Every x minutes (configurable) the bot re-queries for all existing margin accounts and udpates the at risk accounts with any new accounts. Previous at risk accounts are already being updated at the priceFeedInterval and don't need this update.

### Logging

The logging system is disabled by default, but is very helpful for understanding (and shows profits if any).

### Todo

- Send the CPU intensive task of deserializing and computing margins to a background worker thread.
- Filter for only relevant data for each margin account, therefore decreasing deserialization size.
- Only query all margin accounts once, and instead stream new accounts directly. This would significantly improve ongoing queries of all accounts (although a background worker is probably enough). This was not implemented as I couldn't find a free streaming service.

## Settler Bot

Watches settlement requests and processes the mature requests. Each settlement request has a optional tip that goes to the settler keeper.
