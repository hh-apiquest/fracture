/**
 * Test Plan Section 9: quest.history
 * Tests execution history tracking and querying
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { ScriptEngine } from '../src/ScriptEngine.js';
import type { ExecutionContext, ScriptType, ExecutionRecord } from '@apiquest/types';
import { FakeJar, mockProtocolPlugin } from './test-helpers.js';

describe('Section 9: quest.history', () => {
  let engine: ScriptEngine;
  let context: ExecutionContext;

  beforeEach(() => {
    engine = new ScriptEngine();
    
    context = {
      protocol: 'http',
      collectionInfo: {id : 'col-123', name: 'Test Collection' },
      iterationSource : 'none',
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

  // Helper to create ExecutionRecord with all required fields
  const createRecord = (partial: Partial<ExecutionRecord>): ExecutionRecord => ({
    tests: [],
    timestamp: '2026-01-06T12:00:00Z',
    ...partial
  } as ExecutionRecord);

  // ========================================================================
  // Section 9.1: quest.history.requests.count()
  // ========================================================================
  
  describe('9.1 count()', () => {
    test('count() returns 0 when no history', async () => {
      const script = `
        quest.test('No history', () => {
          expect(quest.history.requests.count()).to.equal(0);
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType,() => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('count() returns correct number', async () => {
      context.executionHistory = [
        createRecord({
          id: 'req-1',
          name: 'Request 1',
          path: '/folder/Request 1',
          iteration: 1,
          response: { status: 200, statusText: 'OK', body: '', headers: {}, duration: 100 }
        }),
        createRecord({
          id: 'req-2',
          name: 'Request 2',
          path: '/folder/Request 2',
          iteration: 1,
          response: { status: 201, statusText: 'Created', body: '', headers: {}, duration: 150 }
        })
      ];
      
      const script = `
        quest.test('Count returns 2', () => {
          expect(quest.history.requests.count()).to.equal(2);
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 9.2: quest.history.requests.get(idOrName)
  // ========================================================================
  
  describe('9.2 get(idOrName)', () => {
    beforeEach(() => {
      context.executionHistory = [
        createRecord({
          id: 'req-123',
          name: 'Get User',
          path: '/api/Get User',
          iteration: 1,
          response: {
            status: 200,
            statusText: 'OK',
            body: '{"id": 1, "name": "Alice"}',
            headers: { 'content-type': 'application/json' },
            duration: 120
          }
        }),
        createRecord({
          id: 'req-456',
          name: 'Create User',
          path: '/api/Create User',
          iteration: 1,
          response: {
            status: 201,
            statusText: 'Created',
            body: '{"id": 2}',
            headers: { 'content-type': 'application/json' },
            duration: 180
          }
        })
      ];
    });

    test('get() by id returns entry', async () => {
      const script = `
        const entry = quest.history.requests.get('req-123');
        
        quest.test('Found by id', () => {
          expect(entry).to.not.be.null;
          expect(entry.id).to.equal('req-123');
          expect(entry.name).to.equal('Get User');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('get() by name returns entry', async () => {
      const script = `
        const entry = quest.history.requests.get('Create User');
        
        quest.test('Found by name', () => {
          expect(entry).to.not.be.null;
          expect(entry.id).to.equal('req-456');
          expect(entry.name).to.equal('Create User');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('get() returns null when not found', async () => {
      const script = `
        const entry = quest.history.requests.get('nonexistent');
        
        quest.test('Not found returns null', () => {
          expect(entry).to.be.null;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('get() allows accessing response data', async () => {
      const script = `
        const entry = quest.history.requests.get('Get User');
        
        quest.test('Can access response', () => {
          expect(entry.response.status).to.equal(200);
          expect(entry.response.body).to.include('Alice');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 9.3: quest.history.requests.all()
  // ========================================================================
  
  describe('9.3 all()', () => {
    test('all() returns empty array when no history', async () => {
      const script = `
        const entries = quest.history.requests.all();
        
        quest.test('Empty history', () => {
          expect(entries).to.be.an('array');
          expect(entries.length).to.equal(0);
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('all() returns all entries', async () => {
      context.executionHistory = [
        createRecord({
          id: 'req-1',
          name: 'Request 1',
          path: '/Request 1',
          iteration: 1,
          response: { status: 200, statusText: 'OK', body: '', headers: {}, duration: 100 }
        }),
        createRecord({
          id: 'req-2',
          name: 'Request 2',
          path: '/Request 2',
          iteration: 1,
          response: { status: 200, statusText: 'OK', body: '', headers: {}, duration: 100 }
        }),
        createRecord({
          id: 'req-3',
          name: 'Request 3',
          path: '/Request 3',
          iteration: 1,
          response: { status: 200, statusText: 'OK', body: '', headers: {}, duration: 100 }
        })
      ];
      
      const script = `
        const entries = quest.history.requests.all();
        
        quest.test('All entries returned', () => {
          expect(entries.length).to.equal(3);
          expect(entries[0].name).to.equal('Request 1');
          expect(entries[1].name).to.equal('Request 2');
          expect(entries[2].name).to.equal('Request 3');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 9.4: quest.history.requests.last()
  // ========================================================================
  
  describe('9.4 last()', () => {
    test('last() returns null when no history', async () => {
      const script = `
        const entry = quest.history.requests.last();
        
        quest.test('No history returns null', () => {
          expect(entry).to.be.null;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('last() returns most recent entry', async () => {
      context.executionHistory = [
        createRecord({
          id: 'req-1',
          name: 'First',
          path: '/First',
          iteration: 1,
          response: { status: 200, statusText: 'OK', body: '', headers: {}, duration: 100 }
        }),
        createRecord({
          id: 'req-2',
          name: 'Second',
          path: '/Second',
          iteration: 1,
          response: { status: 200, statusText: 'OK', body: '', headers: {}, duration: 100 }
        }),
        createRecord({
          id: 'req-3',
          name: 'Third',
          path: '/Third',
          iteration: 1,
          response: { status: 200, statusText: 'OK', body: '', headers: {}, duration: 100 }
        })
      ];
      
      const script = `
        const entry = quest.history.requests.last();
        
        quest.test('Last entry returned', () => {
          expect(entry).to.not.be.null;
          expect(entry.name).to.equal('Third');
          expect(entry.id).to.equal('req-3');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 9.5: quest.history.requests.filter(criteria)
  // ========================================================================
  
  describe('9.5 filter(criteria)', () => {
    beforeEach(() => {
      context.executionHistory = [
        createRecord({
          id: 'req-1',
          name: 'Get User',
          path: '/api/users/Get User',
          iteration: 1,
          response: { status: 200, statusText: 'OK', body: '', headers: {}, duration: 100 }
        }),
        createRecord({
          id: 'req-2',
          name: 'Create User',
          path: '/api/users/Create User',
          iteration: 1,
          response: { status: 201, statusText: 'Created', body: '', headers: {}, duration: 150 }
        }),
        createRecord({
          id: 'req-3',
          name: 'Get User',
          path: '/api/users/Get User',
          iteration: 2,
          response: { status: 200, statusText: 'OK', body: '', headers: {}, duration: 110 }
        }),
        createRecord({
          id: 'req-4',
          name: 'Get Product',
          path: '/api/products/Get Product',
          iteration: 1,
          response: { status: 200, statusText: 'OK', body: '', headers: {}, duration: 90 }
        })
      ];
    });

    test('filter() by name', async () => {
      const script = `
        const entries = quest.history.requests.filter({ name: 'Get User' });
        
        quest.test('Filtered by name', () => {
          expect(entries.length).to.equal(2);
          expect(entries[0].name).to.equal('Get User');
          expect(entries[1].name).to.equal('Get User');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('filter() by iteration', async () => {
      const script = `
        const entries = quest.history.requests.filter({ iteration: 1 });
        
        quest.test('Filtered by iteration', () => {
          expect(entries.length).to.equal(3);
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('filter() by id', async () => {
      const script = `
        const entries = quest.history.requests.filter({ id: 'req-2' });
        
        quest.test('Filtered by id', () => {
          expect(entries.length).to.equal(1);
          expect(entries[0].id).to.equal('req-2');
          expect(entries[0].name).to.equal('Create User');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('filter() by path with wildcard', async () => {
      const script = `
        const entries = quest.history.requests.filter({ path: '/api/users/*' });
        
        quest.test('Filtered by path wildcard', () => {
          expect(entries.length).to.equal(3);
          expect(entries[0].path).to.include('/api/users/');
          expect(entries[1].path).to.include('/api/users/');
          expect(entries[2].path).to.include('/api/users/');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('filter() by multiple criteria', async () => {
      const script = `
        const entries = quest.history.requests.filter({ 
          name: 'Get User',
          iteration: 2 
        });
        
        quest.test('Filtered by multiple criteria', () => {
          expect(entries.length).to.equal(1);
          expect(entries[0].name).to.equal('Get User');
          expect(entries[0].iteration).to.equal(2);
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('filter() returns empty array when no matches', async () => {
      const script = `
        const entries = quest.history.requests.filter({ name: 'Nonexistent' });
        
        quest.test('No matches returns empty array', () => {
          expect(entries).to.be.an('array');
          expect(entries.length).to.equal(0);
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 9.6: History entry structure
  // ========================================================================
  
  describe('9.6 History entry structure', () => {
    test('Entry contains all expected fields', async () => {
      context.executionHistory = [
        createRecord({
          id: 'req-xyz',
          name: 'Test Request',
          path: '/folder/Test Request',
          iteration: 1,
          response: {
            status: 200,
            statusText: 'OK',
            body: '{"success": true}',
            headers: { 'content-type': 'application/json' },
            duration: 125
          }
        })
      ];
      
      const script = `
        const entry = quest.history.requests.last();
        
        quest.test('Entry has all fields', () => {
          expect(entry).to.have.property('id');
          expect(entry).to.have.property('name');
          expect(entry).to.have.property('path');
          expect(entry).to.have.property('iteration');
          expect(entry).to.have.property('response');
          
          expect(entry.response).to.have.property('status');
          expect(entry.response).to.have.property('statusText');
          expect(entry.response).to.have.property('body');
          expect(entry.response).to.have.property('headers');
          expect(entry.response).to.have.property('duration');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });
});


