// Walmart Fulfillment Services (WFS) API: inventory and inbound shipments.
// Walmart stores, picks, packs and ships WFS orders, so the seller's work is
// keeping stock in Walmart's fulfillment centers.

import { walmartFetch, type WalmartCreds } from './auth.js';

export interface WfsInventoryItem {
  itemInformation: { sku: string; gtin: string; itemName: string; itemID?: string };
  inventoryData: {
    availableUnits: number;
    inboundUnits: number;
    reservedUnits?: number;
    onhandUnits?: number;
    stockStatus?: string;
  };
  inventoryInsights?: {
    salesForecastWeek1to4?: number;
    daysOfSupply?: string;
    outOfStockDate?: string;
    suggestedUnits?: number;
    surplusUnits?: number;
  };
}

export type InboundStatus =
  | 'PENDING_SHIPMENT_DETAILS'
  | 'AWAITING_DELIVERY'
  | 'RECEIVING_IN_PROGRESS'
  | 'CLOSED'
  | 'CANCELLED';

export interface InboundShipment {
  inboundOrderId: string;
  shipmentId: string;
  status: InboundStatus | string;
  shipToAddress: { fcName?: string; city: string; stateCode: string };
  shipmentUnits: number;
  receivedUnits: number;
  expectedDeliveryDate: string;
  trackingNo?: string[];
}

export interface Address {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  stateCode: string;
  countryCode: string;
  postalCode: string;
}

export interface InboundItem {
  sku: string;
  gtin: string;
  itemDesc: string;
  itemQty: number;
  vendorPackQty: number; // units per case
  innerPackQty: number; // units per inner pack (1 if none)
  expectedDeliveryDate: string; // ISO8601
}

const PAGE = 300;

export async function getWfsInventory(creds: WalmartCreds): Promise<WfsInventoryItem[]> {
  const items: WfsInventoryItem[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await walmartFetch<{
      headers?: { totalCount?: number };
      payload?: { inventory?: WfsInventoryItem[] };
    }>(creds, 'GET', `/v3/wfs/inventory?limit=${PAGE}&offset=${offset}`);
    const page = res.payload?.inventory ?? [];
    items.push(...page);
    if (page.length < PAGE || items.length >= (res.headers?.totalCount ?? 0)) return items;
  }
}

export async function listInboundShipments(
  creds: WalmartCreds,
  status?: InboundStatus,
): Promise<InboundShipment[]> {
  const shipments: InboundShipment[] = [];
  for (let offset = 0; ; offset += 100) {
    const query = new URLSearchParams({ limit: '100', offset: String(offset) });
    if (status) query.set('status', status);
    const res = await walmartFetch<{ headers?: { totalCount?: number }; payload?: InboundShipment[] }>(
      creds,
      'GET',
      `/v3/fulfillment/inbound-shipments?${query}`,
    );
    const page = res.payload ?? [];
    shipments.push(...page);
    if (page.length < 100 || shipments.length >= (res.headers?.totalCount ?? 0)) return shipments;
  }
}

/** Builds the Create Inbound Shipment request body (also used to show dry runs). */
export function inboundShipmentRequest(inboundOrderId: string, returnAddress: Address, items: InboundItem[]) {
  return {
    inboundOrderId,
    returnAddress,
    orderItems: items.map((i) => ({
      productId: i.gtin,
      productType: 'GTIN',
      sku: i.sku,
      itemDesc: i.itemDesc,
      itemQty: i.itemQty,
      vendorPackQty: i.vendorPackQty,
      innerPackQty: i.innerPackQty,
      expectedDeliveryDate: i.expectedDeliveryDate,
    })),
  };
}

/** Walmart splits one inbound order into shipments, one per destination fulfillment center. */
export interface CreatedShipment {
  shipmentId: string;
  shipToAddress: Address;
  shipmentItems: { vendorSku: string; itemQty: number }[];
  expectedDeliveryDate: string;
}

export async function createInboundShipment(
  creds: WalmartCreds,
  request: ReturnType<typeof inboundShipmentRequest>,
): Promise<CreatedShipment[]> {
  const res = await walmartFetch<{ payload?: CreatedShipment[] }>(creds, 'POST', '/v3/fulfillment/inbound-shipments', request);
  return res.payload ?? [];
}
