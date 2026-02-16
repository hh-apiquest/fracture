/**
 * Test Plan Section 4: quest.response
 * Tests for response status, body parsing, headers, metrics, and assertion helpers
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { ScriptEngine } from '../src/ScriptEngine.js';
import type { ExecutionContext, ScriptType, ProtocolResponse } from '@apiquest/types';
import { FakeJar, mockProtocolPlugin, buildScopeChain } from './test-helpers.js';

describe('Section 4: quest.response', () => {
  let engine: ScriptEngine;
  let context: ExecutionContext;
  let mockResponse: ProtocolResponse;

  beforeEach(() => {
    engine = new ScriptEngine();
    
    mockResponse = {
      status: 200,
      statusText: 'OK',
      headers: {
        'Content-Type': 'application/json',
        'X-Custom-Header': 'custom-value'
      },
      body: '{"userId": 123, "name": "Alice"}',
      duration: 145
    };

    context = {
      protocol: 'http',
      collectionInfo: { id: 'col-123', name: 'Test Collection' },
      iterationSource: 'none',
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
      currentResponse: mockResponse,
      currentRequest: undefined,
      executionHistory: [],
      options: {},
      protocolPlugin: mockProtocolPlugin,
      cookieJar: FakeJar,
      abortSignal: new AbortController().signal
    };
  });

  // ========================================================================
  // Section 4.1: Status
  // ========================================================================
  
  describe('4.1 Status', () => {
    test('quest.response.status is correct for 2xx', async () => {
      mockResponse.status = 200;
      mockResponse.statusText = 'OK';
      
      const script = `
        quest.test('Status code is 200', () => {
          expect(quest.response.status).to.equal(200);
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('quest.response.status is correct for 4xx', async () => {
      mockResponse.status = 404;
      mockResponse.statusText = 'Not Found';
      
      const script = `
        quest.test('Status code is 404', () => {
          expect(quest.response.status).to.equal(404);
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('quest.response.status is correct for 5xx', async () => {
      mockResponse.status = 500;
      mockResponse.statusText = 'Internal Server Error';
      
      const script = `
        quest.test('Status code is 500', () => {
          expect(quest.response.status).to.equal(500);
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('quest.response.statusText is populated', async () => {
      mockResponse.status = 200;
      mockResponse.statusText = 'OK';
      
      const script = `
        quest.test('Status text is OK', () => {
          expect(quest.response.statusText).to.equal('OK');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 4.2: Body parsing
  // ========================================================================
  
  describe('4.2 Body parsing', () => {
    test('quest.response.body is raw response body string', async () => {
      const script = `
        quest.test('Body is raw string', () => {
          expect(quest.response.body).to.be.a('string');
          expect(quest.response.body).to.equal('{"userId": 123, "name": "Alice"}');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('quest.response.text() aliases .body', async () => {
      const script = `
        quest.test('text() returns same as body', () => {
          expect(quest.response.text()).to.equal(quest.response.body);
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('quest.response.json() returns parsed object for valid JSON', async () => {
      const script = `
        const data = quest.response.json();
        
        quest.test('json() parses valid JSON', () => {
          expect(data).to.be.an('object');
          expect(data.userId).to.equal(123);
          expect(data.name).to.equal('Alice');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('quest.response.json() returns {} for invalid JSON', async () => {
      mockResponse.body = 'not valid json {';
      
      const script = `
        const data = quest.response.json();
        
        quest.test('json() returns empty object for invalid JSON', () => {
          expect(data).to.deep.equal({});
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 4.3: Headers
  // ========================================================================
  
  describe('4.3 Headers', () => {
    test('get(name) returns header value', async () => {
      const script = `
        quest.test('Get header works', () => {
          expect(quest.response.headers.get('Content-Type')).to.equal('application/json');
          expect(quest.response.headers.get('X-Custom-Header')).to.equal('custom-value');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('get(name) is case-insensitive', async () => {
      const script = `
        quest.test('Get is case-insensitive', () => {
          expect(quest.response.headers.get('content-type')).to.equal('application/json');
          expect(quest.response.headers.get('CONTENT-TYPE')).to.equal('application/json');
          expect(quest.response.headers.get('x-custom-header')).to.equal('custom-value');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('get(name) returns null for missing header', async () => {
      const script = `
        quest.test('Get returns null for missing', () => {
          expect(quest.response.headers.get('X-Missing')).to.be.null;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('has(name) returns true/false', async () => {
      const script = `
        quest.test('Has works correctly', () => {
          expect(quest.response.headers.has('Content-Type')).to.be.true;
          expect(quest.response.headers.has('X-Missing')).to.be.false;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('has(name) is case-insensitive', async () => {
      const script = `
        quest.test('Has is case-insensitive', () => {
          expect(quest.response.headers.has('content-type')).to.be.true;
          expect(quest.response.headers.has('CONTENT-TYPE')).to.be.true;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('toObject() returns all headers', async () => {
      const script = `
        const headers = quest.response.headers.toObject();
        
        quest.test('ToObject returns all headers', () => {
          expect(headers).to.have.property('Content-Type');
          expect(headers).to.have.property('X-Custom-Header');
          expect(headers['Content-Type']).to.equal('application/json');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 4.4: Metrics
  // ========================================================================
  
  describe('4.4 Metrics', () => {
    test('quest.response.time is measured in ms and >= 0', async () => {
      mockResponse.duration = 145;
      
      const script = `
        quest.test('Time is valid', () => {
          expect(quest.response.time).to.be.a('number');
          expect(quest.response.time).to.equal(145);
          expect(quest.response.time).to.be.at.least(0);
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('quest.response.size is bytes of response body', async () => {
      const bodyContent = '{"userId": 123, "name": "Alice"}';
      mockResponse.body = bodyContent;
      
      const script = `
        quest.test('Size equals body length', () => {
          expect(quest.response.size).to.equal(${bodyContent.length});
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 4.5: Assertion helpers
  // ========================================================================
  
  describe('4.5 Assertion helpers', () => {
    test('.to.be.ok is true iff status === 200', async () => {
      mockResponse.status = 200;
      
      const script = `
        quest.test('to.be.ok true for 200', () => {
          expect(quest.response.to.be.ok).to.be.true;
        });
      `;
      
      let result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);

      // Test false for non-200
      mockResponse.status = 201;
      
      const script2 = `
        quest.test('to.be.ok false for 201', () => {
          expect(quest.response.to.be.ok).to.be.false;
        });
      `;
      
      result = await engine.execute(script2, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('.to.be.success is true iff 2xx', async () => {
      const script200 = `
        quest.test('success true for 200', () => {
          expect(quest.response.to.be.success).to.be.true;
        });
      `;
      
      mockResponse.status = 200;
      let result = await engine.execute(script200, context, 'request-post' as ScriptType, () => { });
      expect(result.tests[0]?.passed).toBe(true);

      mockResponse.status = 201;
      result = await engine.execute(script200.replace('200', '201'), context, 'request-post' as ScriptType, () => { });
      expect(result.tests[0]?.passed).toBe(true);

      mockResponse.status = 299;
      result = await engine.execute(script200.replace('200', '299'), context, 'request-post' as ScriptType, () => { });
      expect(result.tests[0]?.passed).toBe(true);

      // False for 300
      mockResponse.status = 300;
      const scriptFalse = `
        quest.test('success false for 300', () => {
          expect(quest.response.to.be.success).to.be.false;
        });
      `;
      result = await engine.execute(scriptFalse, context, 'request-post' as ScriptType, () => { });
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('.to.be.clientError is true iff 4xx', async () => {
      mockResponse.status = 400;
      
      const script = `
        quest.test('clientError true for 4xx', () => {
          expect(quest.response.to.be.clientError).to.be.true;
        });
      `;
      
      let result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.tests[0]?.passed).toBe(true);

      mockResponse.status = 404;
      result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.tests[0]?.passed).toBe(true);

      // False for non-4xx
      mockResponse.status = 500;
      const scriptFalse = `
        quest.test('clientError false for 500', () => {
          expect(quest.response.to.be.clientError).to.be.false;
        });
      `;
      result = await engine.execute(scriptFalse, context, 'request-post' as ScriptType, () => { });
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('.to.be.serverError is true iff 5xx', async () => {
      mockResponse.status = 500;
      
      const script = `
        quest.test('serverError true for 5xx', () => {
          expect(quest.response.to.be.serverError).to.be.true;
        });
      `;
      
      let result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.tests[0]?.passed).toBe(true);

      mockResponse.status = 503;
      result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.tests[0]?.passed).toBe(true);

      // False for non-5xx
      mockResponse.status = 404;
      const scriptFalse = `
        quest.test('serverError false for 404', () => {
          expect(quest.response.to.be.serverError).to.be.false;
        });
      `;
      result = await engine.execute(scriptFalse, context, 'request-post' as ScriptType, () => { });
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('.to.have.status(code) matches status code', async () => {
      mockResponse.status = 200;
      
      const script = `
        quest.test('to.have.status matches', () => {
          expect(quest.response.to.have.status(200)).to.be.true;
          expect(quest.response.to.have.status(404)).to.be.false;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('.to.have.header(name) checks header existence (case-insensitive)', async () => {
      const script = `
        quest.test('to.have.header works', () => {
          expect(quest.response.to.have.header('Content-Type')).to.be.true;
          expect(quest.response.to.have.header('content-type')).to.be.true;
          expect(quest.response.to.have.header('X-Missing')).to.be.false;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('.to.have.jsonBody(field) checks JSON field existence', async () => {
      mockResponse.body = '{"userId": 123, "name": "Alice"}';
      
      const script = `
        quest.test('to.have.jsonBody works', () => {
          expect(quest.response.to.have.jsonBody('userId')).to.be.true;
          expect(quest.response.to.have.jsonBody('name')).to.be.true;
          expect(quest.response.to.have.jsonBody('missing')).to.be.false;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('.to.have.jsonBody returns false for invalid JSON', async () => {
      mockResponse.body = 'not json';
      
      const script = `
        quest.test('to.have.jsonBody false for invalid JSON', () => {
          expect(quest.response.to.have.jsonBody('anything')).to.be.false;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });
});


