/**
 * Test Plan Section 5: quest.scope
 * Tests for hierarchical scope variables with lifetime guarantees
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { ScriptEngine } from '../src/ScriptEngine.js';
import type { ExecutionContext, ScriptType } from '@apiquest/types';
import { FakeJar, mockProtocolPlugin } from './test-helpers.js';

describe('Section 5: quest.scope', () => {
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
      environment: {
        name: 'Test',
        variables: {}
      },
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
  // Section 5.1: API surface
  // ========================================================================
  
  describe('5.1 API surface', () => {
    test('get(key) returns value when set', async () => {
      context.scopeStack = [{ level: 'request', id: 'test', vars: { tempToken: 'xyz123' } }];
      
      const script = `
        quest.test('Get returns value', () => {
          expect(quest.scope.variables.get('tempToken')).to.equal('xyz123');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('get(key) returns null when missing', async () => {
      context.scopeStack = [{ level: 'request', id: 'test', vars: {} }];
      
      const script = `
        quest.test('Get returns null for missing', () => {
          expect(quest.scope.variables.get('missing')).to.be.null;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('set(key, value) sets variable', async () => {
      context.scopeStack = [{ level: 'request', id: 'test', vars: {} }];
      
      const script = `
        quest.scope.variables.set('tempData', 'value123');
        
        quest.test('Set works', () => {
          expect(quest.scope.variables.get('tempData')).to.equal('value123');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
      
      // Verify it was actually set in context
      expect(context.scopeStack[0].vars['tempData']).toBe('value123');
    });

    test('set(key, value) overwrites prior value', async () => {
      context.scopeStack = [{ level: 'request', id: 'test', vars: { key1: 'oldValue' } }];
      
      const script = `
        quest.scope.variables.set('key1', 'newValue');
        
        quest.test('Set overwrites', () => {
          expect(quest.scope.variables.get('key1')).to.equal('newValue');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('has(key) returns true/false', async () => {
      context.scopeStack = [{ level: 'request', id: 'test', vars: { exists: 'value' } }];
      
      const script = `
        quest.test('Has works correctly', () => {
          expect(quest.scope.variables.has('exists')).to.be.true;
          expect(quest.scope.variables.has('missing')).to.be.false;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('remove(key) removes variable', async () => {
      context.scopeStack = [{ level: 'request', id: 'test', vars: { toRemove: 'value', toKeep: 'value2' } }];
      
      const script = `
        const removed = quest.scope.variables.remove('toRemove');
        
        quest.test('Remove works', () => {
          expect(removed).to.be.true;
          expect(quest.scope.variables.has('toRemove')).to.be.false;
          expect(quest.scope.variables.has('toKeep')).to.be.true;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('remove(key) returns false for missing key', async () => {
      context.scopeStack = [{ level: 'request', id: 'test', vars: {} }];
      
      const script = `
        const removed = quest.scope.variables.remove('nonExistent');
        
        quest.test('Remove returns false for missing', () => {
          expect(removed).to.be.false;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('clear() removes all variables', async () => {
      context.scopeStack = [{ level: 'request', id: 'test', vars: { key1: 'value1', key2: 'value2', key3: 'value3' } }];
      
      const script = `
        quest.scope.variables.clear();
        
        quest.test('Clear removes all', () => {
          expect(quest.scope.variables.has('key1')).to.be.false;
          expect(quest.scope.variables.has('key2')).to.be.false;
          expect(quest.scope.variables.has('key3')).to.be.false;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
      
      // Verify context is cleared
      expect(Object.keys(context.scopeStack[0].vars).length).toBe(0);
    });

    test('toObject() returns snapshot of all variables', async () => {
      context.scopeStack = [{ level: 'request', id: 'test', vars: { key1: 'value1', key2: 'value2' } }];
      
      const script = `
        const vars = quest.scope.variables.toObject();
        
        quest.test('ToObject returns all', () => {
          expect(vars).to.have.property('key1');
          expect(vars).to.have.property('key2');
          expect(vars.key1).to.equal('value1');
          expect(vars.key2).to.equal('value2');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 5.2: Lifetime guarantees
  // ========================================================================
  
  describe('5.2 Lifetime guarantees', () => {
    test('Scope variables set in preRequest are visible in postRequest', async () => {
      context.scopeStack = [{ level: 'request', id: 'test', vars: {} }];
      
      // Simulate preRequest setting a variable
      const preScript = `
        quest.scope.variables.set('requestId', 'req-12345');
        quest.scope.variables.set('timestamp', '2026-01-06');
      `;
      
      await engine.execute(preScript, context, 'request-pre' as ScriptType, () => { });
      
      // Verify they're accessible in postRequest (same context)
      const postScript = `
        quest.test('PreRequest variables visible in postRequest', () => {
          expect(quest.scope.variables.get('requestId')).to.equal('req-12345');
          expect(quest.scope.variables.get('timestamp')).to.equal('2026-01-06');
        });
      `;
      
      const result = await engine.execute(postScript, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Scope variables are isolated between requests (different contexts)', async () => {
      // Request A context
      const contextA: ExecutionContext = {
        ...context,
        scopeStack: [{ level: 'request', id: 'testA', vars: {} }]
      };
      
      const scriptA = `
        quest.scope.variables.set('requestSpecific', 'valueA');
      `;
      
      await engine.execute(scriptA, contextA, 'request-pre' as ScriptType, () => { });
      expect(contextA.scopeStack[0].vars['requestSpecific']).toBe('valueA');
      
      // Request B context (separate request)
      const contextB: ExecutionContext = {
        ...context,
        scopeStack: [{ level: 'request', id: 'testB', vars: {} }]
      };
      
      const scriptB = `
        quest.test('Request B does not see Request A variables', () => {
          expect(quest.scope.variables.get('requestSpecific')).to.be.null;
        });
      `;
      
      const result = await engine.execute(scriptB, contextB, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Scope variables cleared between requests (runner responsibility)', async () => {
      // This tests that each request gets a fresh scope
      // In practice, the runner creates new context per request
      
      const request1Context: ExecutionContext = {
        ...context,
        scopeStack: [{ level: 'request', id: 'req1', vars: {} }]
      };
      
      await engine.execute(`
        quest.scope.variables.set('temp', 'value1');
      `, request1Context, 'request-post' as ScriptType, () => { });
      
      // Request 2 gets fresh context (runner creates this)
      const request2Context: ExecutionContext = {
        ...context,
        scopeStack: [{ level: 'request', id: 'req2', vars: {} }]  // Fresh scope
      };
      
      const result = await engine.execute(`
        quest.test('Scope vars cleared for new request', () => {
          expect(quest.scope.variables.get('temp')).to.be.null;
        });
      `, request2Context, 'request-post' as ScriptType, () => { });
      
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Scope variables persisted when script fails (but execution stops)', async () => {
      context.scopeStack = [{ level: 'request', id: 'test', vars: {} }];
      
      // Set variable before error
      const preScript = `
        quest.scope.variables.set('setBeforeError', 'value');
        throw new Error('Simulated error');
      `;
      
      const result = await engine.execute(preScript, context, 'request-pre' as ScriptType, () => { });
      
      // Script should fail
      expect(result.success).toBe(false);
      expect(result.error).toContain('Simulated error');
      
      // But variable should still be in context (persisted despite error)
      expect(context.scopeStack[0].vars['setBeforeError']).toBe('value');
    });
  });
});


