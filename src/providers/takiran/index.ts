/**
 * TakIran — Payamak Panel platform.
 *
 * TakIran publishes no public API reference, so the platform mapping is **inferred, not
 * confirmed**. `request.baseUrl` is required.
 *
 * The wire protocol is implemented once in `PayamakPanelProvider`; this class only binds it to
 * this provider's catalog entry (id, capabilities, credentials, phone format).
 *
 * Research log: docs/providers/takiran.md
 */

import { PayamakPanelProvider } from '../../platforms/payamak-panel/PayamakPanelProvider.js';
import type { ProviderConfig } from '../../core/Provider.js';

export class TakIranProvider extends PayamakPanelProvider {
  constructor(config: ProviderConfig = {}) {
    super('takiran', config);
  }
}

export default TakIranProvider;
