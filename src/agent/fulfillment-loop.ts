// One pass of the fulfillment loop:
//   1. new Walmart orders -> acknowledge -> hand to supplier
//   2. supplier tracking  -> mark shipped on Walmart
// Writes are skipped (logged only) while DRY_RUN is not "false".

import { credsFromEnv } from '../walmart/auth.js';
import { acknowledgeOrder, listOrders, shipOrder } from '../walmart/orders.js';
import { manualSupplier } from '../suppliers/manual.js';
import type { Supplier } from '../suppliers/types.js';

const DRY_RUN = process.env.DRY_RUN !== 'false';
const supplier: Supplier = manualSupplier;

async function write(label: string, fn: () => Promise<void>): Promise<void> {
  if (DRY_RUN) {
    console.log(`[dry-run] ${label}`);
    return;
  }
  await fn();
  console.log(`[done] ${label}`);
}

export async function runOnce(): Promise<void> {
  const creds = credsFromEnv();
  console.log(`env=${creds.env} dryRun=${DRY_RUN} supplier=${supplier.name}`);

  const created = await listOrders(creds, 'Created');
  console.log(`${created.length} new order(s)`);
  for (const order of created) {
    const po = order.purchaseOrderId;
    await write(`acknowledge ${po}`, () => acknowledgeOrder(creds, po));
    await write(`send ${po} to ${supplier.name}`, () => supplier.placeOrder(order));
  }

  const tracking = await supplier.collectTracking();
  const byPo = new Map<string, typeof tracking>();
  for (const t of tracking) byPo.set(t.purchaseOrderId, [...(byPo.get(t.purchaseOrderId) ?? []), t]);
  for (const [po, lines] of byPo) {
    await write(`ship ${po} (${lines.length} line(s))`, () =>
      shipOrder(
        creds,
        po,
        lines.map((t) => ({
          lineNumber: t.lineNumber,
          quantity: t.quantity,
          carrier: t.carrier,
          trackingNumber: t.trackingNumber,
          methodCode: 'Standard',
        })),
      ),
    );
  }
  if (tracking.length) await write('archive uploaded tracking', () => supplier.markTrackingUploaded());
}

runOnce().catch((err) => {
  console.error(err);
  process.exit(1);
});
