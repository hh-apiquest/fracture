/**
 * Test Plan Section 16: Sequential Script Execution & State Persistence
 * Tests running multiple scripts in sequence, variable scope hierarchy,
 * and state persistence between script executions
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { ScriptEngine } from '../src/ScriptEngine.js';
import type { ExecutionContext, ScriptType, ScopeContext } from '@apiquest/types';
import { FakeJar, mockProtocolPlugin, buildScopeChain } from './test-helpers.js';

describe('Section 16: Sequential Script Execution & State Persistence', () => {
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
      environment: { name: 'Test Env', variables: {} },
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
  // Section 16.1: Global variables persist across all script types
  // ========================================================================
  
  describe('16.1 Global variables persist across all scripts', () => {
    test('Global set in collection-pre accessible in request-post', async () => {
      // Step 1: collection-pre sets global
      const collectionPre = `
        quest.global.variables.set('authToken', 'token-abc-123');
        quest.global.variables.set('timestamp', Date.now().toString());
      `;
      
      await engine.execute(collectionPre, context, 'collection-pre' as ScriptType, () => { });
      
      // Step 2: request-post reads it
      const requestPost = `
        quest.test('Global variables accessible', () => {
          expect(quest.global.variables.get('authToken')).to.equal('token-abc-123');
          expect(quest.global.variables.get('timestamp')).to.not.be.null;
        });
      `;
      
      const result = await engine.execute(requestPost, context, 'request-post' as ScriptType, () => { });
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Global variables persist through entire execution chain', async () => {
      // collection-pre
      await engine.execute(`quest.global.variables.set('step', '1');`, context, 'collection-pre' as ScriptType, () => { });
      expect(context.globalVariables['step']).toBe('1');
      
      // folder-pre
      await engine.execute(`quest.global.variables.set('step', '2');`, context, 'folder-pre' as ScriptType, () => { });
      expect(context.globalVariables['step']).toBe('2');
      
      // request-pre
      await engine.execute(`quest.global.variables.set('step', '3');`, context, 'request-pre' as ScriptType, () => { });
      expect(context.globalVariables['step']).toBe('3');
      
      // request-post
      const result = await engine.execute(`
        quest.test('Global persisted through chain', () => {
          expect(quest.global.variables.get('step')).to.equal('3');
        });
      `, context, 'request-post' as ScriptType, () => { });
      
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Multiple global variables accumulate', async () => {
      await engine.execute(`quest.global.variables.set('var1', 'value1');`, context, 'collection-pre' as ScriptType, () => { });
      await engine.execute(`quest.global.variables.set('var2', 'value2');`, context, 'folder-pre' as ScriptType, () => { });
      await engine.execute(`quest.global.variables.set('var3', 'value3');`, context, 'request-pre' as ScriptType, () => { });
      
      const result = await engine.execute(`
        quest.test('All globals present', () => {
          expect(quest.global.variables.get('var1')).to.equal('value1');
          expect(quest.global.variables.get('var2')).to.equal('value2');
          expect(quest.global.variables.get('var3')).to.equal('value3');
        });
      `, context, 'request-post' as ScriptType, () => { });
      
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 16.2: Collection variables persist
  // ========================================================================
  
  describe('16.2 Collection variables persist across scripts', () => {
    test('Collection variable set early visible later', async () => {
      await engine.execute(`
        quest.collection.variables.set('config', 'enabled');
      `, context, 'collection-pre' as ScriptType, () => { });
      
      const result = await engine.execute(`
        quest.test('Collection variable accessible', () => {
          expect(quest.collection.variables.get('config')).to.equal('enabled');
        });
      `, context, 'request-post' as ScriptType, () => { });
      
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Collection variables can be modified across scripts', async () => {
      await engine.execute(`quest.collection.variables.set('counter', '0');`, context, 'collection-pre' as ScriptType, () => { });
      await engine.execute(`quest.collection.variables.set('counter', '1');`, context, 'request-pre' as ScriptType, () => { });
      await engine.execute(`quest.collection.variables.set('counter', '2');`, context, 'request-post' as ScriptType, () => { });
      
      // Verify in collection-post script (no tests allowed, just access)
      const result = await engine.execute(`
        const counter = quest.collection.variables.get('counter');
        if (counter !== '2') throw new Error('Counter should be 2');
      `, context, 'collection-post' as ScriptType, () => { });
      
      expect(result.success).toBe(true);
    });
  });

  // ========================================================================
  // Section 16.3: Environment variables persist but not typically modified
  // ========================================================================
  
  describe('16.3 Environment variables accessible across scripts', () => {
    test('Environment variable set early accessible later', async () => {
      await engine.execute(`
       quest.environment.variables.set('apiUrl', 'https://api.example.com');
      `, context, 'collection-pre' as ScriptType, () => { });
      
      const result = await engine.execute(`
        quest.test('Environment variable accessible', () => {
          expect(quest.environment.variables.get('apiUrl')).to.equal('https://api.example.com');
        });
      `, context, 'request-post' as ScriptType, () => { });
      
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 16.4: Scope variables are request-scoped (cleared between requests)
  // ========================================================================
  
  describe('16.4 Scope variables cleared between request executions', () => {
    test('Scope set in request-pre accessible in same request post', async () => {
      context.scope = buildScopeChain([
        { level: 'collection', id: 'col-123', vars: {} },
        { level: 'request', id: 'test', vars: {} }
      ]);
      
      // Simulate request-pre
      await engine.execute(`
        quest.scope.variables.set('requestId', 'req-123');
      `, context, 'request-pre' as ScriptType, () => { });
      
      // Same request's request-post
      const result = await engine.execute(`
        quest.test('Scope accessible in same request', () => {
          expect(quest.scope.variables.get('requestId')).to.equal('req-123');
        });
      `, context, 'request-post' as ScriptType, () => { });
      
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Scope variables NOT accessible across different requests', async () => {
      // Request 1 - create scope with variables
      context.scope = buildScopeChain([
        { level: 'collection', id: 'col-123', vars: {} },
        { level: 'request', id: 'req1', vars: {} }
      ]);
      await engine.execute(`
        quest.scope.variables.set('tempData', 'request1-data');
      `, context, 'request-post' as ScriptType, () => { });
      
      // Clear scope (simulating new request with fresh scope)
      context.scope = buildScopeChain([
        { level: 'collection', id: 'col-123', vars: {} },
        { level: 'request', id: 'req2', vars: {} }
      ]);
      
      // Request 2 post-request
      const result = await engine.execute(`
        quest.test('Scope from previous request cleared', () => {
          expect(quest.scope.variables.get('tempData')).to.be.null;
        });
      `, context, 'request-post' as ScriptType, () => { });
      
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 16.5: Variable scope hierarchy (precedence)
  // ========================================================================
  
  describe('16.5 Variable scope hierarchy and precedence', () => {
    test('Iteration data takes precedence over all other scopes', async () => {
      context.iterationData = [{ key: 'iteration-value' }];
      context.iterationCurrent = 1;
      context.scope = buildScopeChain([
        { level: 'collection', id: 'col-123', vars: {} },
        { level: 'request', id: 'test', vars: { key: 'scope-value' } }
      ]);
      context.collectionVariables = { key: 'collection-value' };
      context.globalVariables = { key: 'global-value' };
      
      const result = await engine.execute(`
        quest.test('Iteration takes precedence', () => {
          expect(quest.variables.get('key')).to.equal('iteration-value');
        });
      `, context, 'request-post' as ScriptType, () => { });
      
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Scope takes precedence over collection/env/global', async () => {
      context.scope = buildScopeChain([
        { level: 'collection', id: 'col-123', vars: {} },
        { level: 'request', id: 'test', vars: { key: 'scope-value' } }
      ]);
      context.collectionVariables = { key: 'collection-value' };
      context.environment!.variables = { key: 'env-value' };
      context.globalVariables = { key: 'global-value' };
      
      const result = await engine.execute(`
        quest.test('Scope takes precedence', () => {
          expect(quest.variables.get('key')).to.equal('scope-value');
        });
      `, context, 'request-post' as ScriptType, () => { });
      
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Collection takes precedence over env/global', async () => {
      context.collectionVariables = { key: 'collection-value' };
      context.environment!.variables = { key: 'env-value' };
      context.globalVariables = { key: 'global-value' };
      
      const result = await engine.execute(`
        quest.test('Collection takes precedence', () => {
          expect(quest.variables.get('key')).to.equal('collection-value');
        });
      `, context, 'request-post' as ScriptType, () => { });
      
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Environment takes precedence over global', async () => {
      context.environment!.variables = { key: 'env-value' };
      context.globalVariables = { key: 'global-value' };
      
      const result = await engine.execute(`
        quest.test('Environment takes precedence', () => {
          expect(quest.variables.get('key')).to.equal('env-value');
        });
      `, context, 'request-post' as ScriptType, () => { });
      
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Global is last resort', async () => {
      context.globalVariables = { key: 'global-value' };
      
      const result = await engine.execute(`
        quest.test('Global used when nothing else', () => {
          expect(quest.variables.get('key')).to.equal('global-value');
        });
      `, context, 'request-post' as ScriptType, () => { });
      
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 16.6: Setting variables affects subsequent script reads
  // ========================================================================
  
  describe('16.6 Variable mutations visible in subsequent scripts', () => {
    test('quest.variables.set() writes to scope and shadows others', async () => {
      context.scope = buildScopeChain([
        { level: 'collection', id: 'col-123', vars: {} },
        { level: 'request', id: 'test', vars: {} }
      ]);
      context.globalVariables = { key: 'global-original' };
      
      // First script sets via quest.variables
      await engine.execute(`
        quest.variables.set('key', 'local-override');
      `, context, 'request-pre' as ScriptType, () => { });
      
      // Second script reads
      const result = await engine.execute(`
        quest.test('Local override visible', () => {
          expect(quest.variables.get('key')).to.equal('local-override');
          expect(quest.scope.variables.get('key')).to.equal('local-override');
          expect(quest.global.variables.get('key')).to.equal('global-original');
        });
      `, context, 'request-post' as ScriptType, () => { });
      
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Direct scope modifications are visible', async () => {
      context.scope = buildScopeChain([
        { level: 'collection', id: 'col-123', vars: {} },
        { level: 'request', id: 'test', vars: {} }
      ]);
      
      await engine.execute(`
        quest.global.variables.set('globalKey', 'globalValue');
        quest.collection.variables.set('collectionKey', 'collectionValue');
        quest.scope.variables.set('localKey', 'localValue');
      `, context, 'request-pre' as ScriptType, () => { });
      
      const result = await engine.execute(`
        quest.test('All scopes visible', () => {
          expect(quest.global.variables.get('globalKey')).to.equal('globalValue');
          expect(quest.collection.variables.get('collectionKey')).to.equal('collectionValue');
          expect(quest.scope.variables.get('localKey')).to.equal('localValue');
        });
      `, context, 'request-post' as ScriptType, () => { });
      
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 16.7: Request modifications persist to execution
  // ========================================================================
  
  describe('16.7 Request modifications in pre-request persist', () => {
    beforeEach(() => {
      context.currentRequest = {
        type: 'request',
        id: 'req-1',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'https://example.com',
          headers: {}
        }
      };
    });

    test('Headers added in pre-request visible in post-request', async () => {
      // pre-request adds headers
      await engine.execute(`
        quest.request.headers.add({key: 'Authorization', value: 'Bearer token123'});
        quest.request.headers.add({key: 'X-Custom', value: 'custom-value'});
      `, context, 'request-pre' as ScriptType, () => { });
      
      // post-request reads them
      const result = await engine.execute(`
        quest.test('Headers persisted', () => {
          expect(quest.request.headers.get('Authorization')).to.equal('Bearer token123');
          expect(quest.request.headers.get('X-Custom')).to.equal('custom-value');
        });
      `, context, 'request-post' as ScriptType, () => { });
      
      expect(result.tests[0]?.passed).toBe(true);
      // Verify in context
      expect((context.currentRequest?.data.headers as Record<string, string> | undefined)?.['Authorization']).toBe('Bearer token123');
    });

    test('Body modified in pre-request persists', async () => {
      context.currentRequest!.data.body = { mode: 'raw', raw: 'original' };
      
      await engine.execute(`
        quest.request.body.set('modified-body');
      `, context, 'request-pre' as ScriptType, () => { });
      
      const result = await engine.execute(`
        quest.test('Body modification persisted', () => {
          expect(quest.request.body.get()).to.equal('modified-body');
        });
      `, context, 'request-post' as ScriptType, () => { });
      
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 16.8: Execution history accumulates
  // ========================================================================
  
  describe('16.8 Execution history accumulates across requests', () => {
    test('History entries added sequentially', async () => {
      // Start with empty history
      expect(context.executionHistory).toHaveLength(0);
      
      // Simulate first request completion
      context.executionHistory.push({
        id: 'req-1',
        name: 'Request 1',
        path: '/Request 1',
        iteration: 1,
        response: { status: 200, statusText: 'OK', body: '{}', headers: {}, duration: 100 },
        tests: [],
        timestamp: new Date().toISOString()
      });
      
      // Simulate second request completion
      context.executionHistory.push({
        id: 'req-2',
        name: 'Request 2',
        path: '/Request 2',
        iteration: 1,
        response: { status: 201, statusText: 'Created', body: '{}', headers: {}, duration: 150 },
        tests: [],
        timestamp: new Date().toISOString()
      });
      
      // collection-post can see all history (but cannot use quest.test)
      const result = await engine.execute(`
        const history = quest.history.requests.all();
        
        // Verify without quest.test (not allowed in collection-post)
        if (history.length !== 2) throw new Error('Expected 2 history entries');
        if (history[0].name !== 'Request 1') throw new Error('First request name incorrect');
        if (history[1].name !== 'Request 2') throw new Error('Second request name incorrect');
      `, context, 'collection-post' as ScriptType, () => { });
      
      expect(result.success).toBe(true);
    });
  });

  // ========================================================================
  // Section 16.9: Context state carries forward through execution
  // ========================================================================
  
  describe('16.9 Complete execution flow state management', () => {
    test('Realistic multi-script execution flow', async () => {
      // STEP 1: collection-pre - authenticate and set global token
      await engine.execute(`
        // Simulate authentication
        quest.global.variables.set('authToken', 'session-token-xyz');
        quest.collection.variables.set('baseUrl', 'https://api.example.com');
      `, context, 'collection-pre' as ScriptType, () => { });
      
      // STEP 2: folder-pre - set folder-level config
      await engine.execute(`
        quest.collection.variables.set('folderName', 'Users');
      `, context, 'folder-pre' as ScriptType, () => { });
      
      // STEP 3: request-pre - prepare request
      context.currentRequest = {
        type: 'request',
        id: 'req-get-user',
        name: 'Get User',
        data: { method: 'GET', url: 'https://api.example.com/users/123', headers: {} }
      };
      context.scope = buildScopeChain([
        { level: 'collection', id: 'col-123', vars: {} },
        { level: 'request', id: 'req-get-user', vars: {} }
      ]);
      
      await engine.execute(`
        const token = quest.global.variables.get('authToken');
        quest.request.headers.add({key: 'Authorization', value: 'Bearer ' + token});
        quest.scope.variables.set('startTime', Date.now().toString());
      `, context, 'request-pre' as ScriptType, () => { });
      
      // STEP 4: Simulate request execution (would happen in runner)
      context.currentResponse = {
        status: 200,
        statusText: 'OK',
        body: '{"id":123,"name":"John Doe"}',
        headers: {'content-type': 'application/json'},
        duration: 145
      };
      
      // STEP 5: request-post - test and extract data
      const postResult = await engine.execute(`
        const data = quest.response.json();
        quest.global.variables.set('userId', String(data.id));
        quest.scope.variables.set('userName', data.name);
        
        quest.test('User fetched successfully', () => {
          expect(quest.response.status).to.equal(200);
          expect(data.id).to.equal(123);
          expect(data.name).to.equal('John Doe');
        });
        
        quest.test('Authorization was sent', () => {
          expect(quest.request.headers.get('Authorization')).to.equal('Bearer session-token-xyz');
        });
        
        quest.test('All scopes accessible', () => {
          expect(quest.global.variables.get('authToken')).to.equal('session-token-xyz');
          expect(quest.collection.variables.get('baseUrl')).to.equal('https://api.example.com');
          expect(quest.scope.variables.get('userName')).to.equal('John Doe');
        });
      `, context, 'request-post' as ScriptType, () => { });
      
      expect(postResult.tests.every(t => t.passed)).toBe(true);
      
      // Verify final state
      expect(context.globalVariables['authToken']).toBe('session-token-xyz');
      expect(context.globalVariables['userId']).toBe('123');
      expect(context.collectionVariables['baseUrl']).toBe('https://api.example.com');
      expect(context.scope.vars['userName']).toBe('John Doe');
    });
  });
});


