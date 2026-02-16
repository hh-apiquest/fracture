/**
 * Test Plan Section 6: quest.global
 * Tests for collection-run scoped global variables with lifetime guarantees
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { ScriptEngine } from '../src/ScriptEngine.js';
import type { ExecutionContext, ScriptType } from '@apiquest/types';
import { FakeJar, mockProtocolPlugin, buildScopeChain } from './test-helpers.js';

describe('Section 6: quest.global', () => {
  let engine: ScriptEngine;
  let context: ExecutionContext;

  beforeEach(() => {
    engine = new ScriptEngine();
    
    context = {
      protocol: 'http',
      collectionInfo: {id : 'col-123', name: 'Test Collection' },
      iterationSource : 'none',
      scope: buildScopeChain([{ level: 'collection', id: 'col-123', vars: {} }]),
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
      cookieJar: FakeJar,
      abortSignal: new AbortController().signal
    };
  });

  // ========================================================================
  // Section 6.1: API surface
  // ========================================================================
  
  describe('6.1 API surface', () => {
    test('get(key) returns value when set', async () => {
      context.globalVariables = { authToken: 'bearer-xyz' };
      
      const script = `
        quest.test('Get returns value', () => {
          expect(quest.global.variables.get('authToken')).to.equal('bearer-xyz');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('get(key) returns null when missing', async () => {
      const script = `
        quest.test('Get returns null for missing', () => {
          expect(quest.global.variables.get('missing')).to.be.null;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('set(key, value) sets variable', async () => {
      const script = `
        quest.global.variables.set('runId', 'run-12345');
        
        quest.test('Set works', () => {
          expect(quest.global.variables.get('runId')).to.equal('run-12345');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
      
      // Verify it was actually set in context
      expect(context.globalVariables['runId']).toBe('run-12345');
    });

    test('set(key, value) overwrites prior value', async () => {
      context.globalVariables = { counter: '1' };
      
      const script = `
        quest.global.variables.set('counter', '2');
        
        quest.test('Set overwrites', () => {
          expect(quest.global.variables.get('counter')).to.equal('2');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('has(key) returns true/false', async () => {
      context.globalVariables = { exists: 'value' };
      
      const script = `
        quest.test('Has works correctly', () => {
          expect(quest.global.variables.has('exists')).to.be.true;
          expect(quest.global.variables.has('missing')).to.be.false;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('remove(key) removes variable', async () => {
      context.globalVariables = { toRemove: 'value', toKeep: 'value2' };
      
      const script = `
        const removed = quest.global.variables.remove('toRemove');
        
        quest.test('Remove works', () => {
          expect(removed).to.be.true;
          expect(quest.global.variables.has('toRemove')).to.be.false;
          expect(quest.global.variables.has('toKeep')).to.be.true;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('remove(key) returns false for missing key', async () => {
      const script = `
        const removed = quest.global.variables.remove('nonExistent');
        
        quest.test('Remove returns false for missing', () => {
          expect(removed).to.be.false;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('clear() removes all variables', async () => {
      context.globalVariables = { key1: 'value1', key2: 'value2', key3: 'value3' };
      
      const script = `
        quest.global.variables.clear();
        
        quest.test('Clear removes all', () => {
          expect(quest.global.variables.has('key1')).to.be.false;
          expect(quest.global.variables.has('key2')).to.be.false;
          expect(quest.global.variables.has('key3')).to.be.false;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
      
      // Verify context is cleared
      expect(Object.keys(context.globalVariables).length).toBe(0);
    });

    test('toObject() returns snapshot of all variables', async () => {
      context.globalVariables = { key1: 'value1', key2: 'value2' };
      
      const script = `
        const vars = quest.global.variables.toObject();
        
        quest.test('ToObject returns all', () => {
          expect(vars).to.have.property('key1');
          expect(vars).to.have.property('key2');
          expect(vars.key1).to.equal('value1');
          expect(vars.key2).to.equal('value2');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 6.2: Lifetime guarantees
  // ========================================================================
  
  describe('6.2 Lifetime guarantees', () => {
    test('Global variables persist across requests in same run', async () => {
      // Request 1: Set global variable
      const request1Script = `
        quest.global.variables.set('authToken', 'token-xyz');
        quest.global.variables.set('runCounter', '1');
      `;
      
      await engine.execute(request1Script, context, 'request-post' as ScriptType, () => {});
      
      // Request 2: Same context (same run), should see globals
      const request2Script = `
        quest.test('Global persists to request 2', () => {
          expect(quest.global.variables.get('authToken')).to.equal('token-xyz');
          expect(quest.global.variables.get('runCounter')).to.equal('1');
        });
        
        // Increment counter
        quest.global.variables.set('runCounter', '2');
      `;
      
      const result = await engine.execute(request2Script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
      expect(context.globalVariables['runCounter']).toBe('2');
    });

    test('Global variables persist across iterations', async () => {
      // Iteration 1
      context.iterationCurrent = 1;
      await engine.execute(`
        quest.global.variables.set('iterationsSeen', '1');
      `, context, 'request-post' as ScriptType, () => {});
      
      // Iteration 2 (same context - globals persist)
      context.iterationCurrent = 2;
      const script = `
        const seen = quest.global.variables.get('iterationsSeen');
        quest.global.variables.set('iterationsSeen', '2');
        
        quest.test('Global persists across iterations', () => {
          expect(seen).to.equal('1');
          expect(quest.global.variables.get('iterationsSeen')).to.equal('2');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Global variables set in collectionPreScript visible to all requests', async () => {
      // Simulate collectionPreScript
      const collectionPreScript = `
        quest.global.variables.set('collectionId', 'col-abc123');
        quest.global.variables.set('startTime', '2026-01-06T17:00:00Z');
      `;
      
      await engine.execute(collectionPreScript, context, 'collection-pre' as ScriptType, () => {});
      
      // Any request can access these
      const requestScript = `
        quest.test('Globals from collectionPre accessible', () => {
          expect(quest.global.variables.get('collectionId')).to.equal('col-abc123');
          expect(quest.global.variables.get('startTime')).to.equal('2026-01-06T17:00:00Z');
        });
      `;
      
      const result = await engine.execute(requestScript, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Global variables reset between separate runs (new context)', async () => {
      // Run 1
      const run1Context: ExecutionContext = {
        ...context,
        globalVariables: {}
      };
      
      await engine.execute(`
        quest.global.variables.set('runSpecific', 'run1-value');
      `, run1Context, 'request-post' as ScriptType, () => {});
      
      expect(run1Context.globalVariables['runSpecific']).toBe('run1-value');
      
      // Run 2: New context = new global scope
      const run2Context: ExecutionContext = {
        ...context,
        globalVariables: {} // Fresh globals for new run
      };
      
      const result = await engine.execute(`
        quest.test('Globals reset for new run', () => {
          expect(quest.global.variables.get('runSpecific')).to.be.null;
        });
      `, run2Context, 'request-post' as ScriptType, () => {});
      
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('CLI --global prepopulates global variables', async () => {
      // Simulate CLI --global apiKey=secret123 --global env=prod
      context.globalVariables = {
        'apiKey': 'secret123',
        'env': 'prod'
      };
      
      const script = `
        quest.test('CLI globals are prepopulated', () => {
          expect(quest.global.variables.get('apiKey')).to.equal('secret123');
          expect(quest.global.variables.get('env')).to.equal('prod');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });
});


