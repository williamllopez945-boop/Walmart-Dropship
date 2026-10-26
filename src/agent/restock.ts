// WFS restock agent, one pass:
//   1. pull WFS inventory (with Walmart's sales forecast)
//   2. work out which SKUs run out before new stock could arrive
//   3. write out/restock-plan.csv and report inbound shipments in progress
//   4. with --create-shipment, create a WFS inbound shipment for the plan
//      (logged only while DRY_RUN is not "false")

import { mkdir, writeFile } from 'node:fs/promises';
import { credsFromEnv } from '../walmart/auth.js';
import {
  createInboundShipment,
  getWfsInventory,
  inboundShipmentRequest,
  listInboundShipments,
  type Address,
} from '../walmart/wfs.js';
import { COVER_DAYS, LEAD_TIME_DAYS, planRestock, type RestockLine } from './plan.js';

const DRY_RUN = process.env.DRY_RUN !== 'false';
function returnAddressFromEnv(): Address {
  const e = process.env;
  if (!e.RETURN_ADDRESS_LINE1 || !e.RETURN_CITY || !e.RETURN_STATE || !e.RETURN_POSTAL_CODE) {
    throw new Error('Set RETURN_ADDRESS_LINE1, RETURN_CITY, RETURN_STATE and RETURN_POSTAL_CODE to create shipments');
  }
  return {
    addressLine1: e.RETURN_ADDRESS_LINE1,
    city: e.RETURN_CITY,
    stateCode: e.RETURN_STATE,
    countryCode: 'USA',
    postalCode: e.RETURN_POSTAL_CODE,
  };
}

const COLUMNS: (keyof RestockLine)[] = [
  'sku', 'gtin', 'itemName', 'dailySales', 'available', 'inbound', 'daysLeft', 'orderUnits', 'walmartSuggested',
];
const csv = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

export async function runOnce(createShipment: boolean): Promise<void> {
  const creds = credsFromEnv();
  console.log(`env=${creds.env} dryRun=${DRY_RUN} leadTime=${LEAD_TIME_DAYS}d cover=${COVER_DAYS}d`);

  const [inventory, inbound] = await Promise.all([getWfsInventory(creds), listInboundShipments(creds)]);
  const open = inbound.filter((s) => s.status !== 'CLOSED' && s.status !== 'CANCELLED');
  console.log(`${inventory.length} WFS SKU(s), ${open.length} open inbound shipment(s)`);
  for (const s of open) {
    console.log(`  ${s.shipmentId} ${s.status} → ${s.shipToAddress.fcName ?? s.shipToAddress.city}: ${s.receivedUnits}/${s.shipmentUnits} received`);
  }

  const plan = planRestock(inventory);
  await mkdir('out', { recursive: true });
  await writeFile(
    'out/restock-plan.csv',
    [COLUMNS.join(','), ...plan.map((l) => COLUMNS.map((k) => csv(l[k])).join(','))].join('\n') + '\n',
  );
  console.log(`${plan.length} SKU(s) need restocking → out/restock-plan.csv`);
  for (const l of plan.slice(0, 10)) {
    console.log(`  ${l.sku}: ${l.daysLeft}d left, order ${l.orderUnits} (Walmart suggests ${l.walmartSuggested})`);
  }

  if (!createShipment || plan.length === 0) return;

  const arrive = new Date(Date.now() + LEAD_TIME_DAYS * 86_400_000).toISOString();
  const request = inboundShipmentRequest(`RESTOCK-${Date.now()}`, returnAddressFromEnv(), plan.map((l) => ({
    sku: l.sku,
    gtin: l.gtin,
    itemDesc: l.itemName,
    itemQty: l.orderUnits,
    // Replace with each SKU's real case pack before shipping; WFS checks it at receiving.
    vendorPackQty: l.orderUnits,
    innerPackQty: 1,
    expectedDeliveryDate: arrive,
  })));
  if (DRY_RUN) {
    console.log('[dry-run] create inbound shipment:\n' + JSON.stringify(request, null, 2));
    return;
  }
  for (const s of await createInboundShipment(creds, request)) {
    console.log(`[done] shipment ${s.shipmentId} → ${s.shipToAddress.city}, ${s.shipToAddress.stateCode}: ${s.shipmentItems.length} SKU(s)`);
  }
}

runOnce(process.argv.includes('--create-shipment')).catch((err) => {
  console.error(err);
  process.exit(1);
});
