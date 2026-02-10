/**
 * Test Plan Section 11: quest.sendRequest
 * Tests HTTP requests from scripts (async/await and callback patterns)
 * Note: Uses MockHttpServer instead of external dependencies
 */

import { describe, test, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { ScriptEngine } from '../src/ScriptEngine.js';
import type { ExecutionContext, ScriptType } from '@apiquest/types';
import { mockOptionsPlugin, createTestServer, MockHttpServer, FakeJar } from './test-helpers.js';

describe('Section 11: quest.sendRequest', () => {
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
    const controller = new AbortController();
    
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
      protocolPlugin: mockOptionsPlugin,
      cookieJar: FakeJar,
      abortSignal: controller.signal as AbortSignal
    };
  });

  // ========================================================================
  // Section 11.1: Async/await pattern
  // ========================================================================
  
  describe('11.1 Async/await pattern', () => {
    test('sendRequest() returns Promise that can be awaited', async () => {
      const script = `
        const response = await quest.sendRequest({
          url: '${serverUrl}/status/200',
          method: 'GET'
        });
        
        quest.test('Response received', () => {
          expect(response).to.have.property('status');
          expect(response).to.have.property('body');
          expect(response).to.have.property('headers');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('sendRequest() response has status code', async () => {
      const script = `
        const response = await quest.sendRequest({
          url: '${serverUrl}/status/200',
          method: 'GET'
        });
        
        quest.test('Has status code', () => {
          expect(response.status).to.be.a('number');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('sendRequest() response has statusText', async () => {
      const script = `
        const response = await quest.sendRequest({
          url: '${serverUrl}/status/200',
          method: 'GET'
        });
        
        quest.test('Has statusText', () => {
          expect(response.statusText).to.be.a('string');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('sendRequest() response.json() parses JSON', async () => {
      const script = `
        const response = await quest.sendRequest({
          url: '${serverUrl}/json',
          method: 'GET'
        });
        
        const data = response.json();
        
        quest.test('JSON parsed', () => {
          expect(data).to.be.an('object');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('sendRequest() can be used in variable assignment', async () => {
      const script = `
        const response = await quest.sendRequest({
          url: '${serverUrl}/json',
          method: 'GET'
        });
        
        const data = response.json();
        quest.global.variables.set('apiData', JSON.stringify(data));
        
        quest.test('Stored in variable', () => {
          expect(quest.global.variables.has('apiData')).to.be.true;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 11.2: Callback pattern
  // ========================================================================
  
  describe('11.2 Callback pattern', () => {
    test('sendRequest() accepts callback as second argument', async () => {
      const script = `
        let callbackExecuted = false;
        
        quest.sendRequest({
          url: '${serverUrl}/status/200',
          method: 'GET'
        }, (err, response) => {
          callbackExecuted = true;
          
          quest.test('Callback executed', () => {
            expect(callbackExecuted).to.be.true;
          });
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      // Give callback time to execute
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(result.success).toBe(true);
    });

    test('sendRequest() callback receives error on failure', async () => {
      const script = `
        quest.sendRequest({
          url: 'https://invalid-url-that-does-not-exist-12345.com',
          method: 'GET'
        }, (err, response) => {
          quest.test('Error received in callback', () => {
            expect(err).to.not.be.null;
          });
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(result.success).toBe(true);
    });

    test('sendRequest() callback receives response on success', async () => {
      const script = `
        quest.sendRequest({
          url: '${serverUrl}/status/200',
          method: 'GET'
        }, (err, response) => {
          quest.test('Response received in callback', () => {
            expect(err).to.be.null;
            expect(response).to.not.be.null;
            expect(response).to.have.property('status');
          });
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(result.success).toBe(true);
    });

    test('sendRequest() with callback returns undefined (not Promise)', async () => {
      const script = `
        const result = quest.sendRequest({
          url: '${serverUrl}/status/200',
          method: 'GET'
        }, (err, response) => {
          // Callback pattern
        });
        
        quest.test('Returns undefined in callback mode', () => {
          expect(result).to.be.undefined;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 11.3: Request configuration
  // ========================================================================
  
  describe('11.3 Request configuration', () => {
    test('sendRequest() requires url', async () => {
      const script = `
        try {
          await quest.sendRequest({
            method: 'GET'
          });
          quest.fail('Should have thrown error');
        } catch (error) {
          quest.test('Throws error without url', () => {
            expect(error.message).to.include('url');
          });
        }
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('sendRequest() defaults to GET method', async () => {
      const script = `
        // Not testing actual behavior, just that it doesn't error
        const response = await quest.sendRequest({
          url: '${serverUrl}/get'
        });
        
        quest.test('Defaults to GET', () => {
          expect(response).to.have.property('status');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('sendRequest() can specify method', async () => {
      const script = `
        const response = await quest.sendRequest({
          url: '${serverUrl}/post',
          method: 'POST'
        });
        
        quest.test('POST request', () => {
          expect(response).to.have.property('status');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('sendRequest() can include headers', async () => {
      const script = `
        const response = await quest.sendRequest({
          url: '${serverUrl}/headers',
          method: 'GET',
          header: {
            'X-Custom-Header': 'test-value',
            'Authorization': 'Bearer token123'
          }
        });
        
        quest.test('Headers sent', () => {
          expect(response).to.have.property('status');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('sendRequest() can include body as string', async () => {
      const script = `
        const response = await quest.sendRequest({
          url: '${serverUrl}/post',
          method: 'POST',
          body: '{"name": "Alice", "age": 30}'
        });
        
        quest.test('Body sent', () => {
          expect(response).to.have.property('status');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('sendRequest() can include body as object (auto-JSON)', async () => {
      const script = `
        const response = await quest.sendRequest({
          url: '${serverUrl}/post',
          method: 'POST',
          body: {
            name: 'Alice',
            age: 30
          }
        });
        
        quest.test('Object body auto-stringified', () => {
          expect(response).to.have.property('status');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 11.4: Response handling
  // ========================================================================
  
  describe('11.4 Response handling', () => {
    test('sendRequest() response has time property', async () => {
      const script = `
        const response = await quest.sendRequest({
          url: '${serverUrl}/status/200',
          method: 'GET'
        });
        
        quest.test('Has time property', () => {
          expect(response).to.have.property('time');
          expect(response.time).to.be.a('number');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('sendRequest() response.text() returns body as string', async () => {
      const script = `
        const response = await quest.sendRequest({
          url: '${serverUrl}/html',
          method: 'GET'
        });
        
        const text = response.text();
        
        quest.test('text() returns string', () => {
          expect(text).to.be.a('string');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('sendRequest() can chain multiple requests', async () => {
      const script = `
        const response1 = await quest.sendRequest({
          url: '${serverUrl}/json',
          method: 'GET'
        });
        
        const data1 = response1.json();
        
        // Use data1 to make second request
        const response2 = await quest.sendRequest({
          url: '${serverUrl}/post',
          method: 'POST',
          body: { fromFirst: 'value' }
        });
        
        quest.test('Chained requests', () => {
          expect(response1.status).to.be.a('number');
          expect(response2.status).to.be.a('number');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 11.5: Use cases
  // ========================================================================
  
  describe('11.5 Use cases', () => {
    test('OAuth flow: Get token then use it', async () => {
      const script = `
        // Step 1: Get access token
        const tokenResponse = await quest.sendRequest({
          url: '${serverUrl}/post',
          method: 'POST',
          body: {
            grant_type: 'client_credentials',
            client_id: 'test',
            client_secret: 'secret'
          }
        });
        
        // Simulate extracting token
        const token = 'simulated-token-123';
        quest.global.variables.set('accessToken', token);
        
        // Step 2: Use token in subsequent request
        const dataResponse = await quest.sendRequest({
          url: '${serverUrl}/get',
          method: 'GET',
          header: {
            'Authorization': \`Bearer \${quest.global.variables.get('accessToken')}\`
          }
        });
        
        quest.test('OAuth flow completed', () => {
          expect(dataResponse.status).to.be.a('number');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Conditional request based on first response', async () => {
      const script = `
        const checkResponse = await quest.sendRequest({
          url: '${serverUrl}/status/200',
          method: 'GET'
        });
        
        if (checkResponse.status === 200) {
          const followUpResponse = await quest.sendRequest({
            url: '${serverUrl}/get',
            method: 'GET'
          });
          
          quest.test('Follow-up request made', () => {
            expect(followUpResponse).to.have.property('status');
          });
        }
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Extract data from one API for use in another', async () => {
      const script = `
        // Get configuration/metadata from one API
        const configResponse = await quest.sendRequest({
          url: '${serverUrl}/json',
          method: 'GET'
        });
        
        const config = configResponse.json();
        
        // Store for later use
        quest.collection.variables.set('apiConfig', JSON.stringify(config));
        
        quest.test('Config extracted and stored', () => {
          expect(quest.collection.variables.has('apiConfig')).to.be.true;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  describe('11.7 Abort Signal Support', () => {
    test('quest.sendRequest aborts when signal is triggered', async () => {
      const controller = new AbortController();
      context.abortSignal = controller.signal as AbortSignal;
      
      // Abort after a short delay - will abort the HTTP request
      setTimeout(() => controller.abort('Test abort'), 50);
      
      const script = `
        let errorCaught = false;
        try {
          const response = await quest.sendRequest({
            url: '${serverUrl}/delay/5000',
            method: 'GET'
          });
          quest.test('Should not reach this', () => {
            expect(false).to.be.true;
          });
        } catch (error) {
          errorCaught = true;
          quest.test('Error was caught but test skipped', () => {
            expect(error).to.not.be.undefined;
          });
        }
        
        // Tests after abort should be skipped
        quest.test('This test should be skipped', () => {
          expect(true).to.be.true;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      // First test in try never executes because abort happens during sendRequest
      // Only catch block test and third test are created, both skipped
      expect(result.tests).toHaveLength(2);
      expect(result.tests[0].name).toBe('Error was caught but test skipped');
      expect(result.tests[0].skipped).toBe(true);
      expect(result.tests[1].name).toBe('This test should be skipped');
      expect(result.tests[1].skipped).toBe(true);
      expect(result.tests[0].error).toBe('Test skipped - execution aborted');
    });

    test('quest.sendRequest with pre-aborted signal fails immediately', async () => {
      const controller = new AbortController();
      controller.abort('Already aborted');
      context.abortSignal = controller.signal as AbortSignal;
      
      const script = `
        let errorCaught = false;
        try {
          const response = await quest.sendRequest({
            url: '${serverUrl}/status/200',
            method: 'GET'
          });
        } catch (error) {
          errorCaught = true;
        }
        
        quest.test('Request was aborted', () => {
          expect(errorCaught).to.be.true;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      // Test should be skipped since signal is already aborted
      expect(result.tests[0].skipped).toBe(true);
      expect(result.tests[0].error).toBe('Test skipped - execution aborted');
    });
  });
});



