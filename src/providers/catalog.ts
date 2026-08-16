/**
 * The provider catalog — the single source of truth for ids, aliases, capabilities and
 * lazy loaders.
 *
 * Why the metadata lives here rather than inside each adapter: `new SMS({ provider })` has
 * to validate the provider id and its required credentials *synchronously*, before any
 * network call, while the adapter implementation itself is loaded on demand so that
 * importing this package does not pull in twenty HTTP clients. Keeping the cheap metadata
 * in one static module and the expensive implementation behind `import()` gives both.
 *
 * Every `capabilities` value here is traceable to that provider's `docs/providers/*.md`.
 * Where a capability could not be confirmed from an official source it is `false`, never
 * optimistically `true`.
 */

import type { Capabilities } from '../core/types.js';
import type { PhoneFormat } from '../core/phone.js';
import type { BaseProvider, CredentialSpec, ProviderConfig } from '../core/Provider.js';

export type ProviderConstructor = new (config?: ProviderConfig) => BaseProvider;

/**
 * Platform a provider's API is actually implemented by.
 *
 * Several Iranian gateways are resellers running another vendor's panel software. Where
 * that is established by evidence, this package implements the platform once and configures
 * it per provider — see `docs/provider-relations.md` for the evidence behind each mapping.
 */
export type PlatformId =
  | 'ippanel-edge'
  | 'ippanel-rest-v1'
  | 'payamak-panel'
  | 'farazsms'
  | 'kavenegar'
  | 'smsir'
  | 'amoot'
  | 'mizban';

export interface CatalogEntry {
  id: string;
  name: string;
  /** Alternative identifiers accepted by the registry. */
  aliases: readonly string[];
  /** Underlying platform implementation. */
  platform: PlatformId;
  apiVersion: string;
  documentation: string;
  phoneFormat: PhoneFormat;
  capabilities: Capabilities;
  requiredCredentials: readonly CredentialSpec[];
  /** Default API base URL, when this deployment has a known fixed one. */
  defaultBaseUrl?: string;
  /**
   * `true` when the platform mapping is inferred rather than confirmed from the provider's
   * own documentation. Such providers require an explicit `request.baseUrl`.
   */
  unverified?: boolean;
  /** Loads the implementation. */
  load: () => Promise<ProviderConstructor>;
}

const caps = (overrides: Partial<Capabilities>): Capabilities => ({
  send: false,
  bulk: false,
  peerToPeer: false,
  pattern: false,
  patternManagement: false,
  scheduled: false,
  cancelScheduled: false,
  deliveryReports: false,
  outbox: false,
  inbox: false,
  balance: false,
  senders: false,
  contacts: false,
  blacklistRead: false,
  blacklistWrite: false,
  webhookManagement: false,
  webhookDelivery: false,
  voice: false,
  pricing: false,
  international: false,
  idempotentSend: false,
  ...overrides,
});

const USERNAME_PASSWORD: readonly CredentialSpec[] = [
  { key: 'username', description: 'Panel username.' },
  { key: 'password', description: 'Web-service API key (not the login password).' },
];

/* ------------------------------------------------------------------ platform capability sets */

/** IPPanel Edge — see docs/providers/ippanel.md */
const IPPANEL_EDGE_CAPS = caps({
  send: true,
  bulk: true,
  peerToPeer: true,
  pattern: true,
  patternManagement: true,
  scheduled: true,
  cancelScheduled: true,
  deliveryReports: true,
  outbox: true,
  inbox: true,
  balance: true,
  senders: true,
  contacts: true,
  blacklistRead: true,
  voice: true,
  pricing: true,
});

/**
 * IPPanel `rest/v1` generation — see docs/providers/mediana.md
 *
 * `patternManagement` is **false** deliberately: this generation documents pattern
 * *creation* (`POST /messages/patterns`) but no list, update or delete. `sms.patterns.create()`
 * still works, because the facade dispatches on the implemented method; the flag reports
 * the honest answer to "can I manage patterns through this API?".
 */
const IPPANEL_REST_V1_CAPS = caps({
  send: true,
  bulk: true,
  pattern: true,
  patternManagement: false,
  deliveryReports: true,
  inbox: true,
  balance: true,
});

