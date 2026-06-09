import { config } from '../config.js';
import * as simulated from './simulated.js';
import * as ngenius from './ngenius.js';

// Select the active payment gateway from configuration. Every gateway exposes
// the same small surface: newRef(), createSession(), and a name.
const gateways = { simulated, ngenius };

export const gateway = gateways[config.paymentProvider];

if (!gateway) {
  throw new Error(`Unknown PAYMENT_PROVIDER "${config.paymentProvider}" (expected: ${Object.keys(gateways).join(', ')})`);
}
