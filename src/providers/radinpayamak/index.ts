/**
 * RadinPayamak — Payamak Panel platform.
 *
 * Radin Payamak's API documentation is behind a panel login, so the platform mapping is
 * **inferred, not confirmed**. `request.baseUrl` is therefore required — see
 * docs/providers/radinpayamak.md before using this in production.
 *
 * The wire protocol is implemented once in `PayamakPanelProvider`; this class only binds it to
 * this provider's catalog entry (id, capabilities, credentials, phone format).
 *
 * Research log: docs/providers/radinpayamak.md
 */

import { PayamakPanelProvider } from '../../platforms/payamak-panel/PayamakPanelProvider.js';
import type { ProviderConfig } from '../../core/Provider.js';

export class RadinPayamakProvider extends PayamakPanelProvider {
  constructor(config: ProviderConfig = {}) {
    super('radinpayamak', config);
  }
}

export default RadinPayamakProvider;
