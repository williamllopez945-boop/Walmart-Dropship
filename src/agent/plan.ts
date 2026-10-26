// Restock math: which WFS SKUs run out before new stock could arrive, and how much to send.

import type { WfsInventoryItem } from '../walmart/wfs.js';

// Days from deciding to restock until units are sellable at Walmart
// (buy from supplier + ship to you + prep + ship to the fulfillment center + receiving).
export const LEAD_TIME_DAYS = Number(process.env.LEAD_TIME_DAYS ?? 21);
// Days of sales each restock should cover once it lands.
export const COVER_DAYS = Number(process.env.COVER_DAYS ?? 30);

export interface RestockLine {
  sku: string;
  gtin: string;
  itemName: string;
  dailySales: number;
  available: number;
  inbound: number;
  daysLeft: number;
  orderUnits: number;
  walmartSuggested: number;
}

export function planRestock(items: WfsInventoryItem[]): RestockLine[] {
  const lines: RestockLine[] = [];
  for (const { itemInformation: info, inventoryData: inv, inventoryInsights: ins } of items) {
    const dailySales = (ins?.salesForecastWeek1to4 ?? 0) / 28;
    if (dailySales <= 0) continue;
    const stock = inv.availableUnits + inv.inboundUnits;
    const needed = Math.ceil(dailySales * (LEAD_TIME_DAYS + COVER_DAYS)) - stock;
    if (needed <= 0) continue;
    lines.push({
      sku: info.sku,
      gtin: info.gtin,
      itemName: info.itemName,
      dailySales: Math.round(dailySales * 100) / 100,
      available: inv.availableUnits,
      inbound: inv.inboundUnits,
      daysLeft: Math.floor(inv.availableUnits / dailySales),
      orderUnits: needed,
      walmartSuggested: ins?.suggestedUnits ?? 0,
    });
  }
  return lines.sort((a, b) => a.daysLeft - b.daysLeft);
}
