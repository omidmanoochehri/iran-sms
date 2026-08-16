/**
 * FaraPayamak — Payamak Panel platform.
 *
 * FaraPayamak runs the Payamak Panel software. Confirmed by its own web-service page, which
 * documents the same REST/SOAP method set, and by the Elementor SMS plugin's published
 * "Payamak Panel source" list. See docs/provider-relations.md.
 *
 * The wire protocol is implemented once in `PayamakPanelProvider`; this class only binds it to
 * this provider's catalog entry (id, capabilities, credentials, phone format).
 *
 * Research log: docs/providers/farapayamak.md
 */

import { PayamakPanelProvider } from '../../platforms/payamak-panel/PayamakPanelProvider.js';
import type { ProviderConfig } from '../../core/Provider.js';

export class FaraPayamakProvider extends PayamakPanelProvider {
  constructor(config: ProviderConfig = {}) {
    super('farapayamak', config);
  }
}

export default FaraPayamakProvider;
