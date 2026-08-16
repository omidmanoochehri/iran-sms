/**
 * GanjeSms — Payamak Panel platform.
 *
 * GanjeSMS's domain did not resolve during research (NXDOMAIN from multiple resolvers), so no
 * API reference could be read. The platform mapping is **inferred, not confirmed**;
 * `request.baseUrl` is required.
 *
 * The wire protocol is implemented once in `PayamakPanelProvider`; this class only binds it to
 * this provider's catalog entry (id, capabilities, credentials, phone format).
 *
 * Research log: docs/providers/ganjesms.md
 */

import { PayamakPanelProvider } from '../../platforms/payamak-panel/PayamakPanelProvider.js';
import type { ProviderConfig } from '../../core/Provider.js';

export class GanjeSmsProvider extends PayamakPanelProvider {
  constructor(config: ProviderConfig = {}) {
    super('ganjesms', config);
  }
}

export default GanjeSmsProvider;