/** Payamak Panel — see docs/providers/melipayamak.md */
const PAYAMAK_PANEL_CAPS = caps({
  send: true,
  bulk: true,
  peerToPeer: true,
  pattern: true,
  scheduled: true,
  deliveryReports: true,
  inbox: true,
  balance: true,
  senders: true,
  pricing: true,
});

/* ------------------------------------------------------------------ the catalog */

export const CATALOG: readonly CatalogEntry[] = [
  {
    id: 'ippanel',
    name: 'IPPanel',
    aliases: ['ip-panel', 'ippanelcom'],
    platform: 'ippanel-edge',
    apiVersion: 'edge-v1',
    documentation: 'https://docs.ippanel.com/',
    phoneFormat: 'e164',
    capabilities: IPPANEL_EDGE_CAPS,
    requiredCredentials: [
      {
        key: 'apiKey',
        env: 'IPPANEL_API_KEY',
        description: 'Access key from Developers → Access Keys.',
        oneOf: ['apiKey', 'token'],
      },
    ],
    defaultBaseUrl: 'https://edge.ippanel.com/v1',
    load: async () => (await import('./ippanel/index.js')).IPPanelProvider,
  },
  {
    id: 'farazsms',
    name: 'FarazSMS / IranPayamak',
    aliases: ['iranpayamak', 'faraz', 'faraz-sms', 'iran-payamak'],
    platform: 'farazsms',
    apiVersion: 'ws-v1',
    documentation: 'https://docs.farazsms.com/',
    phoneFormat: 'national',
    capabilities: caps({
      send: true,
      bulk: true,
      peerToPeer: true,
      pattern: true,
      patternManagement: true,
      scheduled: true,
      deliveryReports: true,
      outbox: true,
      inbox: true,
      balance: true,
      senders: true,
      contacts: true,
      voice: true,
      // `/ws/v1/sms/calculate-cost` prices a *postal-code campaign*, not an arbitrary
      // message, so it does not satisfy the generic `estimatePrice` contract. It is
      // available as `provider.native.calculateCost(...)`.
      pricing: false,
    }),
    requiredCredentials: [
      { key: 'apiKey', env: 'FARAZSMS_API_KEY', description: 'Panel key sent in the `Api-Key` header.' },
    ],
    defaultBaseUrl: 'https://api.iranpayamak.com',
    load: async () => (await import('./farazsms/index.js')).FarazSMSProvider,
  },
  {
    id: 'kavenegar',
    name: 'Kavenegar',
    aliases: ['kave', 'kavehnegar'],
    platform: 'kavenegar',
    apiVersion: 'v1',
    documentation: 'https://kavenegar.com/rest.html',
    phoneFormat: 'national',
    capabilities: caps({
      send: true,
      bulk: true,
      peerToPeer: true,
      pattern: true,
      patternManagement: true,
      scheduled: true,
      cancelScheduled: true,
      deliveryReports: true,
      outbox: true,
      inbox: true,
      balance: true,
      blacklistRead: true,
      blacklistWrite: true,
      webhookDelivery: true,
      voice: true,
      international: true,
      idempotentSend: true,
    }),
    requiredCredentials: [
      {
        key: 'apiKey',
        env: 'KAVENEGAR_API_KEY',
        description: 'API key from the panel; sent as a URL path segment.',
      },
    ],
    defaultBaseUrl: 'https://api.kavenegar.com',
    load: async () => (await import('./kavenegar/index.js')).KavenegarProvider,
  },
  {
    id: 'smsir',
    name: 'SMS.ir',
    aliases: ['sms-ir', 'sms.ir', 'ippe', 'idehpardazan'],
    platform: 'smsir',
    apiVersion: 'v1',
    documentation: 'https://sms.ir/rest-api/',
    phoneFormat: 'significant',
    capabilities: caps({
      send: true,
      bulk: true,
      peerToPeer: true,
      pattern: true,
      scheduled: true,
      cancelScheduled: true,
      deliveryReports: true,
      outbox: true,
      inbox: true,
      balance: true,
      senders: true,
    }),
    requiredCredentials: [
      { key: 'apiKey', env: 'SMSIR_API_KEY', description: 'Key sent in the `X-API-KEY` header.' },
    ],
    defaultBaseUrl: 'https://api.sms.ir',
    load: async () => (await import('./smsir/index.js')).SmsIrProvider,
  },
  {
    id: 'melipayamak',
    name: 'MeliPayamak',
    aliases: ['meli', 'meli-payamak', 'payamak-panel', 'payamakpanel'],
    platform: 'payamak-panel',
    apiVersion: 'rest',
    documentation: 'https://docs.melipayamak.com/webservice-rest',
    phoneFormat: 'national',
    capabilities: PAYAMAK_PANEL_CAPS,
    requiredCredentials: USERNAME_PASSWORD,
    defaultBaseUrl: 'https://rest.payamak-panel.com',
    load: async () => (await import('./melipayamak/index.js')).MeliPayamakProvider,
  },
  {
    id: 'mediana',
    name: 'Mediana SMS',
    aliases: ['medianasms', 'mediana-sms'],
    platform: 'ippanel-rest-v1',
    apiVersion: 'rest-v1',
    documentation: 'https://docs.mediana.ir/',
    phoneFormat: 'e164',
    capabilities: IPPANEL_REST_V1_CAPS,
    requiredCredentials: [
      {
        key: 'apiKey',
        env: 'MEDIANA_API_KEY',
        description: 'Access key sent as `Authorization: AccessKey <key>`.',
      },
    ],
    load: async () => (await import('./mediana/index.js')).MedianaProvider,
  },
  {
    id: 'amoot',
    name: 'AmootSMS',
    aliases: ['amootsms', 'amoot-sms', 'amootsoft'],
    platform: 'amoot',
    apiVersion: '1.0',
    documentation: 'https://hub.amootsoft.com/Payamak/docs/account-status',
    phoneFormat: 'national',
    capabilities: caps({
      send: true,
      bulk: true,
      peerToPeer: true,
      pattern: true,
      // `PatternCodeList` / `PatternCodeCreate` exist in the platform's action index but
      // have no documentation page and no published response schema, so they cannot be
      // mapped onto the normalized `PatternInfo` shape without guessing. They are available
      // verbatim as `provider.native.patternCodeList()` / `.patternCodeCreate(...)`.
      patternManagement: false,
      scheduled: true,
      deliveryReports: true,
      outbox: true,
      inbox: true,
      balance: true,
      senders: true,
      contacts: true,
      blacklistRead: true,
      webhookManagement: true,
      webhookDelivery: true,
      pricing: true,
    }),
    requiredCredentials: [
      {
        key: 'token',
        env: 'AMOOT_TOKEN',
        description: 'Panel token sent in the `Authorization` header.',
        oneOf: ['token', 'apiKey'],
      },
    ],
    defaultBaseUrl: 'https://portal.amootsms.com/rest',
    load: async () => (await import('./amoot/index.js')).AmootProvider,
  },
  {
    id: 'mizbansms',
    name: 'Mizban SMS',
    aliases: ['mizban', 'mizban-sms'],
    platform: 'mizban',
    apiVersion: 'v1',
    documentation: 'https://services.mizbansms.com/swagger/index.html',
    phoneFormat: 'national',
    capabilities: caps({
      send: true,
      bulk: true,
      peerToPeer: true,
      // The Swagger document declares `/api/Report/ReportSendSms` but gives it no request
      // or response schema, so it cannot be mapped onto the normalized outbox shape. It is
      // reachable as `provider.native.reports.sendSms(...)`.
      outbox: false,
      // Mizban publishes **no customer-facing template send**. `MessagePatternConfigs` are
      // line-level administrative configs behind the panel bearer token, and `SendMessage`
      // is a panel-side composer, not a variable-substitution API. Declaring `pattern: true`
      // here would mean inventing an endpoint. See docs/providers/mizbansms.md.
      pattern: false,
      scheduled: true,
      deliveryReports: true,
      inbox: true,
      balance: true,
      senders: true,
      // The contact endpoints (`/api/Feature/Contact*`) sit behind the **panel bearer
      // token**, not the customer username/password this provider is configured with, so
      // they are not part of the unified surface. Supply `credentials.token` and use
      // `provider.native.contacts.*` if your account has panel access.
      contacts: false,
    }),
    // The customer-facing `/api/Customer/*` methods authenticate with username/password in
    // the request body; the bearer token in the Swagger document is for the panel API.
    requiredCredentials: USERNAME_PASSWORD,
    defaultBaseUrl: 'https://services.mizbansms.com',
    load: async () => (await import('./mizbansms/index.js')).MizbanSmsProvider,
  },

  /* ---- confirmed Payamak Panel resellers ---- */
  {
    id: 'farapayamak',
    name: 'FaraPayamak',
    aliases: ['fara-payamak', 'fara'],
    platform: 'payamak-panel',
    apiVersion: 'rest',
    documentation: 'https://farapayamak.ir/content/webservice/',
    phoneFormat: 'national',
    capabilities: PAYAMAK_PANEL_CAPS,
    requiredCredentials: USERNAME_PASSWORD,
    defaultBaseUrl: 'https://rest.payamak-panel.com',
    load: async () => (await import('./farapayamak/index.js')).FaraPayamakProvider,
  },
  {
    id: 'shahvarpayam',
    name: 'ShahvarPayam',
    aliases: ['shahvar', 'shahvar-payam'],
    platform: 'payamak-panel',
    apiVersion: 'rest',
    documentation: 'https://shahvarpayam.ir/api/',
    phoneFormat: 'national',
    capabilities: PAYAMAK_PANEL_CAPS,
    requiredCredentials: USERNAME_PASSWORD,
    defaultBaseUrl: 'https://rest.payamak-panel.com',
    load: async () => (await import('./shahvarpayam/index.js')).ShahvarPayamProvider,
  },

  /* ---- confirmed IPPanel-platform resellers ---- */
  {
    id: 'tabansms',
    name: 'Taban SMS',
    aliases: ['taban', 'taban-sms'],
    platform: 'ippanel-rest-v1',
    apiVersion: 'rest-v1',
    documentation: 'https://tabansms.com/webservice/',
    phoneFormat: 'e164',
    capabilities: IPPANEL_REST_V1_CAPS,
    requiredCredentials: [
      { key: 'apiKey', env: 'TABANSMS_API_KEY', description: 'Access key from the Taban SMS panel.' },
    ],
    load: async () => (await import('./tabansms/index.js')).TabanSmsProvider,
  },
  {
    id: 'smsaram',
    name: 'SMS Aram',
    aliases: ['sms-aram', 'aram'],
    platform: 'ippanel-rest-v1',
    apiVersion: 'rest-v1',
    documentation: 'https://smsaram.ir/',
    phoneFormat: 'e164',
    capabilities: IPPANEL_REST_V1_CAPS,
    requiredCredentials: [
      { key: 'apiKey', env: 'SMSARAM_API_KEY', description: 'Access key from the SMS Aram panel.' },
    ],
    load: async () => (await import('./smsaram/index.js')).SmsAramProvider,
  },
  {
    id: 'yekpayamak',
    name: 'YekPayamak',
    aliases: ['yek', 'yek-payamak'],
    platform: 'ippanel-rest-v1',
    apiVersion: 'rest-v1',
    documentation: 'https://yekpayamak.com/webservice/',
    phoneFormat: 'e164',
    capabilities: IPPANEL_REST_V1_CAPS,
    requiredCredentials: [
      { key: 'apiKey', env: 'YEKPAYAMAK_API_KEY', description: 'Access key from the YekPayamak panel.' },
    ],
    load: async () => (await import('./yekpayamak/index.js')).YekPayamakProvider,
  },

  /* ---- platform inferred, not confirmed: `request.baseUrl` is required ---- */
  {
    id: 'radinpayamak',
    name: 'Radin Payamak',
    aliases: ['radin', 'radin-payamak'],
    platform: 'payamak-panel',
    apiVersion: 'rest',
    documentation: 'https://radinpayamak.ir/web-service-documentation/',
    phoneFormat: 'national',
    capabilities: PAYAMAK_PANEL_CAPS,
    requiredCredentials: USERNAME_PASSWORD,
    unverified: true,
    load: async () => (await import('./radinpayamak/index.js')).RadinPayamakProvider,
  },
  {
    id: 'saharsms',
    name: 'Sahar SMS',
    aliases: ['sahar', 'sahar-sms'],
    platform: 'payamak-panel',
    apiVersion: 'rest',
    documentation: 'https://www.saharsms.com/',
    phoneFormat: 'national',
    capabilities: PAYAMAK_PANEL_CAPS,
    requiredCredentials: USERNAME_PASSWORD,
    unverified: true,
    load: async () => (await import('./saharsms/index.js')).SaharSmsProvider,
  },
  {
    id: 'icosms',
    name: 'iCO SMS',
    aliases: ['ico', 'ico-sms', 'icosms.ir'],
    platform: 'payamak-panel',
    apiVersion: 'rest',
    documentation: 'https://icosms.ir/sms-system-guide/',
    phoneFormat: 'national',
    capabilities: PAYAMAK_PANEL_CAPS,
    requiredCredentials: USERNAME_PASSWORD,
    unverified: true,
    load: async () => (await import('./icosms/index.js')).IcoSmsProvider,
  },
  {
    id: 'takiran',
    name: 'TakIran',
    aliases: ['tak', 'tak-iran'],
    platform: 'payamak-panel',
    apiVersion: 'rest',
    documentation: 'https://takiran.ir/',
    phoneFormat: 'national',
    capabilities: PAYAMAK_PANEL_CAPS,
    requiredCredentials: USERNAME_PASSWORD,
    unverified: true,
    load: async () => (await import('./takiran/index.js')).TakIranProvider,
  },
  {
    id: 'pishgamsms',
    name: 'Pishgam SMS (Pishgam Rayan)',
    aliases: ['pishgam', 'pishgam-sms', 'pishgamrayan'],
    platform: 'payamak-panel',
    apiVersion: 'rest',
    documentation: 'https://www.pishgamrayan.com/fa/sms-web',
    phoneFormat: 'national',
    capabilities: PAYAMAK_PANEL_CAPS,
    requiredCredentials: USERNAME_PASSWORD,
    unverified: true,
    load: async () => (await import('./pishgamsms/index.js')).PishgamSmsProvider,
  },
  {
    id: 'afrasms',
    name: 'AfraSMS',
    aliases: ['afra', 'afra-sms'],
    platform: 'payamak-panel',
    apiVersion: 'rest',
    documentation: 'https://afrasms.com/',
    phoneFormat: 'national',
    capabilities: PAYAMAK_PANEL_CAPS,
    requiredCredentials: USERNAME_PASSWORD,
    unverified: true,
    load: async () => (await import('./afrasms/index.js')).AfraSmsProvider,
  },
  {
    id: 'ganjesms',
    name: 'GanjeSMS',
    aliases: ['ganje', 'ganj', 'ganje-sms'],
    platform: 'payamak-panel',
    apiVersion: 'rest',
    documentation: 'https://ganjesms.com/',
    phoneFormat: 'national',
    capabilities: PAYAMAK_PANEL_CAPS,
    requiredCredentials: USERNAME_PASSWORD,
    unverified: true,
    load: async () => (await import('./ganjesms/index.js')).GanjeSmsProvider,
  },
];

/** id → entry, including aliases. Built once. */
const INDEX: ReadonlyMap<string, CatalogEntry> = (() => {
  const map = new Map<string, CatalogEntry>();
  for (const entry of CATALOG) {
    map.set(entry.id, entry);
    for (const alias of entry.aliases) map.set(alias, entry);
  }
  return map;
})();

/** Normalize a user-supplied identifier: case, spaces, dots and underscores are ignored. */
export function normalizeProviderId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_.]/g, '');
}

export function findCatalogEntry(id: string): CatalogEntry | undefined {
  const raw = id.trim().toLowerCase();
  const direct = INDEX.get(raw);
  if (direct) return direct;

  const normalized = normalizeProviderId(id);
  for (const [key, entry] of INDEX) {
    if (normalizeProviderId(key) === normalized) return entry;
  }
  return undefined;
}

/** Canonical provider ids, sorted. */
export function catalogIds(): string[] {
  return CATALOG.map((entry) => entry.id).sort();
}
