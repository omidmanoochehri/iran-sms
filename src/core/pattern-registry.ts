/**
 * Logical pattern names → per-provider codes.
 *
 * The point is that application code says `pattern: 'login'` and never learns that IPPanel
 * calls it `fg88js0v32` while SMS.ir calls it `187543`. Switching provider then becomes a
 * config change rather than a code change.
 */

import { SMSPatternError } from './errors.js';
import type { PatternBinding, PatternRegistryConfig } from './types.js';

export interface ResolvedPattern {
  /** The code to send, as a string. */
  code: string;
  /** Original code, preserving numeric type for providers that require an integer. */
  rawCode: string | number;
  /** Explicit variable order, when configured. */
  variableOrder: readonly string[] | undefined;
  /** Literal template body, when configured. */
  body: string | undefined;
  /** True when the input was already a provider-native code rather than a logical name. */
  passthrough: boolean;
}

export class PatternRegistry {
  private readonly patterns: PatternRegistryConfig;

  constructor(patterns: PatternRegistryConfig = {}) {
    this.patterns = patterns;
  }

  /** Logical names known to the registry. */
  names(): string[] {
    return Object.keys(this.patterns);
  }

  /** True when `name` is a registered logical pattern. */
  has(name: string): boolean {
    return Object.hasOwn(this.patterns, name);
  }

  /**
   * Resolve `pattern` for `providerId`.
   *
   * A value that is not a registered logical name is passed through untouched, so raw
   * provider codes keep working without any registry configuration at all.
   */
  resolve(pattern: string | number, providerId: string): ResolvedPattern {
    if (typeof pattern === 'number' || !this.has(String(pattern))) {
      return {
        code: String(pattern),
        rawCode: pattern,
        variableOrder: undefined,
        body: undefined,
        passthrough: true,
      };
    }

    const name = String(pattern);
    const byProvider = this.patterns[name] ?? {};
    const entry = byProvider[providerId];

    if (entry === undefined || entry === null || entry === '') {
      const configured = Object.keys(byProvider);
      throw new SMSPatternError(
        `Pattern "${name}" has no code configured for provider "${providerId}".` +
          (configured.length
            ? ` It is configured for: ${configured.join(', ')}.`
            : ' No providers are configured for this pattern.'),
        { provider: providerId, code: 'pattern_not_registered' },
      );
    }

    if (typeof entry === 'object') {
      const binding = entry as PatternBinding;
      return {
        code: String(binding.code),
        rawCode: binding.code,
        variableOrder: binding.variableOrder,
        body: binding.body,
        passthrough: false,
      };
    }

    return {
      code: String(entry),
      rawCode: entry,
      variableOrder: undefined,
      body: undefined,
      passthrough: false,
    };
  }
}

/**
 * Flatten named variables into positional order.
 *
 * Used by providers that take values by position with no names on the wire (AmootSMS's
 * `PatternValues`, Kavenegar's `token`/`token2`/…). When no order is configured and there
 * is more than one variable, this throws instead of guessing: object key order is an
 * implementation detail of the caller's code, and getting it wrong sends a real person the
 * wrong values with no error anywhere.
 */
export function orderVariables(
  variables: Record<string, string | number>,
  order: readonly string[] | undefined,
  context: { provider: string; pattern: string },
): string[] {
  const keys = Object.keys(variables);

  if (order && order.length > 0) {
    return order.map((key) => {
      const value = variables[key];
      if (value === undefined) {
        throw new SMSPatternError(
          `Pattern "${context.pattern}" expects variable "${key}" but it was not supplied.`,
          { provider: context.provider, code: 'pattern_variable_missing' },
        );
      }
      return String(value);
    });
  }

  if (keys.length <= 1) return keys.map((key) => String(variables[key]));

  throw new SMSPatternError(
    `Provider "${context.provider}" sends pattern variables positionally, but pattern ` +
      `"${context.pattern}" has ${keys.length} variables and no \`variableOrder\` configured. ` +
      `Add one to the pattern registry, e.g. ` +
      `patterns: { "${context.pattern}": { "${context.provider}": { code: "…", variableOrder: [${keys
        .map((k) => `"${k}"`)
        .join(', ')}] } } }`,
    { provider: context.provider, code: 'pattern_order_required' },
  );
}

/**
 * Render a template body by substituting `%name%`-style placeholders.
 *
 * Needed by MeliPayamak, whose template send requires the fully rendered text rather than
 * a variable map. Supports `%name%`, `{name}`, `{{name}}` and `#name#` delimiters.
 */
export function renderPatternBody(body: string, variables: Record<string, string | number>): string {
  return body.replace(
    /%(\w+)%|\{\{(\w+)\}\}|\{(\w+)\}|#(\w+)#/g,
    (match, a: string, b: string, c: string, d: string) => {
      const key = a ?? b ?? c ?? d;
      const value = variables[key];
      return value === undefined ? match : String(value);
    },
  );
}
