/**
 * Test Plan Section 12: quest.cookies
 * Tests for cookie API and cookie management
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { ScriptEngine } from '../src/ScriptEngine.js';
import type { ExecutionContext, ScriptType } from '@apiquest/types';
import { mockProtocolPlugin, buildScopeChain } from './test-helpers.js';
import { CookieJar } from '../src/CookieJar.js';

type ResponseWithHeaders = {
  headers?: Record<string, string | string[]>;
};

const getSetCookieHeaders = (
  response: ExecutionContext['currentResponse']
): string | string[] | null | undefined => {
  if (response === undefined || response === null || typeof response !== 'object') {
    return undefined;
  }

  const headers = (response as ResponseWithHeaders).headers;
  return headers?.['set-cookie'];
};

describe('Section 12: quest.cookies', () => {
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
      cookieJar: new CookieJar({ persist: false }),
      protocolPlugin: mockProtocolPlugin,
      abortSignal: new AbortController().signal
    };
  });

  // ========================================================================
  // Section 12.1: quest.cookies.get()
  // ========================================================================
  
  describe('12.1 get()', () => {
    test('get() returns cookie value when present', async () => {
      context.currentResponse = {
        status: 200,
        statusText: 'OK',
        body: '',
        headers: {
          'set-cookie': 'sessionId=abc123; Path=/; HttpOnly'
        },
        duration: 100
      };
      context.cookieJar.store(getSetCookieHeaders(context.currentResponse), 'http://localhost/');
      
      const script = `
        quest.test('Cookie retrieved', () => {
          const value = quest.cookies.get('sessionId');
          expect(value).to.equal('abc123');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('get() returns null when cookie not present', async () => {
      context.currentResponse = {
        status: 200,
        statusText: 'OK',
        body: '',
        headers: {},
        duration: 100
      };
      context.cookieJar.store(getSetCookieHeaders(context.currentResponse), 'http://localhost/');
      
      const script = `
        quest.test('No cookie returns null', () => {
          const value = quest.cookies.get('missing');
          expect(value).to.be.null;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('get() handles multiple cookies', async () => {
      context.currentResponse = {
        status: 200,
        statusText: 'OK',
        body: '',
        headers: {
          'set-cookie': [
            'sessionId=abc123; Path=/',
            'userId=user456; Path=/',
            'theme=dark; Path=/'
          ]
        },
        duration: 100
      };
      context.cookieJar.store(getSetCookieHeaders(context.currentResponse), 'http://localhost/');
      
      const script = `
        quest.test('Multiple cookies retrieved', () => {
          expect(quest.cookies.get('sessionId')).to.equal('abc123');
          expect(quest.cookies.get('userId')).to.equal('user456');
          expect(quest.cookies.get('theme')).to.equal('dark');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('get() parses cookie with attributes', async () => {
      context.currentResponse = {
        status: 200,
        statusText: 'OK',
        body: '',
        headers: {
          'set-cookie': 'token=xyz789; Path=/api; Secure; HttpOnly; SameSite=Strict'
        },
        duration: 100
      };
      context.cookieJar.store(getSetCookieHeaders(context.currentResponse), 'http://localhost/');
      
      const script = `
        quest.test('Cookie value extracted correctly', () => {
          const value = quest.cookies.get('token');
          expect(value).to.equal('xyz789');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 12.2: quest.cookies.has()
  // ========================================================================
  
  describe('12.2 has()', () => {
    test('has() returns true when cookie exists', async () => {
      context.currentResponse = {
        status: 200,
        statusText: 'OK',
        body: '',
        headers: {
          'set-cookie': 'auth=token123; Path=/'
        },
        duration: 100
      };
      context.cookieJar.store(getSetCookieHeaders(context.currentResponse), 'http://localhost/');
      
      const script = `
        quest.test('Cookie exists', () => {
          expect(quest.cookies.has('auth')).to.be.true;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('has() returns false when cookie does not exist', async () => {
      context.currentResponse = {
        status: 200,
        statusText: 'OK',
        body: '',
        headers: {},
        duration: 100
      };
      context.cookieJar.store(getSetCookieHeaders(context.currentResponse), 'http://localhost/');
      
      const script = `
        quest.test('Cookie does not exist', () => {
          expect(quest.cookies.has('nonexistent')).to.be.false;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('has() checks against set-cookie header', async () => {
      context.currentResponse = {
        status: 200,
        statusText: 'OK',
        body: '',
        headers: {
          'set-cookie': [
            'cookie1=value1',
            'cookie2=value2'
          ]
        },
        duration: 100
      };
      context.cookieJar.store(getSetCookieHeaders(context.currentResponse), 'http://localhost/');
      
      const script = `
        quest.test('Multiple cookie check', () => {
          expect(quest.cookies.has('cookie1')).to.be.true;
          expect(quest.cookies.has('cookie2')).to.be.true;
          expect(quest.cookies.has('cookie3')).to.be.false;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 12.3: quest.cookies.toObject()
  // ========================================================================
  
  describe('12.3 toObject()', () => {
    test('toObject() returns all cookies as object', async () => {
      context.currentResponse = {
        status: 200,
        statusText: 'OK',
        body: '',
        headers: {
          'set-cookie': [
            'session=abc',
            'user=john',
            'theme=dark'
          ]
        },
        duration: 100
      };
      context.cookieJar.store(getSetCookieHeaders(context.currentResponse), 'http://localhost/');
      
      const script = `
        const cookies = quest.cookies.toObject();
        
        quest.test('All cookies in object', () => {
          expect(cookies).to.be.an('object');
          expect(cookies).to.have.property('session');
          expect(cookies).to.have.property('user');
          expect(cookies).to.have.property('theme');
          expect(cookies.session).to.equal('abc');
          expect(cookies.user).to.equal('john');
          expect(cookies.theme).to.equal('dark');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('toObject() returns empty object when no cookies', async () => {
      context.currentResponse = {
        status: 200,
        statusText: 'OK',
        body: '',
        headers: {},
        duration: 100
      };
      context.cookieJar.store(getSetCookieHeaders(context.currentResponse), 'http://localhost/');
      
      const script = `
        const cookies = quest.cookies.toObject();
        
        quest.test('Empty object', () => {
          expect(cookies).to.be.an('object');
          expect(Object.keys(cookies).length).to.equal(0);
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('toObject() can be used for iteration', async () => {
      context.currentResponse = {
        status: 200,
        statusText: 'OK',
        body: '',
        headers: {
          'set-cookie': [
            'key1=value1',
            'key2=value2'
          ]
        },
        duration: 100
      };
      context.cookieJar.store(getSetCookieHeaders(context.currentResponse), 'http://localhost/');
      
      const script = `
        const cookies = quest.cookies.toObject();
        const names = Object.keys(cookies);
        
        quest.test('Can iterate cookies', () => {
          expect(names.length).to.equal(2);
          expect(names).to.include('key1');
          expect(names).to.include('key2');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 12.4: quest.cookies.clear()
  // ========================================================================
  
  describe('12.4 cookies.clear()', () => {
    test('cookies.clear() removes set-cookie header', async () => {
      context.currentResponse = {
        status: 200,
        statusText: 'OK',
        body: '',
        headers: {
          'set-cookie': 'session=abc123',
          'content-type': 'application/json'
        },
        duration: 100
      };
      context.cookieJar.store(getSetCookieHeaders(context.currentResponse), 'http://localhost/');
      
      const script = `
        // Verify cookie exists
        quest.test('Cookie exists before clear', () => {
          expect(quest.cookies.has('session')).to.be.true;
        });
        
        // Clear jar
        quest.cookies.clear();
        
        // Verify cookie is gone
        quest.test('Cookie cleared', () => {
          expect(quest.cookies.has('session')).to.be.false;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests.every(t => t.passed)).toBe(true);
      
      // Verify cookie jar is clear
      expect(context.cookieJar.toObject()).toEqual({});
      expect(context.cookieJar.has('session')).toBe(false);
    });

    test('cookies.clear() preserves other headers', async () => {
      context.currentResponse = {
        status: 200,
        statusText: 'OK',
        body: '',
        headers: {
          'set-cookie': 'session=abc',
          'content-type': 'application/json',
          'x-custom-header': 'value'
        },
        duration: 100
      };
      context.cookieJar.store(getSetCookieHeaders(context.currentResponse), 'http://localhost/');
      
      const script = `
        quest.cookies.clear();
        
        quest.test('Other headers preserved', () => {
          expect(quest.response.headers.has('content-type')).to.be.true;
          expect(quest.response.headers.has('x-custom-header')).to.be.true;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('cookies.clear() safe when no cookies present', async () => {
      context.currentResponse = {
        status: 200,
        statusText: 'OK',
        body: '',
        headers: {},
        duration: 100
      };
      context.cookieJar.store(getSetCookieHeaders(context.currentResponse), 'http://localhost/');
      
      const script = `
        quest.cookies.clear();
        
        quest.test('Clear succeeds', () => {
          expect(quest.cookies.has('anything')).to.be.false;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 12.5: Cookie use cases
  // ========================================================================
  
  describe('12.5 Cookie use cases', () => {
    test('Extract session cookie and store in variable', async () => {
      context.currentResponse = {
        status: 200,
        statusText: 'OK',
        body: '',
        headers: {
          'set-cookie': 'sessionId=xyz789; Path=/; HttpOnly'
        },
        duration: 100
      };
      context.cookieJar.store(getSetCookieHeaders(context.currentResponse), 'http://localhost/');
      
      const script = `
        const sessionId = quest.cookies.get('sessionId');
        quest.global.variables.set('sessionId', sessionId);
        
        quest.test('Session ID stored', () => {
          expect(quest.global.variables.get('sessionId')).to.equal('xyz789');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Validate cookie attributes presence', async () => {
      context.currentResponse = {
        status: 200,
        statusText: 'OK',
        body: '',
        headers: {
          'set-cookie': 'auth=token; Path=/; Secure; HttpOnly; SameSite=Strict'
        },
        duration: 100
      };
      context.cookieJar.store(getSetCookieHeaders(context.currentResponse), 'http://localhost/');
      
      const script = `
        const cookieHeader = quest.response.headers.get('set-cookie');
        
        quest.test('Cookie has security attributes', () => {
          expect(cookieHeader).to.include('Secure');
          expect(cookieHeader).to.include('HttpOnly');
          expect(cookieHeader).to.include('SameSite=Strict');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Check for specific cookie in login response', async () => {
      context.currentResponse = {
        status: 200,
        statusText: 'OK',
        body: '{"success": true}',
        headers: {
          'set-cookie': [
            'sessionId=abc123',
            'userId=user456',
            'csrfToken=csrf789'
          ]
        },
        duration: 100
      };
      context.cookieJar.store(getSetCookieHeaders(context.currentResponse), 'http://localhost/');
      
      const script = `
        quest.test('Login sets required cookies', () => {
          expect(quest.cookies.has('sessionId')).to.be.true;
          expect(quest.cookies.has('userId')).to.be.true;
          expect(quest.cookies.has('csrfToken')).to.be.true;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Count number of cookies set', async () => {
      context.currentResponse = {
        status: 200,
        statusText: 'OK',
        body: '',
        headers: {
          'set-cookie': [
            'cookie1=value1',
            'cookie2=value2',
            'cookie3=value3',
            'cookie4=value4'
          ]
        },
        duration: 100
      };
      context.cookieJar.store(getSetCookieHeaders(context.currentResponse), 'http://localhost/');
      
      const script = `
        const cookies = quest.cookies.toObject();
        const count = Object.keys(cookies).length;
        
        quest.test('Correct number of cookies', () => {
          expect(count).to.equal(4);
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });
});




