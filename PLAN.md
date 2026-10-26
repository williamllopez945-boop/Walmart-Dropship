# Walmart Fulfillment Agent: Research and Build Plan

## 1. What already exists on GitHub

I searched GitHub for Walmart dropshipping, fulfillment, Marketplace API and seller-agent projects. These are the ones worth learning from:

| Repo | What it is | Worth copying | Gaps |
|---|---|---|---|
| [jabbertones-cloud/walmart-marketplace-mcp](https://github.com/jabbertones-cloud/walmart-marketplace-mcp) | TypeScript MCP server (an agent tool layer) for Walmart orders, items, inventory and feeds | **The format we copy.** It splits `core` (a plain API client) from `mcp` (agent tools). It caches the OAuth token, posts feeds as multipart, and gates every write behind `REQUIRE_EXPLICIT_APPLY` | No license, so we copy the layout and write our own code. It has no supplier side and no automation loop |
| [alyiox/mcp-walmart-ads](https://github.com/alyiox/mcp-walmart-ads) (MIT) | Python MCP server over 424 Walmart operations, built from bundled OpenAPI specs | One config file per environment (sandbox and production). Good auth notes: tokens last 900 s and refresh 60 s early. Bundles the official OpenAPI specs | Generic proxy with no fulfillment workflow |
| [whitebox-co/walmart-marketplace-api](https://github.com/whitebox-co/walmart-marketplace-api) (MIT) | Fully typed TypeScript SDK generated from Walmart's OpenAPI | Can replace our hand-written client later if we need many endpoints | SDK only, no agent |
| [nicksarris/dropshipping](https://github.com/nicksarris/dropshipping) | 2019 Python bot that scrapes Walmart and lists the items on eBay | Its scraper → cross-check → lister pipeline is a good model for product research | Outdated API, goes the other direction (Walmart → eBay), fragile scraping |
| [DannylydST/sorftime-seller-agent](https://github.com/DannylydST/sorftime-seller-agent) | AI product-research agent covering 6 marketplaces, Walmart included | Ideas for product research (Phase 4) | Research only, no fulfillment |

**What none of them do:** run the whole loop of *new Walmart order → buy from supplier → upload tracking → keep stock and prices in sync* on their own. That loop is what we build.

## 2. Ground rules (read before building)

- **Walmart's drop-ship policy.** You must be the seller of record. Your business name goes on the packing slip and invoice. You may **not** buy from another retailer (Amazon, Walmart.com, Target and so on) and have it shipped to your customer. Packages that show another retailer's branding can get the account suspended. Use real suppliers: wholesalers, drop-ship distributors, or your own stock.
- **Response times.** Acknowledge each order quickly (within 4 hours is the safe target) and ship by the `estimatedShipDate`. Walmart tracks on-time shipment and valid tracking rates, and accounts with poor rates get suspended.
- **Start in the sandbox.** Walmart provides sandbox credentials. Every write action defaults to **dry run** until you set `DRY_RUN=false`.

## 3. Architecture (copied from walmart-marketplace-mcp, plus a supplier layer and an agent loop)

```
src/
  walmart/          # "core": a plain Walmart Marketplace API client
    auth.ts         # OAuth2 client_credentials, token cache, signed fetch
    orders.ts       # list / acknowledge / ship / cancel
    inventory.ts    # (Phase 2) inventory + price feeds
  suppliers/
    types.ts        # Supplier interface: quote, placeOrder, getTracking
    manual.ts       # Phase 1: writes a CSV / emails you to place the order by hand
  agent/
    fulfillment-loop.ts  # poll → acknowledge → route to supplier → push tracking
  store/            # (Phase 2) SQLite: order state machine, idempotency
  mcp/              # (Phase 3) expose the same functions as MCP tools for Claude
```

Order state machine (one row per Walmart purchase order line):

```
Created → Acknowledged → SupplierOrdered → SupplierShipped → TrackingPushed → Delivered
                 └──────────→ Cancelled (out of stock or margin too low)
```

## 4. Phased plan

### Phase 0: Accounts and access (week 1)
- [ ] Get Walmart Marketplace seller approval. Apply at <https://marketplace.walmart.com>.
- [ ] Create API keys: Seller Center → Settings → API Key Management. Make **sandbox** keys first.
- [ ] Pick 1–2 suppliers with an API or CSV feed and blind drop-ship. Ask each for: an inventory feed, order placement by API or email, tracking turnaround, and handling time.
- [ ] Copy `.env.example` to `.env` and fill in the sandbox credentials.

### Phase 1: The order loop, partly manual (week 2)
- [ ] `npm install && npm run typecheck`
- [ ] `npm run agent:once`: lists `Created` orders in the sandbox and runs a dry-run acknowledge.
- [ ] Turn on real acknowledgement in the sandbox (`DRY_RUN=false`).
- [ ] The manual supplier adapter writes `out/to-purchase.csv`. You place the supplier orders by hand, paste the tracking numbers into `out/tracking.csv`, and the agent uploads them to Walmart.
- [ ] Do the test orders Walmart requires before go-live: acknowledge, ship, cancel and refund.

### Phase 2: State and sync (weeks 3–4)
- [ ] Add a SQLite store so every action is safe to repeat and a restart never ships twice. Right now, if the agent crashes after acknowledging an order but before handing it to the supplier, that order stops showing as `Created` and the agent can miss it. The store fixes this.
- [ ] Inventory sync: supplier stock feed → Walmart inventory feed every 1–4 hours. Set stock to 0 when the supplier is low.
- [ ] Price sync: supplier cost + fees + target margin → Walmart price feed, with a floor price so you never sell at a loss.
- [ ] Alerts by email or Slack: orders close to their ship date, failed feeds, low margin.

### Phase 3: Full automation and an AI agent (weeks 5–6)
- [ ] Replace the manual adapter with each supplier's API adapter.
- [ ] Run the loop on a schedule (cron, GitHub Actions or a small VPS) every 15 minutes.
- [ ] Wrap `src/walmart` and `src/agent` as MCP tools, like walmart-marketplace-mcp does. Claude can then answer "what's late today?", draft cancellations or handle exceptions, and every write still needs your confirmation.

### Phase 4: Growth
- [ ] Product research: score supplier catalog items against Walmart demand and competition, the way nicksarris/dropshipping and sorftime-seller-agent do.
- [ ] Bulk listing through the item feed (`MP_ITEM`).
- [ ] Returns and refunds automation, and reporting (profit by SKU).

## 5. Success metrics
- Orders acknowledged within 1 hour: >99%
- On-time shipment rate: >99%
- Valid tracking rate: >99%
- Cancellation rate: <2%
- Margin per order after fees: tracked per SKU

## 6. Next step
Finish Phase 0. When you have sandbox keys, run `npm run agent:once` and we'll take Phase 1 from there.
