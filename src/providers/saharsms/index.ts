/**
 * SaharSms — Payamak Panel platform.
 *
 * Sahar SMS publishes no public API documentation (its `/info/webservice` page returns 404),
 * so the platform mapping is **inferred, not confirmed**. `request.baseUrl` is required.
 *
 * The wire protocol is implemented once in `PayamakPanelProvider`; this class only binds it to
 * this provider's catalog entry (id, capabilities, credentials, phone format).
 *
 * Research log: docs/providers/saharsms.md
 */

import { PayamakPanelProvider } from '../../platforms/payamak-panel/PayamakPanelProvider.js';
import type { ProviderConfig } from '../../core/Provider.js';

export class SaharSmsProvider extends PayamakPanelProvider {
  constructor(config: ProviderConfig = {}) {
    super('saharsms', config);
  }
}

export default SaharSmsProvider;
