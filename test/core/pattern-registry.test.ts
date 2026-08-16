import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { orderVariables, PatternRegistry, renderPatternBody, SMSPatternError } from '../imports.ts';

const registry = new PatternRegistry({
  login: {
    ippanel: 'fg88js0v32',
    farazsms: 'abCD1289',
    smsir: 187543,
    melipayamak: { code: 94651, body: 'Your code is %code%' },
    kavenegar: 'login',
    amoot: { code: 4021, variableOrder: ['name', 'code'] },
  },
  welcome: { ippanel: 'abc123' },
});

describe('PatternRegistry', () => {
  it('resolves a logical name per provider', () => {
    assert.equal(registry.resolve('login', 'ippanel').code, 'fg88js0v32');
    assert.equal(registry.resolve('login', 'smsir').code, '187543');
    assert.equal(registry.resolve('login', 'kavenegar').code, 'login');
  });

  it('preserves the numeric type of the original code', () => {
    assert.equal(registry.resolve('login', 'smsir').rawCode, 187543);
    assert.equal(typeof registry.resolve('login', 'smsir').rawCode, 'number');
  });

  it('exposes variableOrder and body from an object binding', () => {
    const amoot = registry.resolve('login', 'amoot');
    assert.deepEqual(amoot.variableOrder, ['name', 'code']);

    const meli = registry.resolve('login', 'melipayamak');
    assert.equal(meli.body, 'Your code is %code%');
    assert.equal(meli.code, '94651');
  });

  it('passes an unregistered value straight through', () => {
    const resolved = registry.resolve('raw-provider-code', 'ippanel');
    assert.equal(resolved.code, 'raw-provider-code');
    assert.equal(resolved.passthrough, true);
  });

  it('passes numbers through without consulting the registry', () => {
    assert.equal(registry.resolve(999, 'ippanel').passthrough, true);
  });

  it('names the providers that are configured when one is missing', () => {
    assert.throws(
      () => registry.resolve('welcome', 'kavenegar'),
      (error: unknown) => {
        assert.ok(error instanceof SMSPatternError);
        assert.match(error.message, /no code configured for provider "kavenegar"/);
        assert.match(error.message, /ippanel/);
        return true;
      },
    );
  });

  it('lists registered names', () => {
    assert.deepEqual(registry.names().sort(), ['login', 'welcome']);
    assert.equal(registry.has('login'), true);
    assert.equal(registry.has('nope'), false);
  });
});

describe('orderVariables', () => {
  const context = { provider: 'amoot', pattern: 'login' };

  it('orders by the configured variableOrder', () => {
    assert.deepEqual(orderVariables({ code: '1234', name: 'Omid' }, ['name', 'code'], context), [
      'Omid',
      '1234',
    ]);
  });

  it('passes a single variable through without an order', () => {
    assert.deepEqual(orderVariables({ code: '1234' }, undefined, context), ['1234']);
  });

  it('handles zero variables', () => {
    assert.deepEqual(orderVariables({}, undefined, context), []);
  });

  it('refuses to guess the order for several variables', () => {
    assert.throws(
      () => orderVariables({ code: '1', name: 'x' }, undefined, context),
      (error: unknown) => {
        assert.ok(error instanceof SMSPatternError);
        assert.match(error.message, /positionally/);
        assert.match(error.message, /variableOrder/);
        return true;
      },
    );
  });

  it('reports a variable named in the order but not supplied', () => {
    assert.throws(
      () => orderVariables({ code: '1' }, ['name', 'code'], context),
      (error: unknown) => {
        assert.ok(error instanceof SMSPatternError);
        assert.match(error.message, /variable "name"/);
        return true;
      },
    );
  });
});

describe('renderPatternBody', () => {
  it('substitutes %name% placeholders', () => {
    assert.equal(renderPatternBody('code: %code%', { code: '1234' }), 'code: 1234');
  });

  it('supports {name}, {{name}} and #name# delimiters', () => {
    assert.equal(renderPatternBody('a {x} b {{y}} c #z#', { x: 1, y: 2, z: 3 }), 'a 1 b 2 c 3');
  });

  it('leaves unknown placeholders untouched rather than blanking them', () => {
    assert.equal(renderPatternBody('%a% %b%', { a: '1' }), '1 %b%');
  });
});
