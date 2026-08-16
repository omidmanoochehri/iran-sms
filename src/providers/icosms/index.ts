/**
 * IcoSms — Payamak Panel platform.
 *
 * iCO SMS publishes no public API reference, so the platform mapping is **inferred, not
 * confirmed**. `request.baseUrl` is required.
 *
 * The wire protocol is implemented once in `PayamakPanelProvider`; this class only binds it to
 * this provider's catalog entry (id, capabilities, credentials, phone format).
 *
 * Research log: docs/providers/icosms.md
 */

import { PayamakPanelProvider } from '../../platforms/payamak-panel/PayamakPanelProvider.js';
import type { ProviderConfig } from '../../core/Provider.js';

export class IcoSmsProvider extends PayamakPanelProvider {
  constructor(config: ProviderConfig = {}) {
    super('icosms', config);
  }
}

export default IcoSmsProvider;
