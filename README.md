# Walmart Dropship Fulfillment Agent

Automates Walmart Marketplace order fulfillment: poll new orders, acknowledge, route to a supplier, push tracking back to Walmart.

See [PLAN.md](PLAN.md) for the research behind this layout and the phased build plan.

## Quick start

```bash
cp .env.example .env   # add sandbox credentials
npm install
npm run typecheck
npm run agent:once     # one pass of the fulfillment loop (dry run by default)
```
