// Phase 1 supplier: you place orders by hand.
// Writes out/to-purchase.csv; reads tracking you paste into out/tracking.csv
// (header: purchaseOrderId,lineNumber,quantity,carrier,trackingNumber).

import { appendFile, mkdir, readFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Supplier, SupplierTracking } from './types.js';

const OUT = 'out';
const csv = (v: string) => `"${String(v).replace(/"/g, '""')}"`;

export const manualSupplier: Supplier = {
  name: 'manual',

  async placeOrder(order) {
    await mkdir(OUT, { recursive: true });
    const file = `${OUT}/to-purchase.csv`;
    if (!existsSync(file)) {
      await appendFile(file, 'purchaseOrderId,lineNumber,sku,productName,quantity,shipTo,shipBy\n');
    }
    const a = order.shippingInfo.postalAddress;
    const shipTo = [a.name, a.address1, a.address2, a.city, a.state, a.postalCode].filter(Boolean).join(', ');
    const shipBy = new Date(order.shippingInfo.estimatedShipDate).toISOString();
    const rows = order.orderLines.orderLine.map((l) =>
      [order.purchaseOrderId, l.lineNumber, l.item.sku, l.item.productName, l.orderLineQuantity.amount, shipTo, shipBy]
        .map(csv)
        .join(','),
    );
    await appendFile(file, rows.join('\n') + '\n');
  },

  async collectTracking() {
    const file = `${OUT}/tracking.csv`;
    if (!existsSync(file)) return [];
    const [, ...lines] = (await readFile(file, 'utf8')).trim().split('\n');
    return lines
      .filter((l) => l.trim())
      .map((l): SupplierTracking => {
        const [purchaseOrderId, lineNumber, quantity, carrier, trackingNumber] = l.split(',').map((s) => s.trim());
        return { purchaseOrderId, lineNumber, quantity, carrier, trackingNumber };
      });
  },

  async markTrackingUploaded() {
    await rename(`${OUT}/tracking.csv`, `${OUT}/tracking.${Date.now()}.done.csv`);
  },
};
