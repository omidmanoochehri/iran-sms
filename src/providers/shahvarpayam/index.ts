/**
 * ShahvarPayam — Payamak Panel platform.
 *
 * ShahvarPayam runs the Payamak Panel software. Its API page publishes the Payamak Panel
 * client signature verbatim — `new RestClient(username, password).Send(to, from, text, isFlash)`.
 * See docs/provider-relations.md.
 *
 * The wire protocol is implemented once in `PayamakPanelProvider`; this class only binds it to
 * this provider's catalog entry (id, capabilities, credentials, phone format).
 *
 * Research log: docs/providers/shahvarpayam.md
 */

import { PayamakPanelProvider } from '../../platforms/payamak-panel/PayamakPanelProvider.js';
import type { ProviderConfig } from '../../core/Provider.js';

export class ShahvarPayamProvider extends PayamakPanelProvider {
  constructor(config: ProviderConfig = {}) {
    super('shahvarpayam', config);
  }
}

export default ShahvarPayamProvider;
