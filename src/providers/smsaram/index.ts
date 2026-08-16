/**
 * SmsAram — IPPanel rest/v1 platform.
 *
 * SMS Aram runs IPPanel software per the Elementor SMS plugin's published "IPPanel source"
 * list. Its own site was returning a PHP loader error during research, so the API host could
 * not be read from it — supply `request.baseUrl` from your panel.
 *
 * The wire protocol is implemented once in `IPPanelRestV1Provider`; this class only binds it to
 * this provider's catalog entry (id, capabilities, credentials, phone format).
 *
 * Research log: docs/providers/smsaram.md
 */

import { IPPanelRestV1Provider } from '../../platforms/ippanel-rest-v1/IPPanelRestV1Provider.js';
import type { ProviderConfig } from '../../core/Provider.js';

export class SmsAramProvider extends IPPanelRestV1Provider {
  constructor(config: ProviderConfig = {}) {
    super('smsaram', config);
  }
}

export default SmsAramProvider;
