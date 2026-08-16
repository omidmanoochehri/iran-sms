/**
 * IPPanel Edge API constants.
 *
 * Source: https://docs.ippanel.com/ (built from github.com/ippanelcom/Edge-Document).
 * Verified 2026-08-16. See docs/providers/ippanel.md.
 */

import type { MessageStatus } from '../../core/types.js';

export const EDGE_BASE_URL = 'https://edge.ippanel.com/v1';

/** Legacy REST generation used by the official Go/PHP/Python SDKs. */
export const LEGACY_BASE_URL = 'https://api2.ippanel.com/api/v1';

/** Every send goes to one path, discriminated by `sending_type`. */
export const SEND_PATH = '/api/send';

export const ENDPOINTS = {
  // auth
  login: '/api/acl/auth/login',
  sendSmsOtp: '/api/acl/auth/send_sms_otp',
  confirmOtp: '/api/acl/auth/confirm_otp',
  forgotPassword: '/api/acl/auth/forgot_password',
  changePasswordByToken: '/api/acl/auth/change_password_by_token',
  logout: '/api/acl/auth/logout',
  checkToken: '/api/acl/auth/check_token',

  // send
  send: SEND_PATH,
  sendUrl: '/api/send/webservice',
  cancel: '/api/send/cancel',
  calculatePrice: '/api/send/calculate-price',
  provinces: '/api/send/banks/provinces',
  counties: '/api/send/banks/counties',
  cities: '/api/send/banks/cities',
  genders: '/api/send/banks/genders',
  provincesV2: '/v2/api/send/banks/provinces',
  countiesV2: '/v2/api/send/banks/counties',
  citiesV2: '/v2/api/send/banks/cities',
  countsV2: '/v2/api/send/banks/counts',
  jobCategories: '/api/send/jobs/categories',
  jobSubCategories: '/api/send/jobs/sub-categories',
  jobNumberCount: '/api/send/jobs/number-count',

  // reports
  outboxList: '/api/report/new_list',
  outboxByBulk: '/api/report/by_bulk',
  bulkStats: '/api/report/bulk_stats',
  bulkRecipients: '/api/report/recipients',
  inbox: '/api/report/messages-inbox',

  // patterns
  patternCreate: '/api/patterns/normal',
  patternList: '/api/patterns',
  patternByCode: (code: string) => `/api/patterns/${encodeURIComponent(code)}`,
  patternUpdate: (code: string) => `/api/patterns/normal/${encodeURIComponent(code)}`,
  patternDelete: (code: string) => `/api/patterns/normal/${encodeURIComponent(code)}`,

  // numbers
  numbersList: '/api/number/numbers',
  numberAssign: '/api/numbers/assign',
  numberUnassign: '/api/numbers/unassign',

  // payment
  credit: '/api/payment/credit/mine',

  // phonebooks
  phonebookList: '/api/phonebooks/list-new',
  phonebookCreate: '/api/phonebooks',
  phonebookUpdate: (id: string) => `/api/phonebooks/${encodeURIComponent(id)}`,
  phonebookDelete: '/api/phonebooks/delete-list',
  phonebookExport: (id: string) => `/api/phonebooks/${encodeURIComponent(id)}/export`,
  phonebookImport: (id: string) => `/api/phonebooks/${encodeURIComponent(id)}/import`,
  phonebookImportSample: (id: string) => `/api/phonebooks/${encodeURIComponent(id)}/import/get-sample`,

  // phonebook contacts
  contactList: '/api/phonebooks/numbers/contact-list',
  contactShow: (id: string) => `/api/phonebooks/numbers/contact-list/${encodeURIComponent(id)}`,
  contactAdd: '/api/phonebooks/numbers/add-list-new',
  contactUpdate: (id: string) => `/api/phonebooks/numbers/update-new/${encodeURIComponent(id)}`,
  contactDelete: '/api/phonebooks/numbers/delete-list',
  contactExport: '/api/phonebooks/numbers/contact-list/export',

  // phonebook custom fields
  optionList: '/api/phonebooks/options/list-new',
  optionCreate: '/api/phonebooks/options',
  optionUpdate: (id: string) => `/api/phonebooks/options/${encodeURIComponent(id)}`,
  optionDelete: '/api/phonebooks/options/delete-list',

  // drafts
  draftGroupCreate: '/api/user/draft/group',
  draftGroupList: '/api/user/draft/group/list',
  draftGroupUpdate: '/api/user/draft/group',
  draftGroupDelete: '/api/user/draft/group/delete',
  draftCreate: '/api/user/draft',
  draftList: '/api/user/draft/list',
  draftUpdate: '/api/user/draft',
  draftDelete: '/api/user/draft/delete',

  // users (reseller)
  userCheckExist: '/api/user/check_exist',
  userCreate: '/api/user/create',
  userUpdate: '/api/user/update',
  userShow: '/api/user/show',
  userList: '/api/user/list',
  userParentsTree: '/api/user/parents_tree',
  userTariff: '/api/user/get_tariff',
  userDocuments: '/api/user/documents',
  userDocumentUpload: '/api/user/documents/upload',
  userDocumentRemove: '/api/user/documents/remove',

  // packages
  packageList: '/api/acl/package/list',

  // tickets
  ticketCreate: '/api/ticket',
  ticketList: '/api/ticket',
  ticketShow: '/api/ticket/show',
  ticketReply: '/api/ticket/interaction',
} as const;

/** `sending_type` discriminator values. */
export const SENDING_TYPES = {
  webservice: 'webservice',
  peerToPeer: 'peer_to_peer',
  peerToPeerFile: 'peer_to_peer_file',
  pattern: 'pattern',
  file: 'file',
  keyword: 'keyword',
  keywordPhonebook: 'keyword_phonebook',
  phonebook: 'phonebook',
  postalCode: 'postal_code',
  country: 'country',
  geolocation: 'geolocation',
  job: 'job',
  votp: 'votp',
} as const;

/**
 * Outbox `state_id` → normalized status.
 * Source: docs/report/outbox-report.md "Notes".
 */
export const OUTBOX_STATE: Readonly<Record<string, MessageStatus>> = {
  '0': 'queued', // being created
  '1': 'queued', // created, in monitoring queue
  '2': 'sent', // sending
  '3': 'failed', // rejected by monitoring
  '4': 'failed', // invalid recipients
  '5': 'queued', // in send queue
  '6': 'sent', // sent successfully
  '7': 'cancelled',
  '8': 'failed', // insufficient credit
  '9': 'failed', // system error
};

/**
 * Per-recipient `message_status` → normalized status.
 * Source: docs/report/bulk-recipient.md.
 */
export const RECIPIENT_STATUS: Readonly<Record<string, MessageStatus>> = {
  '0': 'sent', // sent to operator
  '1': 'sent', // operator received
  '2': 'delivered',
  '3': 'undelivered',
  '4': 'blocked', // blacklisted
};

/** Ticket `state_id` values, from docs/ticket/list-ticket.md. */
export const TICKET_STATE: Readonly<Record<string, string>> = {
  '1': 'waiting_for_response',
  '2': 'waiting_for_support',
  '3': 'answered',
  '4': 'closed',
  '5': 'forwarded',
};
