/**
 * TabanSms — IPPanel rest/v1 platform.
 *
 * Taban SMS runs IPPanel software: its own web-service page links directly to
 * `docs.ippanel.com` and to IPPanel's sample-code downloads. See docs/provider-relations.md.
 *
 * The wire protocol is implemented once in `IPPanelRestV1Provider`; this class only binds it to
 * this provider's catalog entry (id, capabilities, credentials, phone format).
 *
 * Research log: docs/providers/tabansms.md
 */

import { IPPanelRestV1Provider } from '../../platforms/ippanel-rest-v1/IPPanelRestV1Provider.js';
import type { ProviderConfig } from '../../core/Provider.js';

export class TabanSmsProvider extends IPPanelRestV1Provider {
  constructor(config: ProviderConfig = {}) {
    super('tabansms', config);
  }
}

export default TabanSmsProvider;
