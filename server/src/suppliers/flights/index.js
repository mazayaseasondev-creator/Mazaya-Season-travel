import { config } from '../../config.js';
import * as simulated from './simulated.js';
import * as amadeus from './amadeus.js';

// Select the active flight supplier from configuration. Each supplier exposes
// the same surface: search(), priceOffer(), hold(), issueTicket(), cancel().
const suppliers = { simulated, amadeus };

export const flightSupplier = suppliers[config.flightSupplier];

if (!flightSupplier) {
  throw new Error(`Unknown FLIGHT_SUPPLIER "${config.flightSupplier}" (expected: ${Object.keys(suppliers).join(', ')})`);
}
