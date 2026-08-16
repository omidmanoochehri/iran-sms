/**
 * PishgamSms — Payamak Panel platform.
 *
 * Pishgam Rayan operates SMS short-code 50003, but its SMS API reference is not public — the
 * published `clouddocs` site covers its cloud-infrastructure products only. The platform
 * mapping is **inferred, not confirmed**; `request.baseUrl` is required.
 *
 * The wire protocol is implemented once in `PayamakPanelProvider`; this class only binds it to
 * this provider's catalog entry (id, capabilities, credentials, phone format).
 *
 * Research log: docs/providers/pishgamsms.md
 */

import { PayamakPanelProvider } from '../../platforms/payamak-panel/PayamakPanelProvider.js';
import type { ProviderConfig } from '../../core/Provider.js';

export class PishgamSmsProvider extends PayamakPanelProvider {
  constructor(config: ProviderConfig = {}) {
    super('pishgamsms', config);
  }
}

export default PishgamSmsProvider;
