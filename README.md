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

| Keeper Name | Info                                                                                                                                                                                                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Liquidator  | Watches margin accounts for liquidatable accounts and accounts currently in liquidation. If an account is found, then the service attempts to liquidate the account. Liquidator's margin account earns the liquidation fee rate applied to the total notional liquidated amount. |
| Settler     | Watches settlement requests and processes the mature requests. Each settlement request has a optional tip that goes to the settler keeper.                                                                                                                                       |

## High Level System Overview
- Periodically get all margin accounts owned by parcl program
- Use websockets and subscribe to those margin accounts we received above
- When we recieve an account update get exchange, markets, price feeds, and margin account and calculate if canLiquidate
- Update margin accounts (subscribe/unsubscribe)
- Add a tip ix to liquidate tx
- Stream Parcl program `getProgramAccounts` Margin Accounts (Helius api-key) -> Websocket `onAccountChange` (Helius api-key) -> canLiquidate -> compute JitoLabs tip, build/send liquidate JitoLabs bundle

## Findings
- Margin Accounts
    - Data Layout
        - Margin Accounts are 904 bytes
            - `Anchor discriminator:` 8 bytes
            - `positions:` (16 * 2 + (8 * 3) + 4 + 4) * 12 = 768 bytes
            - `margin:` 8 bytes
            - `maxLiquidationFee:` 8 bytes
            - `id:` 4 bytes
            - `exchange:` 32 bytes
            - `owner:` 32 bytes
            - `delegate:` 32 bytes
            - `inLiquidation:` 1 byte
            - `bump:` 1 byte
            - `_padding:` 10 bytes
            - `inLiquidation` is then at byte 8 + 768 + 8 + 8 + 4 + (32 * 3) = 892
        - ParclV3Sdk uses `data.copyWitin` method to remove Anchor discriminator, this effectively left shifts offsets by 8
            - If Anchor discriminator is included, `inLiquidation` data field is at byte offset 892, otherwise `inLiquidation` data field is at byte offset 892 - 8 = 884
    - We can get Margin Accounts owned by Parcl program
        - Use Anchor discriminator as filter
        - Use Margin Account data size as filter
        - If the `inLiquidation` data field is all we need to determine if an account can be liquidated, we can use it as a filter as well
        - We can optimize queries by requesting a data slice instead of all data
            - Not necessarily applicable here, we need all of the Margin Accounts data to compute if we can liquidate, and we would need to consider seriliazition/deserialization of the data slice
    - Geyser
        - Fastest way to recieve updates of on-chain events
        - If we host a private node or use a service provider (ex. Helius or Triton One) we can subscribe to Parcl program accounts and Margin Accounts
    - JitoLabs
        - If we have private node with Geyser plugin we can use JitoLabs SDK for subscribing to Parcl program account updates, Margin Accounts updates, and bundle result updates
            - Need url and access token
        - Block engine
            - Need to register an auth keypair with JitoLabs for sending bundles to block engine
            - We can use the `SearcherClient.onBundleResult` method to get updates (pending query)
        - Send bundles with tip ix to block engine to increase chances of tx landing
            - Need tip authority keypair for signing and sending tip lamports
        - Send tx (can include tip ix or not)
            - `sendTransaction` "This method will send the transaction received as a regular solana transaction via the solana rpc method and also submit it as a bundle."
            - Use the `JitoRpcConnection` class, which extends the `@solana/web3.js` `Connection` class, and set the rpc url to https://mainnet.block-engine.jito.wtf/api/v1/transactions (Tested curl request and works)
        - Confirm bundle status
            - `getBundleStatuses` "Returns bundle statuses for submitted bundle(s). The behavior is similar to the solana rpc method `getSignatureStatuses`. If the `bundle_id` is not found or if the bundle has not landed, we return `null`. If found and landed, we return the context information including the slot at which the request was made and result with the bundle_id(s) and the transactions with the slot and confirmation status." https://mainnet.block-engine.jito.wtf/api/v1/bundles (Tested curl requested and works)
            - We can use the `SearcherClient.onBundleResult` method to get updates (pending query)
        - Tip
            - As of the time of this writing, successfully liquidating an account earns the liquidation fee rate applied to the total notional liquidated amount AND 50,000 Parcl points ~$26,000. Tip amount can then be a function of expected reward.
            - Include tip instruction in last transaction
            - Less than or equal to 5 transactions allowed in a bundle
    - Websockets (Helius)
        - Periodically run query for Parcl program Margin Accounts (need an api key for `getProgramAccounts` method)
            - We can optimize queries here by not requesting any of the data, we only need the Margin Account public keys for subscribing to account updates
            - Use Helius Websockets to subscribe to Margin Account updates
                - Notification
                    - Parse JSON response
                        - subscription (id needed for unsubscribing)
                        - data: Margin Account data
                            - Can save us a network call for Margin account data, tradeoff being we need to properly deserialize the data
                        - owner (We dont need this as it is just the Parcl program address)
                    - Need exchange, markets, price feeds, and Margin Account for computing if we can liquidate
                    - Send bundle or tx to block engine
                    - Confirm bundle status
            - Unsubscribe from irrelevant Margin Accounts
- Future Considerations
    - JitoLabs Simulate bundle
        - Need to know where Parcl points and liquidator fees for a liquidator account are sent/stored
        - Use the results of the simulation to compute tip amount
    - Integrate private dedicated nodes and Geyser (mentioned above)
    - Write liquidate txs/bundle results to CSV file
    - Pending queries with JitoLabs
        - Are JitoLabs `SearcherClient` and JitoGeyserClient two separate things?
        - Assuming I have block engine access, can I use `SearcherClient.onBundleResult` method even though I do not have a private node?

## My Notes/Questions
- Can anyone be a liquidator?
  - Looks like yes. All you need is a margin account and a keypair used for signing and deriving margin account pda.
- How can one make a liquidator margin account?
  - Once you create an account via Parcl dApp, open Chrome DevTools -> Network Tab -> `margin-accounts` request -> in payload you will find your margin account `address` and `id`. You can use the keypair you used for creating an account as a signer for the liquidator.
  - Looks like you can use the `getMarginAccountPda` where the `id` parameter can be any number in [0, 2**32 - 1]
- What is this, `HVptGRTGDt8FyTwuzEmSgZAPqEoPNqeRcn9eKcmpgSae` event authority PDA?
  - On-chain event logging
- What is the most optimal event(s) to subscribe to in order to determine if an account can be liquidated?
- How often do price feeds and markets get updated?
  - If not often then I do not need to query everytime a margin account has an update
- If market and price feed addresses do not change, I can include them as constants
- When I liquidate an account my liquidator's margin account earns the liquidation fee rate applied to the total notional liquidated amount AND 50,000 pts per liquidation