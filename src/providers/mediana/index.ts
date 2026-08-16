/**
 * Mediana — IPPanel rest/v1 platform.
 *
 * Mediana publishes official SDKs under github.com/medianasms whose layout and error taxonomy
 * are the IPPanel `rest/v1` generation. The SDK's hard-coded host (`rest.medianasms.com`) no
 * longer resolves, so `request.baseUrl` must point at your account's current endpoint.
 *
 * The wire protocol is implemented once in `IPPanelRestV1Provider`; this class only binds it to
 * this provider's catalog entry (id, capabilities, credentials, phone format).
 *
 * Research log: docs/providers/mediana.md
 */

import { IPPanelRestV1Provider } from '../../platforms/ippanel-rest-v1/IPPanelRestV1Provider.js';
import type { ProviderConfig } from '../../core/Provider.js';

export class MedianaProvider extends IPPanelRestV1Provider {
  constructor(config: ProviderConfig = {}) {
    super('mediana', config);
  }
}

export default MedianaProvider;
