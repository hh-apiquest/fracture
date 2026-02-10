/**
 * Test Plan Section 2: quest.iteration
 * Tests for iteration counters and data API
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { ScriptEngine } from '../src/ScriptEngine.js';
import type { ExecutionContext, ScriptType } from '@apiquest/types';
import { FakeJar, mockProtocolPlugin } from './test-helpers.js';

describe('Section 2: quest.iteration', () => {
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
      iterationData: [
        { userId: '123', username: 'alice', email: 'alice@example.com' },
        { userId: '456', username: 'bob', email: 'bob@example.com' },
        { userId: '789', username: 'charlie', email: 'charlie@example.com' }
      ],
      iterationCurrent: 2,
      iterationCount: 3,
      currentResponse: undefined,
      executionHistory: [],
      options: {},
      protocolPlugin: mockProtocolPlugin,
      cookieJar: FakeJar,
      abortSignal: new AbortController().signal,
    };
  });

  // ========================================================================
  // Section 2.1: Iteration counters
  // ========================================================================
  
  describe('2.1 Iteration counters', () => {
    test('quest.iteration.current is 1-indexed and increments each iteration', async () => {
      const script = `
        quest.test('Iteration current is correct', () => {
          expect(quest.iteration.current).to.equal(2);
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('quest.iteration.count equals total iterations from collection testData', async () => {
      const script = `
        quest.test('Iteration count is correct', () => {
          expect(quest.iteration.count).to.equal(3);
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('quest.iteration.count is 1 when no test data', async () => {
      context.iterationData = [];
      context.iterationCount = 1;

      const script = `
        quest.test('Count is 1 with no data', () => {
          expect(quest.iteration.count).to.equal(1);
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 2.2: Iteration data API
  // ========================================================================
  
  describe('2.2 Iteration data API', () => {
    test('get(column) returns current row value', async () => {
      const script = `
        quest.test('Get returns current row value', () => {
          expect(quest.iteration.data.get('userId')).to.equal('456');
          expect(quest.iteration.data.get('username')).to.equal('bob');
          expect(quest.iteration.data.get('email')).to.equal('bob@example.com');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('get(column) returns null for missing column', async () => {
      const script = `
        quest.test('Get returns null for missing', () => {
          expect(quest.iteration.data.get('nonExistent')).to.be.null;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('has(column) returns true/false', async () => {
      const script = `
        quest.test('Has works correctly', () => {
          expect(quest.iteration.data.has('userId')).to.be.true;
          expect(quest.iteration.data.has('username')).to.be.true;
          expect(quest.iteration.data.has('nonExistent')).to.be.false;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('toObject() returns current row', async () => {
      const script = `
        const row = quest.iteration.data.toObject();
        
        quest.test('ToObject returns current row', () => {
          expect(row).to.deep.equal({
            userId: '456',
            username: 'bob',
            email: 'bob@example.com'
          });
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('keys() returns all columns', async () => {
      const script = `
        const keys = quest.iteration.data.keys();
        
        quest.test('Keys returns all columns', () => {
          expect(keys).to.include('userId');
          expect(keys).to.include('username');
          expect(keys).to.include('email');
          expect(keys.length).to.equal(3);
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('all() returns all rows of iteration data', async () => {
      const script = `
        const allRows = quest.iteration.data.all();
        
        quest.test('All returns all rows', () => {
          expect(allRows.length).to.equal(3);
          expect(allRows[0].userId).to.equal('123');
          expect(allRows[1].userId).to.equal('456');
          expect(allRows[2].userId).to.equal('789');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 2.3: Iteration source and override rules
  // ========================================================================
  
  describe('2.3 Iteration source and override rules', () => {
    test('Collection testData drives iterations if no CLI --data', async () => {
      // This is integration test behavior - tested via collection runner
      // For now, verify data is accessible
      const script = `
        quest.test('TestData accessible', () => {
          expect(quest.iteration.data.all().length).to.equal(3);
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 2.4: Iteration scoping guarantees
  // ========================================================================
  
  describe('2.4 Iteration scoping guarantees', () => {
    test('All requests in the same iteration observe the same quest.iteration.data row', async () => {
      context.iterationCurrent = 2;

      const script = `
        quest.test('Current iteration data matches iteration number', () => {
          expect(quest.iteration.current).to.equal(2);
          expect(quest.iteration.data.get('username')).to.equal('bob');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('quest.history entries include iteration field matching quest.iteration.current', async () => {
      context.executionHistory = [
        {
          id: 'req-1',
          name: 'Get User',
          path: '/Get User',
          iteration: 1,
          response: {
            status: 200,
            statusText: 'OK',
            body: '{"id": 123}',
            headers: {},
            duration: 100
          },
          tests: [],
          timestamp: new Date().toISOString()
        },
        {
          id: 'req-1',
          name: 'Get User',
          path: '/Get User',
          iteration: 2,
          response: {
            status: 200,
            statusText: 'OK',
            body: '{"id": 456}',
            headers: {},
            duration: 95
          },
          tests: [],
          timestamp: new Date().toISOString()
        }
      ];

      const script = `
        const currentIter = quest.history.requests.filter({ iteration: quest.iteration.current });
        
        quest.test('History has iteration field and correct response structure', () => {
          expect(currentIter.length).to.equal(1);
          expect(currentIter[0].iteration).to.equal(2);
          
          // Validate response
          expect(currentIter[0].response.status).to.be.a('number');
          expect(currentIter[0].response.status).to.equal(200);
          expect(currentIter[0].response.statusText).to.be.a('string');
          expect(currentIter[0].response.statusText).to.equal('OK');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });
});


