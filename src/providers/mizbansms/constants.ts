/**
 * Mizban SMS constants.
 * Source: https://services.mizbansms.com/swagger/v1/swagger.json — verified 2026-08-16.
 * Research log: docs/providers/mizbansms.md
 */

/**
 * The Swagger document declares `http://services.mizbansms.com`. This package defaults to
 * **https** — the customer methods carry the account password in the request body, and the
 * host does serve TLS. Override with `request.baseUrl` if your deployment differs.
 */
export const BASE_URL = 'https://services.mizbansms.com';

/**
 * `usertype` discriminates account classes. The Swagger document does not enumerate the
 * values, so `1` is used as the default and can be overridden with `credentials.usertype`.
 */
export const DEFAULT_USER_TYPE = 1;

/** Customer-facing paths mapped onto the unified API. */
export const CUSTOMER_ENDPOINTS = {
  sendSMS: '/api/Customer/SendSMS',
  sendSMS2: '/api/Customer/SendSMS2',
  sendSMS3: '/api/Customer/SendSMS3',
  sendSMSFuture: '/api/Customer/SendSMSFuture',
  smartSendSMS: '/api/Customer/SmartSendSMS',
  credits: '/api/Customer/Credites',
  smsNumbers: '/api/Customer/SMSNumbers',
  smsCounter: '/api/Customer/SmsCounter',
  getDeliveryCode: '/api/Customer/GetDeliveryCode',
  getArrayDeliveryCode: '/api/Customer/GetArrayDeliveryCode',
  recieveMessageArray: '/api/Customer/RecieveMessageArray',
  getOtpUser: '/api/Customer/GetOtpUser',
  verifyOtpUser: '/api/Customer/VerifyOtpUser',
} as const;
