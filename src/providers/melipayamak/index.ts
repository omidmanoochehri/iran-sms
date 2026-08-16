/**
 * MeliPayamak — Payamak Panel platform.
 *
 * MeliPayamak is the platform vendor: `rest.payamak-panel.com` is its own host, and its
 * resellers connect to the same endpoint with their own credentials.
 *
 * The wire protocol is implemented once in `PayamakPanelProvider`; this class only binds it to
 * this provider's catalog entry (id, capabilities, credentials, phone format).
 *
 * Research log: docs/providers/melipayamak.md
 */

import { PayamakPanelProvider } from '../../platforms/payamak-panel/PayamakPanelProvider.js';
import type { ProviderConfig } from '../../core/Provider.js';

export class MeliPayamakProvider extends PayamakPanelProvider {
  constructor(config: ProviderConfig = {}) {
    super('melipayamak', config);
  }
}

export default MeliPayamakProvider;
