/**
 * YekPayamak — IPPanel rest/v1 platform.
 *
 * YekPayamak runs IPPanel software per the Elementor SMS plugin's published "IPPanel source"
 * list. Its domain was intermittently unresolvable during research (SERVFAIL), so the API
 * host could not be confirmed — supply `request.baseUrl` from your panel.
 *
 * The wire protocol is implemented once in `IPPanelRestV1Provider`; this class only binds it to
 * this provider's catalog entry (id, capabilities, credentials, phone format).
 *
 * Research log: docs/providers/yekpayamak.md
 */

import { IPPanelRestV1Provider } from '../../platforms/ippanel-rest-v1/IPPanelRestV1Provider.js';
import type { ProviderConfig } from '../../core/Provider.js';

export class YekPayamakProvider extends IPPanelRestV1Provider {
  constructor(config: ProviderConfig = {}) {
    super('yekpayamak', config);
  }
}

export default YekPayamakProvider;
