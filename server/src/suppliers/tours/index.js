import { config } from '../../config.js';
import * as simulated from './simulated.js';
import * as viator from './viator.js';

// Select the active tours supplier from configuration. Each supplier exposes the
// same surface: search(), priceTour(), book(), cancel() and a name.
const suppliers = { simulated, viator };

export const tourSupplier = suppliers[config.tourSupplier];

if (!tourSupplier) {
  throw new Error(`Unknown TOUR_SUPPLIER "${config.tourSupplier}" (expected: ${Object.keys(suppliers).join(', ')})`);
}
