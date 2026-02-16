/**
 * Test Plan Section 14: console output capture
 * Tests that console.log/error/warn/info are captured correctly
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { ScriptEngine } from '../src/ScriptEngine.js';
import type { ExecutionContext, ScriptType } from '@apiquest/types';
import { FakeJar, mockProtocolPlugin, buildScopeChain } from './test-helpers.js';

describe('Section 14: console output capture', () => {
  let engine: ScriptEngine;
  let context: ExecutionContext;

  beforeEach(() => {
    engine = new ScriptEngine();
    
    context = {
      collectionInfo: { id: 'col-123', name: 'Test Collection' },
      iterationSource: 'none',
      protocol: 'http',
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
  // Section 14.1: console.log capture
  // ========================================================================
  
  describe('14.1 console.log capture', () => {
    test('console.log messages are captured', async () => {
      const script = `
        console.log('Test message 1');
        console.log('Test message 2');
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.consoleOutput).toHaveLength(2);
      expect(result.consoleOutput[0]).toBe('Test message 1');
      expect(result.consoleOutput[1]).toBe('Test message 2');
    });

    test('console.log with multiple arguments concatenates them', async () => {
      const script = `
        console.log('Message', 123, true);
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.consoleOutput).toHaveLength(1);
      expect(result.consoleOutput[0]).toBe('Message 123 true');
    });

    test('console.log with objects converts to string', async () => {
      const script = `
        console.log('Object:', {key: 'value'});
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.consoleOutput).toHaveLength(1);
      expect(result.consoleOutput[0]).toContain('Object:');
      expect(result.consoleOutput[0]).toContain('"key"');
      expect(result.consoleOutput[0]).toContain('"value"');
    });
  });

  // ========================================================================
  // Section 14.2: console.error capture
  // ========================================================================
  
  describe('14.2 console.error capture', () => {
    test('console.error messages are captured with [ERROR] prefix', async () => {
      const script = `
        console.error('Error message');
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.consoleOutput).toHaveLength(1);
      expect(result.consoleOutput[0]).toBe('[ERROR] Error message');
    });

    test('console.error with multiple arguments', async () => {
      const script = `
        console.error('Error:', 404, 'Not Found');
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.consoleOutput).toHaveLength(1);
      expect(result.consoleOutput[0]).toBe('[ERROR] Error: 404 Not Found');
    });
  });

  // ========================================================================
  // Section 14.3: console.warn capture
  // ========================================================================
  
  describe('14.3 console.warn capture', () => {
    test('console.warn messages are captured with [WARN] prefix', async () => {
      const script = `
        console.warn('Warning message');
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.consoleOutput).toHaveLength(1);
      expect(result.consoleOutput[0]).toBe('[WARN] Warning message');
    });

    test('console.warn with multiple arguments', async () => {
      const script = `
        console.warn('Deprecation:', 'Old API');
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.consoleOutput).toHaveLength(1);
      expect(result.consoleOutput[0]).toBe('[WARN] Deprecation: Old API');
    });
  });

  // ========================================================================
  // Section 14.4: console.info capture
  // ========================================================================
  
  describe('14.4 console.info capture', () => {
    test('console.info messages are captured with [INFO] prefix', async () => {
      const script = `
        console.info('Info message');
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.consoleOutput).toHaveLength(1);
      expect(result.consoleOutput[0]).toBe('[INFO] Info message');
    });

    test('console.info with multiple arguments', async () => {
      const script = `
        console.info('Request:', 'GET /api/users');
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.consoleOutput).toHaveLength(1);
      expect(result.consoleOutput[0]).toBe('[INFO] Request: GET /api/users');
    });
  });

  // ========================================================================
  // Section 14.5: Mixed console output  
  // ========================================================================
  
  describe('14.5 Mixed console output', () => {
    test('Different console methods preserve order', async () => {
      const script = `
        console.log('Message 1');
        console.error('Error 1');
        console.warn('Warning 1');
        console.info('Info 1');
        console.log('Message 2');
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.consoleOutput).toHaveLength(5);
      expect(result.consoleOutput[0]).toBe('Message 1');
      expect(result.consoleOutput[1]).toBe('[ERROR] Error 1');
      expect(result.consoleOutput[2]).toBe('[WARN] Warning 1');
      expect(result.consoleOutput[3]).toBe('[INFO] Info 1');
      expect(result.consoleOutput[4]).toBe('Message 2');
    });

    test('Console output preserved even when script has test failures', async () => {
      const script = `
        console.log('Before test');
        
        quest.test('Failing test', () => {
          console.log('Inside test');
          expect(1).to.equal(2);
        });
        
        console.log('After test');
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(false);
      expect(result.consoleOutput).toHaveLength(3);
      expect(result.consoleOutput[0]).toBe('Before test');
      expect(result.consoleOutput[1]).toBe('Inside test');
      expect(result.consoleOutput[2]).toBe('After test');
    });

    test('Console output cleared between script executions', async () => {
      const script1 = `console.log('Script 1');`;
      const script2 = `console.log('Script 2');`;
      
      const result1 = await engine.execute(script1, context, 'request-post' as ScriptType, () => { });
      const result2 = await engine.execute(script2, context, 'request-post' as ScriptType, () => { });
      
      expect(result1.consoleOutput).toHaveLength(1);
      expect(result1.consoleOutput[0]).toBe('Script 1');
      
      expect(result2.consoleOutput).toHaveLength(1);
      expect(result2.consoleOutput[0]).toBe('Script 2');
    });
  });

  // ========================================================================
  // Section 14.6: Console output with variables
  // ========================================================================
  
  describe('14.6 Console output with variables', () => {
    test('Can log variable values', async () => {
      context.scope = buildScopeChain([
        { level: 'collection', id: 'col-123', vars: {} },
        { level: 'request', id: 'test', vars: {} }
      ]);
      
      const script = `
        quest.scope.variables.set('userId', '12345');
        const userId = quest.scope.variables.get('userId');
        console.log('User ID:', userId);
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.consoleOutput).toHaveLength(1);
      expect(result.consoleOutput[0]).toBe('User ID: 12345');
    });

    test('Can log iteration data', async () => {
      context.iterationData = [{ userId: '999', name: 'Test User' }];
      context.iterationCurrent = 1;
      
      const script = `
        console.log('Testing user:', quest.iteration.data.get('name'));
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.consoleOutput).toHaveLength(1);
      expect(result.consoleOutput[0]).toBe('Testing user: Test User');
    });

    test('Can log response status', async () => {
      context.currentResponse = {
        status: 200,
        statusText: 'OK',
        body: '{}',
        headers: {},
        duration: 100
      };
      
      const script = `
        console.log('Response status:', quest.response.status);
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.consoleOutput).toHaveLength(1);
      expect(result.consoleOutput[0]).toBe('Response status: 200');
    });
  });

  // ========================================================================
  // Section 14.7: Console output persists through errors
  // ========================================================================
  
  describe('14.7 Console output persists through errors', () => {
    test('Console output captured even when script throws error', async () => {
      const script = `
        console.log('Before error');
        throw new Error('Test error');
        console.log('After error'); // Won't execute
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Test error');
      expect(result.consoleOutput).toHaveLength(1);
      expect(result.consoleOutput[0]).toBe('Before error');
    });

    test('Console output from successful tests before error', async () => {
      const script = `
        console.log('Start');
        
        quest.test('Passing test', () => {
          console.log('In passing test');
          expect(1).to.equal(1);
        });
        
        console.log('Between tests');
        
        throw new Error('Script error');
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(false);
      expect(result.tests[0]?.passed).toBe(true);
      expect(result.consoleOutput).toHaveLength(3);
      expect(result.consoleOutput[0]).toBe('Start');
      expect(result.consoleOutput[1]).toBe('In passing test');
      expect(result.consoleOutput[2]).toBe('Between tests');
    });
  });
});


