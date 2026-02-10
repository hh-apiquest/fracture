/**
 * Test Plan Section 10: quest.test/skip/fail
 * Tests for test execution, skipping, and explicit failures
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { ScriptEngine } from '../src/ScriptEngine.js';
import type { ExecutionContext, ScriptType } from '@apiquest/types';
import { FakeJar, mockProtocolPlugin } from './test-helpers.js';

describe('Section 10: quest.test/skip/fail', () => {
  let engine: ScriptEngine;
  let context: ExecutionContext;

  beforeEach(() => {
    engine = new ScriptEngine();

    context = {
      protocol: 'http',
      collectionInfo: { id: 'col-123', name: 'Test Collection' },
      iterationSource: 'none',
      scopeStack: [],
      globalVariables: {},
      collectionVariables: {},
      environment: undefined,
      iterationData: [],
      iterationCurrent: 1,
      iterationCount: 1,
      currentResponse: undefined,
      currentRequest: undefined,
      executionHistory: [],
      options: {},
      protocolPlugin: mockProtocolPlugin,
      cookieJar: FakeJar
    };
  });

  // ========================================================================
  // Section 10.1: quest.test() basic functionality
  // ========================================================================

  describe('10.1 quest.test() basic functionality', () => {
    test('Passing test is recorded', async () => {
      const script = `
        quest.test('This should pass', () => {
          expect(1 + 1).to.equal(2);
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests).toHaveLength(1);
      expect(result.tests[0]?.name).toBe('This should pass');
      expect(result.tests[0]?.passed).toBe(true);
      expect(result.tests[0]?.skipped).toBe(false);
    });

    test('Failing test is recorded with error', async () => {
      const script = `
        quest.test('This should fail', () => {
          expect(1 + 1).to.equal(3);
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true); // Script executed successfully
      expect(result.tests).toHaveLength(1);
      expect(result.tests[0]?.name).toBe('This should fail');
      expect(result.tests[0]?.passed).toBe(false);
      expect(result.tests[0]?.skipped).toBe(false);
      expect(result.tests[0]?.error).toBeDefined();
    });

    test('Multiple tests can be defined', async () => {
      const script = `
        quest.test('Test 1', () => {
          expect(true).to.be.true;
        });
        
        quest.test('Test 2', () => {
          expect(false).to.be.false;
        });
        
        quest.test('Test 3', () => {
          expect('hello').to.equal('hello');
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests).toHaveLength(3);
      expect(result.tests.every(t => t.passed)).toBe(true);
    });

    test('Tests can access quest API', async () => {
      context.globalVariables = { apiKey: 'secret123' };

      const script = `
        quest.test('Can access variables', () => {
          const key = quest.variables.get('apiKey');
          expect(key).to.equal('secret123');
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 10.2: m
  // ========================================================================

  describe('10.2 quest.skip() inside tests', () => {
    test('skip() marks test as skipped', async () => {
      const script = `
        quest.test('Conditional skip', () => {
          const shouldSkip = true;
          if (shouldSkip) {
            quest.skip('Skipping because condition is true');
          }
          expect(1).to.equal(2); // This should not run
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests).toHaveLength(1);
      expect(result.tests[0]?.passed).toBe(false);
      expect(result.tests[0]?.skipped).toBe(true);
      expect(result.tests[0]?.error).toContain('Skipping because condition is true');
    });

    test('skip() prevents remaining test code from running', async () => {
      const script = `
        let executed = false;
        quest.test('Early skip', () => {
          quest.skip('Skipping early');
          executed = true; // Should not execute
        });
        
        quest.test('Verify not executed', () => {
          expect(executed).to.be.false;
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests).toHaveLength(2);
      expect(result.tests[0]?.skipped).toBe(true);
      expect(result.tests[1]?.passed).toBe(true);
    });

    test('skip() can only be called inside quest.test()', async () => {
      const script = `
        quest.skip('This should fail');
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(false);
      expect(result.error).toContain('must be called inside quest.test()');
    });

    test('skip() with dynamic reason', async () => {
      context.currentResponse = {
        status: 404,
        statusText: 'Not Found',
        body: '',
        headers: {},
        duration: 100
      };

      const script = `
        quest.test('Skip when 404', () => {
          if (quest.response.status === 404) {
            quest.skip(\`Skipping due to status \${quest.response.status}\`);
          }
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.skipped).toBe(true);
      expect(result.tests[0]?.error).toContain('Skipping due to status 404');
    });
  });

  // ========================================================================
  // Section 10.3: quest.fail() inside tests
  // ========================================================================

  describe('10.3 quest.fail() inside tests', () => {
    test('fail() marks test as failed with custom message', async () => {
      const script = `
        quest.test('Explicit failure', () => {
          quest.fail('This is a custom failure message');
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests).toHaveLength(1);
      expect(result.tests[0]?.passed).toBe(false);
      expect(result.tests[0]?.skipped).toBe(false);
      expect(result.tests[0]?.error).toContain('This is a custom failure message');
    });

    test('fail() stops test execution', async () => {
      const script = `
        let reachedEnd = false;
        quest.test('Fail early', () => {
          quest.fail('Failing now');
          reachedEnd = true; // Should not execute
        });
        
        quest.test('Verify not executed', () => {
          expect(reachedEnd).to.be.false;
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests).toHaveLength(2);
      expect(result.tests[0]?.passed).toBe(false);
      expect(result.tests[1]?.passed).toBe(true);
    });

    test('fail() can only be called inside quest.test()', async () => {
      const script = `
        quest.fail('This should error');
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(false);
      expect(result.error).toContain('must be called inside quest.test()');
    });

    test('fail() with conditional logic', async () => {
      context.currentResponse = {
        status: 200,
        statusText: 'OK',
        body: '{"count": 0}',
        headers: {},
        duration: 100
      };

      const script = `
        quest.test('Fail if count is zero', () => {
          const data = quest.response.json();
          if (data.count === 0) {
            quest.fail('Expected count to be greater than zero, but got 0');
          }
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(false);
      expect(result.tests[0]?.error).toContain('Expected count to be greater than zero');
    });
  });

  // ========================================================================
  // Section 10.4: Test execution order and isolation
  // ========================================================================

  describe('10.4 Test execution order and isolation', () => {
    test('Tests execute in order defined', async () => {
      const script = `
        const order = [];
        
        quest.test('First', () => {
          order.push(1);
        });
        
        quest.test('Second', () => {
          order.push(2);
        });
        
        quest.test('Third', () => {
          order.push(3);
          expect(order).to.deep.equal([1, 2, 3]);
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests).toHaveLength(3);
      expect(result.tests.every(t => t.passed)).toBe(true);
    });

    test('Failed test does not stop subsequent tests', async () => {
      const script = `
        quest.test('Will fail', () => {
          expect(1).to.equal(2);
        });
        
        quest.test('Should still run', () => {
          expect(true).to.be.true;
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests).toHaveLength(2);
      expect(result.tests[0]?.passed).toBe(false);
      expect(result.tests[1]?.passed).toBe(true);
    });

    test('Skipped test does not stop subsequent tests', async () => {
      const script = `
        quest.test('Will skip', () => {
          quest.skip('Skipping this one');
        });
        
        quest.test('Should still run', () => {
          expect(true).to.be.true;
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests).toHaveLength(2);
      expect(result.tests[0]?.skipped).toBe(true);
      expect(result.tests[1]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 10.5: Test naming and organization
  // ========================================================================

  describe('10.5 Test naming and organization', () => {
    test('Test names are preserved', async () => {
      const script = `
        quest.test('Status code is 200', () => {
          expect(true).to.be.true;
        });
        
        quest.test('Response time is under 500ms', () => {
          expect(true).to.be.true;
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.name).toBe('Status code is 200');
      expect(result.tests[1]?.name).toBe('Response time is under 500ms');
    });

    test('Test names can contain special characters', async () => {
      const script = `
        quest.test('Check: user.name === "Alice"', () => {
          expect(true).to.be.true;
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.name).toBe('Check: user.name === "Alice"');
    });

    test('Duplicate test names are allowed', async () => {
      const script = `
        quest.test('Validation', () => {
          expect(1).to.equal(1);
        });
        
        quest.test('Validation', () => {
          expect(2).to.equal(2);
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests).toHaveLength(2);
      expect(result.tests[0]?.name).toBe('Validation');
      expect(result.tests[1]?.name).toBe('Validation');
      expect(result.tests.every(t => t.passed)).toBe(true);
    });
  });
});


