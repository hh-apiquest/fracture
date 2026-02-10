/**
 * Test Plan Section 17: Script execution lifecycle
 * Tests script types, contexts, and basic lifecycle behavior
 * 
 * NOTE: Full lifecycle orchestration (execution order, folder nesting, etc.)
 * requires CollectionRunner integration tests. These tests focus on 
 * ScriptEngine's handling of different script types and contexts.
 */

import { describe, test, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { ScriptEngine } from '../src/ScriptEngine.js';
import type { ExecutionContext, ScriptType } from '@apiquest/types';
import { mockProtocolPlugin, createTestServer, type MockHttpServer, FakeJar } from './test-helpers.js';

describe('Section 17: Script execution lifecycle', () => {
  let engine: ScriptEngine;
  let context: ExecutionContext;
  let server: MockHttpServer;
  let serverUrl: string;

  beforeAll(async () => {
    server = createTestServer();
    serverUrl = await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  beforeEach(() => {
    engine = new ScriptEngine();
    
    context = {
      collectionInfo: { id: 'col-123', name: 'Test Collection' },
      iterationSource: 'none',
      protocol: 'http',
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
      cookieJar: FakeJar,
      abortSignal: new AbortController().signal,
    };
  });

  // ========================================================================
  // Section 17.1: Collection-level scripts
  // ========================================================================
  
  describe('17.1 Collection-level scripts', () => {
    test('collection-post script can access collection info', async () => {
      const script = `
        const name = quest.collection.info.name;
        const id = quest.collection.info.id;
        console.log('Collection:', name, id);
      `;
      
      const result = await engine.execute(script, context, 'collection-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.consoleOutput[0]).toContain('Test Collection');
      expect(result.consoleOutput[0]).toContain('col-123');
    });

    test('collection-post script can set global variables', async () => {
      const script = `
        quest.global.variables.set('authToken', 'token-from-collection-post');
      `;
      
      const result = await engine.execute(script, context, 'collection-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(context.globalVariables['authToken']).toBe('token-from-collection-post');
    });

    test('collection-post script cannot access request context (no current request)', async () => {
      const script = `
        const reqName = quest.request.info.name;
        const url = quest.request.url;
        const resp = quest.response;
        console.log('Request:', reqName, url,  resp);
      `;
      
      const result = await engine.execute(script, context, 'collection-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.consoleOutput[0]).toContain('null');
    });

    test('collection-post script can access collection variables', async () => {
      context.collectionVariables = { finalCount: '42' };
      
      const script = `
        const count = quest.collection.variables.get('finalCount');
        console.log('Final count:', count);
      `;
      
      const result = await engine.execute(script, context, 'collection-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.consoleOutput[0]).toContain('42');
    });

    test('collection-post script can access execution history', async () => {
      context.executionHistory = [
        {
          id: 'req-1',
          name: 'Request 1',
          path: '/Request 1',
          iteration: 1,
          response: { status: 200, statusText: 'OK', body: '{}', headers: {}, duration: 100 },
          tests: [],
          timestamp: new Date().toISOString()
        }
      ];
      
      const script = `
        const history = quest.history.requests.all();
        console.log('History length:', history.length, 'First:', history[0]?.name);
      `;
      
      const result = await engine.execute(script, context, 'collection-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.consoleOutput[0]).toContain('1');
      expect(result.consoleOutput[0]).toContain('Request 1');
    });

    test('collection-post script cannot use quest.test()', async () => {
      const script = `
        quest.test('should fail', () => {
          expect(true).to.be.true;
        });
      `;
      
      const result = await engine.execute(script, context, 'collection-post' as ScriptType, () => { });
      expect(result.success).toBe(false);
      expect(result.error).toContain('quest.test() can only be called in request post scripts');
    });
  });

  // ========================================================================
  // Section 17.2: Folder-level scripts
  // ========================================================================
  
  describe('17.2 Folder-level scripts', () => {
    test('folder-post script can set folder-scoped data', async () => {
      const script = `
        quest.collection.variables.set('folderSetup', 'complete');
      `;
      
      const result = await engine.execute(script, context, 'folder-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(context.collectionVariables['folderSetup']).toBe('complete');
    });

    test('folder-post script can access iteration context', async () => {
      context.iterationCurrent = 2;
      context.iterationCount = 5;
      
      const script = `
        console.log('Iteration:', quest.iteration.current, 'of', quest.iteration.count);
      `;
      
      const result = await engine.execute(script, context, 'folder-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.consoleOutput[0]).toContain('2');
      expect(result.consoleOutput[0]).toContain('5');
    });

    test('folder-post script cannot use quest.test()', async () => {
      const script = `
        quest.test('should fail', () => {
          expect(true).to.be.true;
        });
      `;
      
      const result = await engine.execute(script, context, 'folder-post' as ScriptType, () => { });
      expect(result.success).toBe(false);
      expect(result.error).toContain('quest.test() can only be called in request post scripts');
    });

    test('folder scripts can use console output', async () => {
      const script = `
        console.log('Entering folder:', quest.collection.info.name);
      `;
      
      const result = await engine.execute(script, context, 'folder-pre' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.consoleOutput).toHaveLength(1);
      expect(result.consoleOutput[0]).toContain('Entering folder:');
    });
  });

  // ========================================================================
  // Section 17.3: Request-level scripts (pre-request)
  // ========================================================================
  
  describe('17.3 Request pre-request scripts', () => {
    beforeEach(() => {
      context.currentRequest = {
        type: 'request',
        id: 'req-123',
        name: 'Get User',
        data: {
          method: 'GET',
          url: 'https://api.example.com/users/{{userId}}',
          headers: {}
        }
      };
    });

    test('pre-request script can access request info', async () => {
      const script = `
        // Access request info (verify no errors)
        const name = quest.request.info.name;
        const id = quest.request.info.id;
        const protocol = quest.request.info.protocol;
        console.log('Request:', name, id, protocol);
      `;
      
      const result = await engine.execute(script, context, 'request-pre' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.consoleOutput[0]).toContain('Get User');
      expect(result.consoleOutput[0]).toContain('req-123');
      expect(result.consoleOutput[0]).toContain('http');
    });

    test('pre-request script can modify request headers', async () => {
      const script = `
        quest.request.headers.add({key: 'Authorization', value: 'Bearer token123'});
        quest.request.headers.add({key: 'X-Custom', value: 'custom-value'});
      `;
      
      const result = await engine.execute(script, context, 'request-pre' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(context.currentRequest?.data.headers?.['Authorization']).toBe('Bearer token123');
      expect(context.currentRequest?.data.headers?.['X-Custom']).toBe('custom-value');
    });

    test('pre-request script can modify request body', async () => {
      context.currentRequest!.data.body = { mode: 'raw', raw: '{}' };
      
      const script = `
        quest.request.body.set('{"updated":true}');
      `;
      
      const result = await engine.execute(script, context, 'request-pre' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(context.currentRequest?.data.body?.raw).toBe('{"updated":true}');
    });

    test('pre-request script can use variables in setup', async () => {
      context.globalVariables = { apiToken: 'global-token-xyz' };
      
      const script = `
        const token = quest.global.variables.get('apiToken');
        quest.request.headers.add({key: 'Authorization', value: 'Bearer ' + token});
      `;
      
      const result = await engine.execute(script, context, 'request-pre' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(context.currentRequest?.data.headers?.['Authorization']).toBe('Bearer global-token-xyz');
    });

    test('pre-request script cannot access response (not yet executed)', async () => {
      const script = `
        const resp = quest.response;
        console.log('Response:', resp);
      `;
      
      const result = await engine.execute(script, context, 'request-pre' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.consoleOutput[0]).toContain('null');
    });
  });

  // ========================================================================
  // Section 17.4: Request-level scripts (post-request)
  // ========================================================================
  
  describe('17.4 Request post-request scripts (tests)', () => {
    beforeEach(() => {
      context.currentRequest = {
        type: 'request',
        id: 'req-123',
        name: 'Get User',
        data: {
          method: 'GET',
          url: 'https://api.example.com/users/123',
          headers: {}
        }
      };
      
      context.currentResponse = {
        status: 200,
        statusText: 'OK',
        body: '{"id":123,"name":"John Doe"}',
        headers: { 'content-type': 'application/json' },
        duration: 145
      };
    });

    test('post-request script can access response', async () => {
      const script = `
        quest.test('Response accessible', () => {
          expect(quest.response.status).to.equal(200);
          expect(quest.response.statusText).to.equal('OK');
          expect(quest.response.body).to.contain('John Doe');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('post-request script can parse and test JSON response', async () => {
      const script = `
        const data = quest.response.json();
        
        quest.test('User ID is correct', () => {
          expect(data.id).to.equal(123);
        });
        
        quest.test('User name is correct', () => {
          expect(data.name).to.equal('John Doe');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests).toHaveLength(2);
      expect(result.tests[0]?.passed).toBe(true);
      expect(result.tests[1]?.passed).toBe(true);
    });

    test('post-request script can set variables from response', async () => {
      context.scopeStack = [{ level: 'request', id: 'test', vars: {} }];
      
      const script = `
        const data = quest.response.json();
        quest.global.variables.set('userId', String(data.id));
        quest.scope.variables.set('userName', data.name);
        
        quest.test('Variables set from response', () => {
          expect(quest.global.variables.get('userId')).to.equal('123');
          expect(quest.scope.variables.get('userName')).to.equal('John Doe');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
      expect(context.globalVariables['userId']).toBe('123');
      expect(context.scopeStack[0].vars['userName']).toBe('John Doe');
    });

    test('post-request script can use assertion helpers', async () => {
      const script = `
        quest.test('Status helpers work', () => {
          expect(quest.response.to.be.ok).to.be.true;
          expect(quest.response.to.be.success).to.be.true;
          expect(quest.response.to.have.status(200)).to.be.true;
          expect(quest.response.to.have.header('content-type')).to.be.true;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('post-request script can make additional requests with sendRequest', async () => {
      const script = `
        // Make additional request in post-request script
        const additionalResp = await quest.sendRequest({
          url: '${serverUrl}/status/200',
          method: 'GET'
        });
        
        quest.test('Additional request succeeded', () => {
          expect(additionalResp.status).to.equal(200);
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 17.5: Script error handling
  // ========================================================================
  
  describe('17.5 Script error handling', () => {
    test('Uncaught error in script fails execution', async () => {
      const script = `
        console.log('Before error');
        throw new Error('Intentional error');
        console.log('After error'); // Won't execute
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Intentional error');
      expect(result.consoleOutput).toHaveLength(1);
      expect(result.consoleOutput[0]).toBe('Before error');
    });

    test('Error in pre-request script provides context', async () => {
      context.currentRequest = {
        type: 'request',
        id: 'req-fail',
        name: 'Failing Request',
        data: { method: 'GET', url: 'https://example.com' }
      };
      
      const script = `
        throw new Error('Setup failed');
      `;
      
      const result = await engine.execute(script, context, 'request-pre' as ScriptType, () => { });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Setup failed');
    });

    test('Successful tests recorded even when later code fails', async () => {
      const script = `
        quest.test('First test', () => {
          expect(1).to.equal(1);
        });
        
        quest.test('Second test', () => {
          expect(2).to.equal(2);
        });
        
        throw new Error('Error after tests');
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Error after tests');
      expect(result.tests).toHaveLength(2);
      expect(result.tests[0]?.passed).toBe(true);
      expect(result.tests[1]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 17.6: Variable scope and inheritance across scripts
  // ========================================================================
  
  describe('17.6 Variable scope and inheritance', () => {
    test('Global variables persist across script executions', async () => {
      // Simulate collection-pre script setting global
      const collectionPre = `
        quest.global.variables.set('apiToken', 'token-abc');
      `;
      
      await engine.execute(collectionPre, context, 'collection-pre' as ScriptType, () => { });
      
      // Simulate request-post accessing it
      const requestPost = `
        quest.test('Global variable accessible in request', () => {
          expect(quest.global.variables.get('apiToken')).to.equal('token-abc');
        });
      `;
      
      const result = await engine.execute(requestPost, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Collection variables accessible from all script types', async () => {
      context.collectionVariables = { baseUrl: 'https://api.example.com' };
      
      const scriptWithTest = `
        quest.test('Collection variable accessible', () => {
          expect(quest.collection.variables.get('baseUrl')).to.equal('https://api.example.com');
        });
      `;
      
      // Test in post-request script (quest.test is allowed)
      const postResult = await engine.execute(scriptWithTest, context, 'request-post' as ScriptType, () => { });
      expect(postResult.tests[0]?.passed).toBe(true);
      
      // Verify collection variable is accessible in collection-post (but without quest.test)
      const collectionScript = `
        const baseUrl = quest.collection.variables.get('baseUrl');
        if (baseUrl !== 'https://api.example.com') {
          throw new Error('baseUrl should be https://api.example.com');
        }
      `;
      const collectionResult = await engine.execute(collectionScript, context, 'collection-post' as ScriptType, () => { });
      expect(collectionResult.success).toBe(true);
    });

    test('Scope variables isolated per request execution', async () => {
      context.scopeStack = [{ level: 'request', id: 'req1', vars: {} }];
      
      // First script execution
      const script1 = `
        quest.scope.variables.set('tempId', '123');
      `;
      await engine.execute(script1, context, 'request-post' as ScriptType, () => { });
      
      // Clear scope variables (simulating new request)
      context.scopeStack = [{ level: 'request', id: 'req2', vars: {} }];
      
      // Second script execution - scope should be empty
      const script2 = `
        quest.test('Scope variables cleared', () => {
          expect(quest.scope.variables.get('tempId')).to.be.null;
        });
      `;
      
      const result = await engine.execute(script2, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Variables cascade correctly in quest.variables', async () => {
      context.iterationData = [{ userId: '999' }];
      context.iterationCurrent = 1;
      context.scopeStack = [{ level: 'request', id: 'test', vars: { priority: 'scope' } }];
      context.collectionVariables = { priority: 'collection', baseUrl: 'https://api.com' };
      context.globalVariables = { priority: 'global', apiKey: 'key123' };
      
      const script = `
        quest.test('Cascading priority correct', () => {
          // userId from iteration
          expect(quest.variables.get('userId')).to.equal('999');
          
          // priority from scope (highest after iteration)
          expect(quest.variables.get('priority')).to.equal('scope');
          
          // baseUrl from collection (scope doesn't have it)
          expect(quest.variables.get('baseUrl')).to.equal('https://api.com');
          
          // apiKey from global (not in iteration/scope/collection)
          expect(quest.variables.get('apiKey')).to.equal('key123');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 17.7: Empty script handling
  // ========================================================================
  
  describe('17.7 Empty/whitespace scripts', () => {
    test('Empty script executes successfully', async () => {
      const result = await engine.execute('', context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests).toHaveLength(0);
      expect(result.consoleOutput).toHaveLength(0);
    });

    test('Whitespace-only script executes successfully', async () => {
      const result = await engine.execute('   \n  \t  ', context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests).toHaveLength(0);
      expect(result.consoleOutput).toHaveLength(0);
    });

    test('Comment-only script executes successfully', async () => {
      const script = `
        // This is a comment
        /* This is a block comment */
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests).toHaveLength(0);
    });
  });
});


