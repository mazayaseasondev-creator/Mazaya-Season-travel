import { config } from '../../config.js';
import * as simulated from './simulated.js';
import * as hotelbeds from './hotelbeds.js';

// Select the active hotel supplier from configuration. Each supplier exposes the
// same surface: search(), priceRate(), book(), cancel() and a name.
const suppliers = { simulated, hotelbeds };

export const hotelSupplier = suppliers[config.hotelSupplier];

if (!hotelSupplier) {
  throw new Error(`Unknown HOTEL_SUPPLIER "${config.hotelSupplier}" (expected: ${Object.keys(suppliers).join(', ')})`);
}
