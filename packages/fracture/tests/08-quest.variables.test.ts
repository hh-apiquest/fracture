/**
 * Test Plan Section 8: quest.variables (cascading resolver)
 * Tests variable precedence: iteration > local > collection > env > global
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { ScriptEngine } from '../src/ScriptEngine.js';
import type { ExecutionContext, ScriptType } from '@apiquest/types';
import { FakeJar, mockProtocolPlugin, buildScopeChain } from './test-helpers.js';

describe('Section 8: quest.variables (cascading)', () => {
  let engine: ScriptEngine;
  let context: ExecutionContext;

  beforeEach(() => {
    engine = new ScriptEngine();
    
    context = {
      protocol: 'http',
      collectionInfo: { id: 'col-123', name: 'Test Collection' },
      iterationSource: 'none',
      scope: buildScopeChain([{ level: 'collection', id: 'col-123', vars: {} }]),
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
      cookieJar: FakeJar,
      abortSignal: new AbortController().signal,
    };
  });

  // ========================================================================
  // Section 8.1: Precedence order
  // ========================================================================
  
  describe('8.1 Precedence order', () => {
    test('Iteration data highest priority', async () => {
      context.iterationData = [{ key: 'fromIteration' }];
      context.iterationCurrent = 1;
      context.scope = buildScopeChain([
        { level: 'collection', id: 'col-123', vars: {} },
        { level: 'request', id: 'test', vars: { key: 'fromScope' } }
      ]);
      context.collectionVariables = { key: 'fromCollection' };
      context.environment = { name: 'Test', variables: { key: 'fromEnv' } };
      context.globalVariables = { key: 'fromGlobal' };
      
      const script = `
        quest.test('Iteration wins', () => {
          expect(quest.variables.get('key')).to.equal('fromIteration');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Local overrides collection/env/global', async () => {
      context.scope = buildScopeChain([
        { level: 'collection', id: 'col-123', vars: {} },
        { level: 'request', id: 'test', vars: { key: 'fromScope' } }
      ]);
      context.collectionVariables = { key: 'fromCollection' };
      context.environment = { name: 'Test', variables: { key: 'fromEnv' } };
      context.globalVariables = { key: 'fromGlobal' };
      
      const script = `
        quest.test('Scope wins over lower scopes', () => {
          expect(quest.variables.get('key')).to.equal('fromScope');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Collection overrides env/global', async () => {
      context.collectionVariables = { key: 'fromCollection' };
      context.environment = { name: 'Test', variables: { key: 'fromEnv' } };
      context.globalVariables = { key: 'fromGlobal' };
      
      const script = `
        quest.test('Collection wins over env/global', () => {
          expect(quest.variables.get('key')).to.equal('fromCollection');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Environment overrides global', async () => {
      context.environment = { name: 'Test', variables: { key: 'fromEnv' } };
      context.globalVariables = { key: 'fromGlobal' };
      
      const script = `
        quest.test('Environment wins over global', () => {
          expect(quest.variables.get('key')).to.equal('fromEnv');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Global is lowest priority (fallback)', async () => {
      context.globalVariables = { key: 'fromGlobal' };
      
      const script = `
        quest.test('Global as fallback', () => {
          expect(quest.variables.get('key')).to.equal('fromGlobal');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Returns null when not found in any scope', async () => {
      const script = `
        quest.test('Returns null for missing', () => {
          expect(quest.variables.get('nonExistent')).to.be.null;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 8.2: Variable shadowing
  // ========================================================================
  
  describe('8.2 Variable shadowing', () => {
    test('Scopes can have same key with different values', async () => {
      context.iterationData = [{ apiUrl: 'iteration-url' }];
      context.iterationCurrent = 1;
      context.scope = buildScopeChain([
        { level: 'collection', id: 'col-123', vars: {} },
        { level: 'request', id: 'test', vars: { apiUrl: 'scope-url' } }
      ]);
      context.collectionVariables = { apiUrl: 'collection-url' };
      context.environment = { name: 'Test', variables: { apiUrl: 'env-url' } };
      context.globalVariables = { apiUrl: 'global-url' };
      
      const script = `
        quest.test('All scopes can coexist with same key', () => {
          // Cascading resolver gets iteration
          expect(quest.variables.get('apiUrl')).to.equal('iteration-url');
          
          // But each scope preserves its own value
          expect(quest.iteration.data.get('apiUrl')).to.equal('iteration-url');
          expect(quest.scope.variables.get('apiUrl')).to.equal('scope-url');
          expect(quest.collection.variables.get('apiUrl')).to.equal('collection-url');
          expect(quest.environment.variables.get('apiUrl')).to.equal('env-url');
          expect(quest.global.variables.get('apiUrl')).to.equal('global-url');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Setting via quest.variables.set() goes to scope', async () => {
      context.scope = buildScopeChain([
        { level: 'collection', id: 'col-123', vars: {} },
        { level: 'request', id: 'test', vars: {} }
      ]);
      context.globalVariables = { key: 'globalValue' };
      
      const script = `
        // Set via cascading API
        quest.variables.set('key', 'newValue');
        
        quest.test('Set goes to scope, shadows global', () => {
          expect(quest.variables.get('key')).to.equal('newValue');
          expect(quest.scope.variables.get('key')).to.equal('newValue');
          expect(quest.global.variables.get('key')).to.equal('globalValue');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 8.3: replaceIn() template resolution
  // ========================================================================
  
  describe('8.3 replaceIn() template resolution', () => {
    test('replaceIn() uses cascading resolution', async () => {
      context.environment = { name: 'Test', variables: { baseUrl: 'https://api.example.com' } };
      context.collectionVariables = { endpoint: '/users' };
      
      const script = `
        const url = quest.variables.replaceIn('{{baseUrl}}{{endpoint}}');
        
        quest.test('Template resolved from multiple scopes', () => {
          expect(url).to.equal('https://api.example.com/users');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('replaceIn() respects precedence', async () => {
      context.scope = buildScopeChain([
        { level: 'collection', id: 'col-123', vars: {} },
        { level: 'request', id: 'test', vars: { key: 'scope' } }
      ]);
      context.globalVariables = { key: 'global' };
      
      const script = `
        const result = quest.variables.replaceIn('Value: {{key}}');
        
        quest.test('Template uses higher precedence', () => {
          expect(result).to.equal('Value: scope');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('replaceIn() leaves unresolved placeholders', async () => {
      const script = `
        const result = quest.variables.replaceIn('{{exists}} and {{missing}}');
        
        quest.test('Missing variables not replaced', () => {
          expect(result).to.equal('{{exists}} and {{missing}}');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('replaceIn() handles multiple occurrences', async () => {
      context.globalVariables = { name: 'Alice' };
      
      const script = `
        const result = quest.variables.replaceIn('Hello {{name}}, welcome {{name}}!');
        
        quest.test('Multiple replacements work', () => {
          expect(result).to.equal('Hello Alice, welcome Alice!');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 8.4: has() method
  // ========================================================================
  
  describe('8.4 has() method', () => {
    test('has() checks all scopes in order', async () => {
      context.environment = { name: 'Test', variables: { envVar: 'value' } };
      
      const script = `
        quest.test('has() finds in any scope', () => {
          expect(quest.variables.has('envVar')).to.be.true;
          expect(quest.variables.has('missing')).to.be.false;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('has() respects precedence', async () => {
      context.scope = buildScopeChain([
        { level: 'collection', id: 'col-123', vars: {} },
        { level: 'request', id: 'test', vars: { key: 'scope' } }
      ]);
      context.globalVariables = { key: 'global' };
      
      const script = `
        quest.test('has() returns true for shadowed variable', () => {
          // True because it exists (in scope, which shadows global)
          expect(quest.variables.has('key')).to.be.true;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });
});


