// Walmart Marketplace Orders API (v3).

import { walmartFetch, type WalmartCreds } from './auth.js';

export type OrderStatus = 'Created' | 'Acknowledged' | 'Shipped' | 'Delivered' | 'Cancelled';

export interface OrderLine {
  lineNumber: string;
  item: { productName: string; sku: string };
  orderLineQuantity: { unitOfMeasurement: string; amount: string };
}

export interface WalmartOrder {
  purchaseOrderId: string;
  customerOrderId: string;
  orderDate: number;
  shippingInfo: {
    estimatedShipDate: number;
    methodCode: string;
    postalAddress: {
      name: string;
      address1: string;
      address2?: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
  };
  orderLines: { orderLine: OrderLine[] };
}

export interface Shipment {
  lineNumber: string;
  quantity: string;
  carrier: string; // e.g. "UPS", "USPS", "FedEx"
  trackingNumber: string;
  methodCode: string; // e.g. "Standard"
  shipDateTime?: string; // ISO8601, defaults to now
}

const orderPath = (poId: string) => `/v3/orders/${encodeURIComponent(poId)}`;

export async function listOrders(
  creds: WalmartCreds,
  status: OrderStatus,
  createdStartDate?: string,
): Promise<WalmartOrder[]> {
  const orders: WalmartOrder[] = [];
  const query = new URLSearchParams({ status, limit: '200' });
  if (createdStartDate) query.set('createdStartDate', createdStartDate);
  let path: string | null = `/v3/orders?${query}`;

  while (path) {
    const res: {
      list?: { elements?: { order?: WalmartOrder[] }; meta?: { nextCursor?: string } };
    } = await walmartFetch(creds, 'GET', path);
    orders.push(...(res.list?.elements?.order ?? []));
    const cursor = res.list?.meta?.nextCursor;
    // Walmart returns nextCursor as a ready-made query string ("?limit=...&nextCursor=...").
    path = cursor ? `/v3/orders${cursor.startsWith('?') ? cursor : `?${cursor}`}` : null;
  }
  return orders;
}

export async function acknowledgeOrder(creds: WalmartCreds, poId: string): Promise<void> {
  await walmartFetch(creds, 'POST', `${orderPath(poId)}/acknowledge`);
}

export async function shipOrder(creds: WalmartCreds, poId: string, shipments: Shipment[]): Promise<void> {
  await walmartFetch(creds, 'POST', `${orderPath(poId)}/shipping`, {
    orderShipment: {
      orderLines: {
        orderLine: shipments.map((s) => ({
          lineNumber: s.lineNumber,
          orderLineStatuses: {
            orderLineStatus: [
              {
                status: 'Shipped',
                statusQuantity: { unitOfMeasurement: 'EACH', amount: s.quantity },
                trackingInfo: {
                  shipDateTime: s.shipDateTime ?? new Date().toISOString(),
                  carrierName: { carrier: s.carrier },
                  methodCode: s.methodCode,
                  trackingNumber: s.trackingNumber,
                },
              },
            ],
          },
        })),
      },
    },
  });
}

export async function cancelOrderLines(
  creds: WalmartCreds,
  poId: string,
  lines: { lineNumber: string; quantity: string }[],
): Promise<void> {
  await walmartFetch(creds, 'POST', `${orderPath(poId)}/cancel`, {
    orderCancellation: {
      orderLines: {
        orderLine: lines.map((l) => ({
          lineNumber: l.lineNumber,
          orderLineStatuses: {
            orderLineStatus: [
              {
                status: 'Cancelled',
                cancellationReason: 'CANCEL_BY_SELLER',
                statusQuantity: { unitOfMeasurement: 'EACH', amount: l.quantity },
              },
            ],
          },
        })),
      },
    },
  });
}
