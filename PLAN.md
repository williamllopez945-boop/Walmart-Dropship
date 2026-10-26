# Walmart Fulfillment Services (WFS) Agent: Research and Build Plan

## 1. How WFS changes the job

With WFS, you send inventory to Walmart's fulfillment centers. Walmart stores it, then picks, packs and ships every order and handles customer service and returns. **You never touch an order.** Your work, and the agent's, is everything upstream:

1. **Choose products** that sell well on Walmart at a profit after WFS fees.
2. **Convert listings to WFS** so Walmart fulfills them.
3. **Keep stock in Walmart's warehouses.** Know when each SKU will run out and restock before it does. This is the core automation.
4. **Send inbound shipments**: create the shipment, label the boxes, book the carrier, track receiving.
5. **Watch the money**: WFS fulfillment fees, monthly storage fees, aged-inventory fees, and profit per SKU.

## 2. What exists on GitHub

| Repo | What we take from it |
|---|---|
| [jabbertones-cloud/walmart-marketplace-mcp](https://github.com/jabbertones-cloud/walmart-marketplace-mcp) | **The layout we follow.** A plain API client kept apart from the agent layer, a cached login token, and writes that only happen after you allow them. It has no WFS support and no license, so we wrote our own code in the same shape |
| [alyiox/mcp-walmart-ads](https://github.com/alyiox/mcp-walmart-ads) (MIT) | Bundles Walmart's official API specs, including **fulfillment-management** (all WFS endpoints). Our endpoints and fields come from these specs |
| [whitebox-co/walmart-marketplace-api](https://github.com/whitebox-co/walmart-marketplace-api) (MIT) | Typed code library with WFS item and WFS inventory models. We can switch to it if we need many more endpoints |
| [DannylydST/sorftime-seller-agent](https://github.com/DannylydST/sorftime-seller-agent) | Product-research ideas for Phase 4 |

None of them automates WFS restocking. That's what we're building.

## 3. Walmart APIs the agent uses

| Need | Endpoint | Status in repo |
|---|---|---|
| WFS stock, sales forecast, days of supply, suggested units | `GET /v3/wfs/inventory` | ✅ `getWfsInventory` |
| Inbound shipments and receiving progress | `GET /v3/fulfillment/inbound-shipments` | ✅ `listInboundShipments` |
| Create an inbound shipment (Walmart assigns the fulfillment centers) | `POST /v3/fulfillment/inbound-shipments` | ✅ `createInboundShipment` |
| Preview where Walmart will send items | `POST /v3/fulfillment/inbound-preview` | Phase 2 |
| Box labels | `POST /v3/fulfillment/shipment-label` | Phase 2 |
| Discounted carrier through Walmart (quote, book, labels) | `/v3/fulfillment/inbound-shipments-quote`, `-booking`, `/generate-label` | Phase 2 |
| Send tracking if you use your own carrier | `POST /v3/fulfillment/shipment-tracking` | Phase 2 |
| Convert existing items to WFS | `POST /v3/feeds` (feed type `OMNI_WFS`) | Phase 3 |
| Inventory health (aged stock, storage-fee risk) | `GET /v3/report/wfs/getInventoryHealthReport` | Phase 3 |
| Lost or damaged units | `GET /v3/report/wfs/inventoryReconciliationReport` | Phase 3 |

## 4. Ground rules

- **Where inventory comes from.** Walmart can ask for supplier invoices. Buy from authorized distributors, wholesalers or the brand. Retail arbitrage (buying from stores or sites to resell) carries risk of brand complaints, restricted brands and account health issues, so read Walmart's current WFS and brand policies first.
- **Prep and labeling.** Every unit needs a scannable barcode (GTIN or WFS label), and each case needs a WFS box label. Case pack (`vendorPackQty`) must match what's really in the box. Mismatches cause receiving delays and fees.
- **Fees can kill margin.** Fulfillment fees depend on weight and size, storage is charged monthly, and inventory that sits too long pays extra. The agent sends stock for about 30 days of sales at a time instead of over-shipping.
- **Be careful with the sandbox and writes.** Creating an inbound shipment commits you to sending it. The agent only does this with `--create-shipment` **and** `DRY_RUN=false`.

## 5. Architecture

```
src/
  walmart/
    auth.ts        # OAuth2 client_credentials, token cache, sandbox/production
    wfs.ts         # WFS inventory + inbound shipments
  agent/
    plan.ts        # restock math (pure, testable)
    restock.ts     # one pass: inventory → plan → CSV → optional inbound shipment
  store/           # (Phase 2) SQLite: shipment history, supplier POs, SKU settings
  mcp/             # (Phase 3) the same functions as MCP tools for Claude
```

**Restock rule** (in `plan.ts`). For each SKU:

```
daily sales   = Walmart's 4-week sales forecast ÷ 28
units to send = daily sales × (LEAD_TIME_DAYS + COVER_DAYS) − (available + inbound)
```

Any SKU above 0 goes in `out/restock-plan.csv`, sorted by days of stock left. Walmart's own `suggestedUnits` sits next to it for comparison. `LEAD_TIME_DAYS` is your total delay: buy from supplier, receive, prep, ship to Walmart, receiving. Measure it after your first two shipments.

## 6. Phased plan

### Phase 0: Accounts and first products (weeks 1–2)
- [ ] Get Walmart Marketplace seller approval at <https://marketplace.walmart.com>.
- [ ] Enroll in WFS: Seller Center → Walmart Fulfillment Services.
- [ ] Create API keys (Seller Center → Settings → API Key Management) and fill in `.env`.
- [ ] Pick 5–10 starter SKUs. Look for small, light, non-hazmat items that sell steadily, with a margin above 25% after referral and WFS fees. Use Walmart's WFS fee calculator.
- [ ] Line up a supplier for each SKU and get invoices, case pack sizes and lead times.

### Phase 1: First shipment, partly manual (weeks 3–4)
- [ ] Convert the starter SKUs to WFS in Seller Center (bulk upload is fine for now).
- [ ] Create the first inbound shipment in Seller Center so you learn the steps: labels, carrier, appointment.
- [ ] `npm run restock` daily. Check that the shipment shows up and that `out/restock-plan.csv` makes sense.

### Phase 2: Automated inbound (weeks 5–6)
- [ ] Add a SKU settings file: real case pack, supplier, cost, minimum order quantity. Shipments then use real case packs instead of the single-case placeholder.
- [ ] Add a step to send purchase orders to suppliers (email or CSV first), so the restock plan turns into supplier orders.
- [ ] Add inbound preview, box labels, the Walmart carrier quote and booking, and tracking.
- [ ] Add a SQLite store for shipment history, and record your real lead time per SKU.
- [ ] Run `restock` on a schedule (cron or GitHub Actions) and send alerts by email or Slack: "SKU X runs out in 9 days", "shipment Y stuck in receiving".

### Phase 3: Health, fees and an AI agent (weeks 7–8)
- [ ] Pull the inventory health and reconciliation reports. Flag aged stock, surplus units and lost or damaged units to claim back.
- [ ] Build a profit-per-SKU report: price − cost − referral fee − WFS fee − storage.
- [ ] Convert new items to WFS through the API.
- [ ] Wrap the functions as MCP tools so Claude can answer "what do I need to send this week?" or draft a shipment. Every write still needs your approval.

### Phase 4: Growth
- [ ] Product research: score new SKUs on demand, competition and margin after WFS fees.
- [ ] Multichannel fulfillment: Walmart can also ship orders from your other stores out of WFS stock (`/v3/fulfillment/orders-fulfillments`).

## 7. Success metrics
- In-stock rate on WFS SKUs: >95%
- Days of supply per SKU: between the lead time and lead time + 45 days
- Aged inventory (>90 days): <10% of units
- Receiving discrepancies: <1% of units
- Net margin per SKU after all fees: tracked weekly

## 8. Next step
Finish Phase 0. When your API keys work, run `npm run restock` and we'll tune `LEAD_TIME_DAYS` and `COVER_DAYS` with your real numbers.
