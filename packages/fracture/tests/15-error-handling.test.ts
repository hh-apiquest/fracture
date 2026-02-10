/**
 * Test Plan Section 15: Comprehensive Error Handling
 * Tests script errors, accessing non-existent properties, throwing, TypeErrors, ReferenceErrors
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { ScriptEngine } from '../src/ScriptEngine.js';
import type { ExecutionContext, ScriptType } from '@apiquest/types';
import { FakeJar, mockProtocolPlugin } from './test-helpers.js';

describe('Section 15: Comprehensive Error Handling', () => {
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
  // Section 15.1: Accessing null/undefined quest properties
  // ========================================================================

  describe('15.1 Accessing null/undefined quest properties', () => {
    test('Accessing quest.response when null returns null', async () => {
      // No currentResponse set - should be null
      // Using post-request script type so quest.test() is available
      const script = `
        quest.test('Response is null', () => {
          expect(quest.response).to.be.null;
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Accessing quest.response.body when response is null throws error', async () => {
      const script = `
        try {
          const body = quest.response.body;
          quest.fail('Should have thrown TypeError');
        } catch (error) {
          quest.test('Accessing null.body throws', () => {
            expect(error).to.be.instanceof(TypeError);
          });
        }
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Accessing non-existent variable returns null', async () => {
      const script = `
        const value = quest.variables.get('nonExistentKey');
        
        quest.test('Non-existent variable is null', () => {
          expect(value).to.be.null;
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Accessing non-existent request header returns null', async () => {
      context.currentRequest = {
        type: 'request',
        id: 'req-1',
        name: 'Test',
        data: { method: 'GET', url: 'https://example.com', headers: {} }
      };

      const script = `
        const header = quest.request.headers.get('NonExistentHeader');
        
        quest.test('Non-existent header is null', () => {
          expect(header).to.be.null;
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Accessing non-existent response header returns null', async () => {
      context.currentResponse = {
        status: 200,
        statusText: 'OK',
        body: '{}',
        headers: {},
        duration: 100
      };

      const script = `
        const header = quest.response.headers.get('NonExistentHeader');
        
        quest.test('Non-existent response header is null', () => {
          expect(header).to.be.null;
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 15.2: ReferenceErrors (undefined variables)
  // ========================================================================

  describe('15.2 ReferenceErrors', () => {
    test('Accessing undefined variable in script throws ReferenceError', async () => {
      const script = `
        try {
          const value = undefinedVariable;
          quest.fail('Should have thrown');
        } catch (error) {
          quest.test('Undefined variable throws ReferenceError', () => {
            expect(error).to.be.instanceof(ReferenceError);
            expect(error.message).to.include('undefinedVariable');
          });
        }
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Using undefined variable in test causes test failure', async () => {
      const script = `
        quest.test('Test with undefined variable', () => {
          expect(undefinedVar).to.equal('something');
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(false);
      expect(result.tests[0]?.error).toContain('undefinedVar');
    });
  });

  // ========================================================================
  // Section 15.3: TypeErrors
  // ========================================================================

  describe('15.3 TypeErrors', () => {
    test('Calling non-function throws TypeError', async () => {
      const script = `
        try {
          const notAFunction = 'string';
          notAFunction();
          quest.fail('Should have thrown');
        } catch (error) {
          quest.test('Calling non-function throws TypeError', () => {
            expect(error).to.be.instanceof(TypeError);
          });
        }
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Accessing property of null throws TypeError', async () => {
      const script = `
        try {
          const obj = null;
          const value = obj.property;
          quest.fail('Should have thrown');
        } catch (error) {
          quest.test('Accessing null property throws TypeError', () => {
            expect(error).to.be.instanceof(TypeError);
          });
        }
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Accessing property of undefined throws TypeError', async () => {
      const script = `
        try {
          const obj = undefined;
          const value = obj.property;
          quest.fail('Should have thrown');
        } catch (error) {
          quest.test('Accessing undefined property throws TypeError', () => {
            expect(error).to.be.instanceof(TypeError);
          });
        }
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 15.4: JSON parsing errors
  // ========================================================================

  describe('15.4 JSON parsing errors', () => {
    test('quest.response.json() returns {} for invalid JSON', async () => {
      context.currentResponse = {
        status: 200,
        statusText: 'OK',
        body: 'not valid json',
        headers: {},
        duration: 100
      };

      const script = `
        const data = quest.response.json();
        
        quest.test('Invalid JSON returns empty object', () => {
          expect(data).to.deep.equal({});
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Manual JSON.parse of invalid data throws SyntaxError', async () => {
      context.currentResponse = {
        status: 200,
        statusText: 'OK',
        body: 'invalid json',
        headers: {},
        duration: 100
      };

      const script = `
        try {
          const data = JSON.parse(quest.response.body);
          quest.fail('Should have thrown');
        } catch (error) {
          quest.test('JSON.parse throws SyntaxError', () => {
            expect(error).to.be.instanceof(SyntaxError);
          });
        }
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 15.5: Throwing custom errors
  // ========================================================================

  describe('15.5 Throwing custom errors', () => {
    test('Throwing Error stops script execution', async () => {
      const script = `
        console.log('Before throw');
        throw new Error('Custom error message');
        console.log('After throw'); // Won't execute
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Custom error message');
      expect(result.consoleOutput).toHaveLength(1);
      expect(result.consoleOutput[0]).toBe('Before throw');
    });

    test('Throwing string is caught as error', async () => {
      const script = `
        throw 'String error';
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('Throwing object is caught as error', async () => {
      const script = `
        throw {code: 500, message: 'Custom error'};
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('Error in test callback does not stop script execution', async () => {
      const script = `
        console.log('Before test');
        
        quest.test('Test that throws', () => {
          throw new Error('Test error');
        });
        
        console.log('After test');
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(false);
      expect(result.tests[0]?.error).toContain('Test error');
      expect(result.consoleOutput).toHaveLength(2);
      expect(result.consoleOutput[1]).toBe('After test');
    });
  });

  // ========================================================================
  // Section 15.6: Async errors
  // ========================================================================

  describe('15.6 Async errors', () => {
    test('Rejected promise is caught as error', async () => {
      const script = `
        await Promise.reject(new Error('Async error'));
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Async error');
    });

    test('Error in async function is caught', async () => {
      const script = `
        async function failing() {
          throw new Error('Async function error');
        }
        
        await failing();
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Async function error');
    });

    test('Unhandled rejection in test causes test failure', async () => {
      const script = `
        quest.test('Async test error', async () => {
          await Promise.reject(new Error('Test promise rejection'));
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(false);
      expect(result.tests[0]?.error).toContain('Test promise rejection');
    });
  });

  // ========================================================================
  // Section 15.7: Error recovery patterns
  // ========================================================================

  describe('15.7 Error recovery patterns', () => {
    test('Try-catch allows script to continue after error', async () => {
      const script = `
        let errorCaught = false;
        
        try {
          throw new Error('Intentional error');
        } catch (e) {
          errorCaught = true;
          console.log('Error caught');
        }
        
        quest.test('Script continued after caught error', () => {
          expect(errorCaught).to.be.true;
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
      expect(result.consoleOutput).toContain('Error caught');
    });

    test('Multiple try-catch blocks work correctly', async () => {
      const script = `
        let errors = [];
        
        try {
          throw new Error('Error 1');
        } catch (e) {
          errors.push(e.message);
        }
        
        try {
          throw new Error('Error 2');
        } catch (e) {
          errors.push(e.message);
        }
        
        quest.test('Both errors caught', () => {
          expect(errors.length).to.equal(2);
          expect(errors[0]).to.equal('Error 1');
          expect(errors[1]).to.equal('Error 2');
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Nested try-catch works', async () => {
      const script = `
        let outerCaught = false;
        let innerCaught = false;
        
        try {
          try {
            throw new Error('Inner error');
          } catch (inner) {
            innerCaught = true;
            throw new Error('Outer error');
          }
        } catch (outer) {
          outerCaught = true;
        }
        
        quest.test('Both catches executed', () => {
          expect(innerCaught).to.be.true;
          expect(outerCaught).to.be.true;
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 15.8: Error messages and stack traces
  // ========================================================================

  describe('15.8 Error messages and stack traces', () => {
    test('Error message is captured', async () => {
      const script = `
        throw new Error('Detailed error message with context');
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Detailed error message with context');
    });

    test('Error without message is handled', async () => {
      const script = `
        throw new Error();
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('Test error message is captured', async () => {
      const script = `
        quest.test('Test with detailed error', () => {
          throw new Error('Specific test failure reason');
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(false);
      expect(result.tests[0]?.error).toBe('Specific test failure reason');
    });
  });

  // ========================================================================
  // Section 15.9: Quest API error handling
  // ========================================================================

  describe('15.9 Quest API error handling', () => {
    test('quest.skip() outside test throws error', async () => {
      const script = `
        quest.skip('Should not be allowed');
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(false);
      expect(result.error).toContain('must be called inside quest.test()');
    });

    test('quest.fail() outside test throws error', async () => {
      const script = `
        quest.fail('Should not be allowed');
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(false);
      expect(result.error).toContain('must be called inside quest.test()');
    });

    test('quest.sendRequest without url throws error', async () => {
      const script = `
        try {
          await quest.sendRequest({ method: 'GET' });
          quest.fail('Should have thrown');
        } catch (error) {
          quest.test('Missing URL throws error', () => {
            expect(error.message).to.include('url');
          });
        }
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('quest.wait with invalid argument throws error', async () => {
      const script = `
        try {
          await quest.wait(-100);
          quest.fail('Should have thrown');
        } catch (error) {
          quest.test('Negative wait throws error', () => {
            expect(error.message).to.include('non-negative');
          });
        }
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });
});


