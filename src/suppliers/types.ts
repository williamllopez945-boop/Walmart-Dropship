// Every supplier (manual CSV, wholesaler API, ...) implements this interface.

import type { WalmartOrder } from '../walmart/orders.js';

export interface SupplierTracking {
  purchaseOrderId: string;
  lineNumber: string;
  quantity: string;
  carrier: string;
  trackingNumber: string;
}

export interface Supplier {
  name: string;
  /** Hand the order to the supplier (blind drop-ship, your business on the slip). */
  placeOrder(order: WalmartOrder): Promise<void>;
  /** Tracking numbers from the supplier that have not been uploaded to Walmart yet. */
  collectTracking(): Promise<SupplierTracking[]>;
  /** Called after collected tracking was uploaded, so it is never sent twice. */
  markTrackingUploaded(): Promise<void>;
}
