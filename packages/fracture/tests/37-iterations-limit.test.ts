// Section 37: Iterations Limit Tests
// Tests that the --iterations CLI option correctly limits iteration execution

import { describe, test, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { CollectionRunner } from '../src/CollectionRunner.js';
import { mockOptionsPlugin } from './test-helpers.js';
import type { Collection } from '@apiquest/types';
import { createTestServer, type MockHttpServer } from './test-helpers.js';

describe('Section 37: Iterations Limit (--iterations)', () => {
  let runner: CollectionRunner;
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
    runner = new CollectionRunner();
    runner.registerPlugin(mockOptionsPlugin);
  });

  const createCollectionWithData = (dataRows: number): Collection => {
    const testData = Array.from({ length: dataRows }, (_, i) => ({
      userId: i + 1,
      userName: `user${i + 1}`
    }));

    return {
      info: { id: 'iter-test', name: 'Iterations Test', version: '1.0.0' },
      protocol: 'mock-options',
      testData,
      items: [{
        type: 'request',
        id: 'req-1',
        name: 'Test Request',
        data: { method: 'GET', url: `${serverUrl}/status/200` },
        postRequestScript: `
          quest.test('iteration test', () => {
            expect(quest.iteration.data.get('userId')).to.be.a('number');
          });
        `
      }]
    };
  };

  const createCollectionNoData = (): Collection => ({
    info: { id: 'iter-test-no-data', name: 'No Data Iterations Test', version: '1.0.0' },
    protocol: 'mock-options',
    items: [{
      type: 'request',
      id: 'req-1',
      name: 'Test Request',
      data: { method: 'GET', url: `${serverUrl}/status/200` },
      postRequestScript: `
        quest.test('simple test', () => {
          expect(quest.response.status).to.equal(200);
        });
      `
    }]
  });

  describe('37.1 With Collection Data', () => {
    test('Limits to first N rows when iterations < data length', async () => {
      const collection = createCollectionWithData(10);
      const result = await runner.run(collection, { 
        iterations: 3,
        strictMode: false 
      });
      
      // Should run only 3 iterations instead of 10
      expect(result.requestResults.length).toBe(3);
      expect(result.passedTests).toBe(3);
      expect(result.failedTests).toBe(0);
    });

    test('Uses all data when iterations > data length', async () => {
      const collection = createCollectionWithData(5);
      const result = await runner.run(collection, { 
        iterations: 10,
        strictMode: false 
      });
      
      // Should run only 5 iterations (all available data)
      expect(result.requestResults.length).toBe(5);
      expect(result.passedTests).toBe(5);
    });

    test('iterations: 1 runs only first row', async () => {
      const collection = createCollectionWithData(100);
      const result = await runner.run(collection, {
        iterations: 1,
        strictMode: false
      });

      // Should run only first iteration
      expect(result.requestResults.length).toBe(1);
      expect(result.passedTests).toBe(1);
    });

    test('iterations: equal to data length runs all rows', async () => {
      const collection = createCollectionWithData(7);
      const result = await runner.run(collection, {
        iterations: 7,
        strictMode: false
      });

      // Should run all 7 iterations
      expect(result.requestResults.length).toBe(7);
      expect(result.passedTests).toBe(7);
    });

    test('No iterations option runs all data (default)', async () => {
      const collection = createCollectionWithData(5);
      const result = await runner.run(collection, {
        strictMode: false
      });

      // Should run all 5 iterations by default
      expect(result.requestResults.length).toBe(5);
      expect(result.passedTests).toBe(5);
    });
  });

  describe('37.2 With CLI Data Override', () => {
    test('Limits CLI data to first N rows', async () => {
      const collection = createCollectionNoData();
      const cliData = Array.from({ length: 15 }, (_, i) => ({
        itemId: i + 1,
        itemName: `item${i + 1}`
      }));

      const result = await runner.run(collection, {
        data: cliData,
        iterations: 7,
        strictMode: false
      });

      // Should run only 7 iterations instead of 15
      expect(result.requestResults.length).toBe(7);
      expect(result.passedTests).toBe(7);
    });

    test('CLI data overrides collection data with iterations limit', async () => {
      // Create collection that can work with any data
      const collection: Collection = {
        info: { id: 'cli-override', name: 'CLI Override Test', version: '1.0.0' },
        protocol: 'mock-options',
        testData: Array.from({ length: 10 }, (_, i) => ({ userId: i + 1 })),
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: `${serverUrl}/status/200` },
          postRequestScript: `
            quest.test('CLI data is used', () => {
              // CLI data has userId to match collection structure, check values
              const userId = quest.iteration.data.get('userId');
              expect(userId).to.be.a('number');
              expect(userId).to.be.greaterThan(100); // CLI data starts at 101
            });
          `
        }]
      };

      const cliData = Array.from({ length: 8 }, (_, i) => ({
        userId: i + 101 // Different value range to verify CLI override
      }));

      const result = await runner.run(collection, {
        data: cliData,
        iterations: 3,
        strictMode: false
      });

      // Should use CLI data (8 rows) limited to 3
      expect(result.requestResults.length).toBe(3);
      expect(result.passedTests).toBe(3);
    });

    test('CLI data with no iterations uses all CLI data', async () => {
      // Create collection that can work with any data
      const collection: Collection = {
        info: { id: 'cli-no-iter', name: 'CLI No Iter Test', version: '1.0.0' },
        protocol: 'mock-options',
        testData: Array.from({ length: 10 }, (_, i) => ({ userId: i + 1 })),
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: `${serverUrl}/status/200` },
          postRequestScript: `
            quest.test('CLI data is used', () => {
              expect(quest.iteration.data.get('cliId')).to.be.a('number');
            });
          `
        }]
      };

      const cliData = Array.from({ length: 4 }, (_, i) => ({
        cliId: i + 1
      }));

      const result = await runner.run(collection, {
        data: cliData,
        strictMode: false
      });

      // Should use all 4 CLI data rows
      expect(result.requestResults.length).toBe(4);
      expect(result.passedTests).toBe(4);
    });
  });

  describe('37.3 Without Data (Repetition Mode)', () => {
    test('Repeats collection N times', async () => {
      const collection = createCollectionNoData();
      const result = await runner.run(collection, {
        iterations: 5,
        strictMode: false
      });

      // Should repeat entire collection 5 times
      expect(result.requestResults.length).toBe(5);
      expect(result.passedTests).toBe(5);
    });

    test('iterations: 1 runs collection once', async () => {
      const collection = createCollectionNoData();
      const result = await runner.run(collection, {
        iterations: 1,
        strictMode: false
      });

      // Should run once
      expect(result.requestResults.length).toBe(1);
      expect(result.passedTests).toBe(1);
    });

    test('No iterations and no data runs once (default)', async () => {
      const collection = createCollectionNoData();
      const result = await runner.run(collection, {
        strictMode: false
      });

      // Should run once by default
      expect(result.requestResults.length).toBe(1);
      expect(result.passedTests).toBe(1);
    });

    test('Large iterations count repeats collection correctly', async () => {
      const collection = createCollectionNoData();
      const result = await runner.run(collection, {
        iterations: 20,
        strictMode: false
      });

      // Should repeat 20 times
      expect(result.requestResults.length).toBe(20);
      expect(result.passedTests).toBe(20);
    });
  });

  describe('37.4 Edge Cases', () => {
    test('Zero iterations is ignored (runs all data)', async () => {
      const collection = createCollectionWithData(5);
      const result = await runner.run(collection, {
        iterations: 0,
        strictMode: false
      });

      // iterations: 0 is ignored, should run all 5
      expect(result.requestResults.length).toBe(5);
      expect(result.passedTests).toBe(5);
    });

    test('Negative iterations is ignored (runs all data)', async () => {
      const collection = createCollectionWithData(4);
      const result = await runner.run(collection, {
        iterations: -1,
        strictMode: false
      });

      // iterations: -1 is ignored, should run all 4
      expect(result.requestResults.length).toBe(4);
      expect(result.passedTests).toBe(4);
    });

    test('Zero iterations without data runs once', async () => {
      const collection = createCollectionNoData();
      const result = await runner.run(collection, {
        iterations: 0,
        strictMode: false
      });

      // iterations: 0 is ignored, should run once (default)
      expect(result.requestResults.length).toBe(1);
      expect(result.passedTests).toBe(1);
    });

    test('Negative iterations without data runs once', async () => {
      const collection = createCollectionNoData();
      const result = await runner.run(collection, {
        iterations: -5,
        strictMode: false
      });

      // iterations: -5 is ignored, should run once (default)
      expect(result.requestResults.length).toBe(1);
      expect(result.passedTests).toBe(1);
    });
  });

  describe('37.5 Multiple Requests per Iteration', () => {
    test('Limits iterations with multiple requests', async () => {
      const collection: Collection = {
        info: { id: 'multi-req', name: 'Multi Request Test', version: '1.0.0' },
        protocol: 'mock-options',
        testData: Array.from({ length: 10 }, (_, i) => ({ id: i + 1 })),
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'First Request',
            data: { method: 'GET', url: `${serverUrl}/status/200` },
            postRequestScript: 'quest.test("test1", () => expect(true).to.be.true);'
          },
          {
            type: 'request',
            id: 'req-2',
            name: 'Second Request',
            data: { method: 'GET', url: `${serverUrl}/status/200` },
            postRequestScript: 'quest.test("test2", () => expect(true).to.be.true);'
          },
          {
            type: 'request',
            id: 'req-3',
            name: 'Third Request',
            data: { method: 'GET', url: `${serverUrl}/status/200` },
            postRequestScript: 'quest.test("test3", () => expect(true).to.be.true);'
          }
        ]
      };

      const result = await runner.run(collection, {
        iterations: 3,
        strictMode: false
      });

      // 3 iterations × 3 requests = 9 total request results
      expect(result.requestResults.length).toBe(9);
      expect(result.passedTests).toBe(9);
    });
  });

  describe('37.6 Iteration Context Validation', () => {
    test('iteration.count reflects limited count', async () => {
      const collection: Collection = {
        info: { id: 'ctx-test', name: 'Context Test', version: '1.0.0' },
        protocol: 'mock-options',
        testData: Array.from({ length: 10 }, (_, i) => ({ id: i + 1 })),
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: `${serverUrl}/status/200` },
          postRequestScript: `
            quest.test('iteration count is limited', () => {
              expect(quest.iteration.count).to.equal(3);
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        iterations: 3,
        strictMode: false
      });

      expect(result.requestResults.length).toBe(3);
      expect(result.passedTests).toBe(3);
    });

    test('iteration.current increments correctly with limit', async () => {
      const collection: Collection = {
        info: { id: 'current-test', name: 'Current Test', version: '1.0.0' },
        protocol: 'mock-options',
        testData: Array.from({ length: 10 }, (_, i) => ({ value: i + 1 })),
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: `${serverUrl}/status/200` },
          postRequestScript: `
            const expectedValue = quest.iteration.current;
            quest.test('iteration current matches expected', () => {
              expect(quest.iteration.data.get('value')).to.equal(expectedValue);
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        iterations: 5,
        strictMode: false
      });

      expect(result.requestResults.length).toBe(5);
      expect(result.passedTests).toBe(5);
    });
  });
});
