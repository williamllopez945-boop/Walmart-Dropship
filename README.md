# Walmart WFS Restock Agent

Automates the seller side of Walmart Fulfillment Services: Walmart stores, picks, packs and ships your orders, and this agent keeps your stock in Walmart's fulfillment centers from running out.

See [PLAN.md](PLAN.md) for the research behind this layout and the phased build plan.

## Quick start

```bash
cp .env.example .env    # add credentials
npm install
npm run typecheck
npm run restock         # WFS inventory + open inbound shipments → out/restock-plan.csv
npm run restock:ship    # also builds an inbound shipment for the plan (dry run by default)
```
