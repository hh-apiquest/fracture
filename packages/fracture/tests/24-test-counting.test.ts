// Section 24: Deterministic Test Counting
// Tests expected test count calculation before execution

import { describe, test, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { CollectionRunner } from '../src/CollectionRunner.js';
import { mockOptionsPlugin } from './test-helpers.js';
import type { Collection, EventPayloads } from '@apiquest/types';
import { createTestServer, type MockHttpServer } from './test-helpers.js';

describe('Section 24: Deterministic Test Counting', () => {
  let runner: CollectionRunner;
  let expectedTestCount: number | undefined;
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
    
    // Capture expected test count from beforeRun event
    expectedTestCount = undefined;
    runner.on('beforeRun', ({ expectedTestCount: count }: EventPayloads['beforeRun']) => {
      expectedTestCount = count;
    });
  });

  describe('24.1 Basic Test Counting', () => {
    test('Counts single test in postRequestScript', async () => {
      const collection: Collection = {
        info: { id: 'col-1', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: '${serverUrl}/status/200' },
          postRequestScript: `
            quest.test('test 1', () => {
              expect(true).to.be.true;
            });
          `
        }]
      };

      await runner.run(collection);
      expect(expectedTestCount).toBe(1);
    });

    test('Counts multiple tests in single script', async () => {
      const collection: Collection = {
        info: { id: 'col-2', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: '${serverUrl}/status/200' },
          postRequestScript: `
            quest.test('test 1', () => {});
            quest.test('test 2', () => {});
            quest.test('test 3', () => {});
          `
        }]
      };

      await runner.run(collection);
      expect(expectedTestCount).toBe(3);
    });

    test('Counts tests across multiple requests', async () => {
      const collection: Collection = {
        info: { id: 'col-3', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Request 1',
          data: { method: 'GET', url: '${serverUrl}/status/200' },
          postRequestScript: `quest.test('test 1', () => {});`
        }, {
          type: 'request',
          id: 'req-2',
          name: 'Request 2',
          data: { method: 'GET', url: '${serverUrl}/status/200' },
          postRequestScript: `quest.test('test 2', () => {});
                              quest.test('test 3', () => {});`
        }]
      };

      await runner.run(collection);
      expect(expectedTestCount).toBe(3);
    });
  });

  describe('24.2 Folder-Level Test Counting', () => {
    test('Counts tests in nested folder structure', async () => {
      const collection: Collection = {
        info: { id: 'col-4', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'folder',
          id: 'folder-1',
          name: 'Folder 1',
          items: [{
            type: 'request',
            id: 'req-1',
            name: 'Request 1',
            data: { method: 'GET', url: '${serverUrl}/status/200' },
            postRequestScript: `quest.test('test 1', () => {});`
          }, {
            type: 'folder',
            id: 'folder-2',
            name: 'Folder 2',
            items: [{
              type: 'request',
              id: 'req-2',
              name: 'Request 2',
              data: { method: 'GET', url: '${serverUrl}/status/200' },
              postRequestScript: `quest.test('test 2', () => {});
                                  quest.test('test 3', () => {});`
            }]
          }]
        }]
      };

      await runner.run(collection);
      expect(expectedTestCount).toBe(3);
    });
  });

  describe('24.3 Iteration Multiplier', () => {
    test('Multiplies test count by iteration count', async () => {
      const collection: Collection = {
        info: { id: 'col-5', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        testData: [
          { iteration: 1 },
          { iteration: 2 },
          { iteration: 3 }
        ],
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: '${serverUrl}/status/200' },
          postRequestScript: `
            quest.test('test 1', () => {});
            quest.test('test 2', () => {});
          `
        }]
      };

      await runner.run(collection);
      expect(expectedTestCount).toBe(2 * 3);  // 2 tests * 3 iterations = 6
    });

    test('Handles single iteration (default)', async () => {
      const collection: Collection = {
        info: { id: 'col-6', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        // No testData - defaults to 1 iteration
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: '${serverUrl}/status/200' },
          postRequestScript: `
            quest.test('test 1', () => {});
          `
        }]
      };

      await runner.run(collection);
      expect(expectedTestCount).toBe(1);  // 1 test * 1 iteration = 1
    });
  });

  describe('24.4 Inherited Scripts', () => {
    test('Counts tests in collection-level postRequestScript', async () => {
      const collection: Collection = {
        info: { id: 'col-7', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        postRequestScript: `
          quest.test('collection-level test', () => {});
        `,
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Request 1',
          data: { method: 'GET', url: '${serverUrl}/status/200' }
        }, {
          type: 'request',
          id: 'req-2',
          name: 'Request 2',
          data: { method: 'GET', url: '${serverUrl}/status/200' }
        }]
      };

      await runner.run(collection);
      expect(expectedTestCount).toBe(2);
    });

    test('Counts tests in folder-level postRequestScript', async () => {
      const collection: Collection = {
        info: { id: 'col-8', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'folder',
          id: 'folder-1',
          name: 'Folder 1',
          postRequestScript: `
            quest.test('folder-level test', () => {});
          `,
          items: [{
            type: 'request',
            id: 'req-1',
            name: 'Request 1',
            data: { method: 'GET', url: '${serverUrl}/status/200' }
          }, {
            type: 'request',
            id: 'req-2',
            name: 'Request 2',
            data: { method: 'GET', url: '${serverUrl}/status/200' }
          }]
        }]
      };

      await runner.run(collection);
      expect(expectedTestCount).toBe(2);  // Folder script runs for each request in folder
    });

    test('Combines collection, folder, and request-level tests', async () => {
      const collection: Collection = {
        info: { id: 'col-9', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        postRequestScript: `quest.test('collection test', () => {});`,
        items: [{
          type: 'folder',
          id: 'folder-1',
          name: 'Folder 1',
          postRequestScript: `quest.test('folder test', () => {});`,
          items: [{
            type: 'request',
            id: 'req-1',
            name: 'Request 1',
            data: { method: 'GET', url: '${serverUrl}/status/200' },
            postRequestScript: `quest.test('request test', () => {});`
          }]
        }]
      };

      await runner.run(collection);
      expect(expectedTestCount).toBe(3);  // collection + folder + request = 3
    });

    test('Deep nesting: collection→folder→folder→request counts 4 tests', async () => {
      const collection: Collection = {
        info: { id: 'col-deep', name: 'Deep Nesting Test', version: '1.0.0' },
        protocol: 'mock-options',
        postRequestScript: `quest.test('collection test', () => {});`,
        items: [{
          type: 'folder',
          id: 'folder-1',
          name: 'Folder 1',
          postRequestScript: `quest.test('folder1 test', () => {});`,
          items: [{
            type: 'folder',
            id: 'folder-2',
            name: 'Folder 2',
            postRequestScript: `quest.test('folder2 test', () => {});`,
            items: [{
              type: 'request',
              id: 'req-1',
              name: 'Request 1',
              data: { method: 'GET', url: '${serverUrl}/status/200' },
              postRequestScript: `quest.test('request test', () => {});`
            }]
          }]
        }]
      };

      await runner.run(collection);
      expect(expectedTestCount).toBe(4);  // collection + folder1 + folder2 + request = 4 (stacked)
    });

      test('Deep nesting: collection 2 →folder 2 →folder 2 →request 2 counts 8 tests', async () => {
      const collection: Collection = {
        info: { id: 'col-deep', name: 'Deep Nesting Test', version: '1.0.0' },
        protocol: 'mock-options',
        postRequestScript: `quest.test('collection test 1', () => {}); quest.test('collection test 2', () => {});`,
        items: [{
          type: 'folder',
          id: 'folder-1',
          name: 'Folder 1',
          postRequestScript: `quest.test('folder1 test 1', () => {}); quest.test('folder1 test 2', () => {});`,
          items: [{
            type: 'folder',
            id: 'folder-2',
            name: 'Folder 2',
            postRequestScript: `quest.test('folder2 test 1', () => {}); quest.test('folder2 test 2', () => {});`,
            items: [{
              type: 'request',
              id: 'req-1',
              name: 'Request 1',
              data: { method: 'GET', url: '${serverUrl}/status/200' },
              postRequestScript: `quest.test('request test 1', () => {}); quest.test('request test 2', () => {});`
            }]
          }]
        }]
      };

      await runner.run(collection);
      expect(expectedTestCount).toBe(8);  // collection 2 + folder1 2 + folder2 2 + request 2 = 8 (stacked)
    });
  });

  describe('24.5 Zero Tests', () => {
    test('Returns 0 for collection with no tests', async () => {
      const collection: Collection = {
        info: { id: 'col-10', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: '${serverUrl}/status/200' }
        }]
      };

      await runner.run(collection);
      expect(expectedTestCount).toBe(0);
    });
  });

  describe('24.6 Complex Scenarios', () => {
    test('Handles mix of scripts with and without tests', async () => {
      const collection: Collection = {
        info: { id: 'col-11', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Request 1',
          data: { method: 'GET', url: '${serverUrl}/status/200' },
          preRequestScript: `//console.log('no tests here');`,
          postRequestScript: `quest.test('test 1', () => {});`
        }, {
          type: 'request',
          id: 'req-2',
          name: 'Request 2',
          data: { method: 'GET', url: '${serverUrl}/status/200' },
          postRequestScript: `//console.log('no tests here either');`
        }, {
          type: 'request',
          id: 'req-3',
          name: 'Request 3',
          data: { method: 'GET', url: '${serverUrl}/status/200' },
          postRequestScript: `quest.test('test 2', () => {});
                              quest.test('test 3', () => {});`
        }]
      };

      await runner.run(collection);
      expect(expectedTestCount).toBe(3);  // 1 + 0 + 2 = 3
    });

    test('Accurate count matches actual test execution', async () => {
      const collection: Collection = {
        info: { id: 'col-12', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        testData: [{ i: 1 }, { i: 2 }],
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: '${serverUrl}/status/200' },
          postRequestScript: `
            quest.test('test 1', () => { expect(true).to.be.true; });
            quest.test('test 2', () => { expect(true).to.be.true; });
          `
        }]
      };

      const result = await runner.run(collection);
      expect(expectedTestCount).toBe(4);  // 2 tests * 2 iterations
      expect(result.totalTests).toBe(4);  // Actual tests match expected
      expect(result.passedTests).toBe(4);
    });
  });
});


