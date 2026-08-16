/**
 * Resolves provider identifiers to adapter classes, and lets applications register their
 * own adapters without forking the package.
 */

import { SMSConfigurationError } from './errors.js';
import {
  CATALOG,
  catalogIds,
  findCatalogEntry,
  type CatalogEntry,
  type ProviderConstructor,
} from '../providers/catalog.js';

const customProviders = new Map<string, ProviderConstructor>();
const loaded = new Map<string, ProviderConstructor>();

export const ProviderRegistry = {
  /** Canonical ids of every built-in provider. */
  list(): string[] {
    return catalogIds();
  },

  /** Full catalog entries, including aliases and capabilities. */
  entries(): readonly CatalogEntry[] {
    return CATALOG;
  },

  /** True when `id` names a built-in or custom provider (aliases included). */
  has(id: string): boolean {
    return customProviders.has(id.trim().toLowerCase()) || findCatalogEntry(id) !== undefined;
  },

  /** Catalog metadata for `id`, or `undefined`. */
  describe(id: string): CatalogEntry | undefined {
    return findCatalogEntry(id);
  },

  /**
   * Catalog metadata for `id`, throwing a helpful error when unknown.
   *
   * Used by {@link SMS} at construction time so an unknown provider fails immediately with
   * the list of valid ids rather than at the first send.
   */
  require(id: string): CatalogEntry {
    const entry = findCatalogEntry(id);
    if (!entry) {
      throw new SMSConfigurationError(
        `Unknown provider "${id}". Available providers: ${catalogIds().join(', ')}.`,
        { code: 'unknown_provider' },
      );
    }
    return entry;
  },

  /**
   * Register a custom adapter, or override a built-in one.
   *
   * Useful for white-label deployments this package does not ship, and for injecting a
   * stub in tests without network mocking.
   */
  register(id: string, ctor: ProviderConstructor): void {
    customProviders.set(id.trim().toLowerCase(), ctor);
  },

  /** Remove a previously registered custom adapter. */
  unregister(id: string): boolean {
    return customProviders.delete(id.trim().toLowerCase());
  },

  /** Load (and memoise) the adapter class for `id`. */
  async load(id: string): Promise<ProviderConstructor> {
    const key = id.trim().toLowerCase();

    const custom = customProviders.get(key);
    if (custom) return custom;

    const entry = ProviderRegistry.require(id);
    const cached = loaded.get(entry.id);
    if (cached) return cached;

    const ctor = await entry.load();
    loaded.set(entry.id, ctor);
    return ctor;
  },
};
