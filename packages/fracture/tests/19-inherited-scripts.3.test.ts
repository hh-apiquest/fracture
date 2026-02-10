/**
 * Test Plan Section 17.8 (Part 19.3): Error Propagation & Execution Counts
 * Batches 7-8: Error handling and script execution count verification
 */

import { describe, test, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { CollectionRunner } from '../src/CollectionRunner.js';
import type { Collection } from '@apiquest/types';
import { mockOptionsPlugin } from './test-helpers.js';
import { createTestServer, type MockHttpServer } from './test-helpers.js';

describe('Section 19.3: Error Propagation & Execution Counts', () => {
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

  // ========================================================================
  // Batch 7: Error propagation (10 tests)
  // ========================================================================
  
  describe('19.7 Error propagation (fail fast)', () => {
    test('Error in collection.preRequest stops immediately', async () => {
      const collection: Collection = {
        info: { id: 'col-38', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        preRequestScript: `
          throw new Error('Collection preRequest error');
        `,
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Request',
            data: { method: 'GET', url: '${serverUrl}/status/200' }
          }
        ]
      };

      await expect(runner.run(collection)).rejects.toThrow('Collection preRequest error');
    });

    test('Error in folder.preRequest stops immediately', async () => {
      const collection: Collection = {
        info: { id: 'col-39', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'Folder',
            preRequestScript: `
              throw new Error('Folder preRequest error');
            `,
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'Request',
                data: { method: 'GET', url: '${serverUrl}/status/200' }
              }
            ]
          }
        ]
      };

      await expect(runner.run(collection)).rejects.toThrow('Folder preRequest error');
    });

    test('Error in request.preRequest stops immediately', async () => {
      const collection: Collection = {
        info: { id: 'col-40', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Request',
            data: { method: 'GET', url: '${serverUrl}/status/200' },
            preRequestScript: `
              throw new Error('Request preRequest error');
            `
          }
        ]
      };

      await expect(runner.run(collection)).rejects.toThrow(/script error|Request preRequest error/);
    });

    test('Error in request.postRequest stops immediately', async () => {
      const collection: Collection = {
        info: { id: 'col-41', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Request 1',
            data: { method: 'GET', url: '${serverUrl}/status/200' },
            postRequestScript: `
              throw new Error('Request postRequest error');
            `
          },
          {
            type: 'request',
            id: 'req-2',
            name: 'Request 2',
            data: { method: 'GET', url: '${serverUrl}/status/200' },
            postRequestScript: `
              quest.global.variables.set('req2Ran', 'yes');
            `
          }
        ]
      };

      const globalVars: Record<string, string> = {};
      await expect(runner.run(collection, { globalVariables: globalVars }))
        .rejects.toThrow(/script error|Request postRequest error/);
      
      // Request 2 should NOT have run
      expect(globalVars['req2Ran']).toBeUndefined();
    });

    test('Error in folder.postRequest stops immediately', async () => {
      const collection: Collection = {
        info: { id: 'col-42', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'Folder',
            postRequestScript: `
              throw new Error('Folder postRequest error');
            `,
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'Request',
                data: { method: 'GET', url: '${serverUrl}/status/200' }
              }
            ]
          }
        ]
      };

      await expect(runner.run(collection)).rejects.toThrow('Folder postRequest error');
    });

    test('Error in collection.postRequest stops immediately', async () => {
      const collection: Collection = {
        info: { id: 'col-43', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        postRequestScript: `
          throw new Error('Collection postRequest error');
        `,
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Request',
            data: { method: 'GET', url: '${serverUrl}/status/200' }
          }
        ]
      };

      await expect(runner.run(collection)).rejects.toThrow('Collection postRequest error');
    });

    test('Error shows which script layer failed', async () => {
      const collection: Collection = {
        info: { id: 'col-44', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        preRequestScript: `
          throw new Error('Specific layer error');
        `,
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Request',
            data: { method: 'GET', url: '${serverUrl}/status/200' }
          }
        ]
      };

      try {
        await runner.run(collection);
        expect.fail('Should have thrown error');
      } catch (error: unknown) {
        expect(error.message).toContain('Specific layer error');
      }
    });

    test('ReferenceError stops execution', async () => {
      const collection: Collection = {
        info: { id: 'col-45', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Request',
            data: { method: 'GET', url: '${serverUrl}/status/200' },
            preRequestScript: `
              // Reference non-existent variable
              const value = nonExistentVariable;
            `
          }
        ]
      };

      await expect(runner.run(collection)).rejects.toThrow();
    });

    test('TypeError stops execution', async () => {
      const collection: Collection = {
        info: { id: 'col-46', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Request',
            data: { method: 'GET', url: '${serverUrl}/status/200' },
            preRequestScript: `
              // Try to call undefined as function
              const obj = null;
              obj.someMethod();
            `
          }
        ]
      };

      await expect(runner.run(collection)).rejects.toThrow();
    });

    test('Any uncaught exception stops execution', async () => {
      const collection: Collection = {
        info: { id: 'col-47', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Request 1',
            data: { method: 'GET', url: '${serverUrl}/status/200' },
            postRequestScript: `
              quest.global.variables.set('req1Completed', 'yes');
              throw new Error('Unhandled exception');
            `
          },
          {
            type: 'request',
            id: 'req-2',
            name: 'Request 2',
            data: { method: 'GET', url: '${serverUrl}/status/200' },
            postRequestScript: `
              quest.global.variables.set('req2Ran', 'yes');
            `
          }
        ]
      };

      const globalVars: Record<string, string> = {};
      await expect(runner.run(collection, { globalVariables: globalVars }))
        .rejects.toThrow();
      
      // Request 1 ran, but Request 2 should NOT have
      expect(globalVars['req1Completed']).toBe('yes');
      expect(globalVars['req2Ran']).toBeUndefined();
    });
  });

  // ========================================================================
  // Batch 8: Script execution counts (4 tests)
  // ========================================================================
  
  describe('19.8 Script execution counts', () => {
    test('Collection preRequest runs N times for N requests', async () => {
      const collection: Collection = {
        info: { id: 'col-48', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        preRequestScript: `
          quest.global.variables.set('colPreCount', 
            String(parseInt(quest.global.variables.get('colPreCount') || '0') + 1)
          );
        `,
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Request 1',
            data: { method: 'GET', url: '${serverUrl}/status/200' }
          },
          {
            type: 'request',
            id: 'req-2',
            name: 'Request 2',
            data: { method: 'GET', url: '${serverUrl}/status/200' }
          },
          {
            type: 'request',
            id: 'req-3',
            name: 'Request 3',
            data: { method: 'GET', url: '${serverUrl}/status/200' }
          }
        ]
      };

      const globalVars: Record<string, string> = {};
      await runner.run(collection, { globalVariables: globalVars });

      // Collection pre should run 3 times (once per request)
      expect(globalVars['colPreCount']).toBe('3');
    });

    test('Folder preRequest runs M times for M requests in folder', async () => {
      const collection: Collection = {
        info: { id: 'col-49', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'Folder',
            preRequestScript: `
              quest.global.variables.set('folderPreCount', 
                String(parseInt(quest.global.variables.get('folderPreCount') || '0') + 1)
              );
            `,
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'Request 1',
                data: { method: 'GET', url: '${serverUrl}/status/200' }
              },
              {
                type: 'request',
                id: 'req-2',
                name: 'Request 2',
                data: { method: 'GET', url: '${serverUrl}/status/200' }
              },
              {
                type: 'request',
                id: 'req-3',
                name: 'Request 3',
                data: { method: 'GET', url: '${serverUrl}/status/200' }
              },
              {
                type: 'request',
                id: 'req-4',
                name: 'Request 4',
                data: { method: 'GET', url: '${serverUrl}/status/200' }
              }
            ]
          }
        ]
      };

      const globalVars: Record<string, string> = {};
      await runner.run(collection, { globalVariables: globalVars });

      // Folder pre should run 4 times (once per request in folder)
      expect(globalVars['folderPreCount']).toBe('4');
    });

    test('Two folders (2 requests each): each folder pre runs 2x', async () => {
      const collection: Collection = {
        info: { id: 'col-50', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-A',
            name: 'Folder A',
            preRequestScript: `
              quest.global.variables.set('folderACount', 
                String(parseInt(quest.global.variables.get('folderACount') || '0') + 1)
              );
            `,
            items: [
              {
                type: 'request',
                id: 'req-A1',
                name: 'Request A1',
                data: { method: 'GET', url: '${serverUrl}/status/200' }
              },
              {
                type: 'request',
                id: 'req-A2',
                name: 'Request A2',
                data: { method: 'GET', url: '${serverUrl}/status/200' }
              }
            ]
          },
          {
            type: 'folder',
            id: 'folder-B',
            name: 'Folder B',
            preRequestScript: `
              quest.global.variables.set('folderBCount', 
                String(parseInt(quest.global.variables.get('folderBCount') || '0') + 1)
              );
            `,
            items: [
              {
                type: 'request',
                id: 'req-B1',
                name: 'Request B1',
                data: { method: 'GET', url: '${serverUrl}/status/200' }
              },
              {
                type: 'request',
                id: 'req-B2',
                name: 'Request B2',
                data: { method: 'GET', url: '${serverUrl}/status/200' }
              }
            ]
          }
        ]
      };

      const globalVars: Record<string, string> = {};
      await runner.run(collection, { globalVariables: globalVars });

      // Each folder pre should run 2 times
      expect(globalVars['folderACount']).toBe('2');
      expect(globalVars['folderBCount']).toBe('2');
    });

    test('Two iterations: collection pre runs 2N times for N requests', async () => {
      const collection: Collection = {
        info: { id: 'col-51', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        preRequestScript: `
          quest.global.variables.set('iterColPreCount', 
            String(parseInt(quest.global.variables.get('iterColPreCount') || '0') + 1)
          );
        `,
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Request 1',
            data: { method: 'GET', url: '${serverUrl}/status/200' }
          },
          {
            type: 'request',
            id: 'req-2',
            name: 'Request 2',
            data: { method: 'GET', url: '${serverUrl}/status/200' }
          }
        ],
        testData: [{ iter: 1 }, { iter: 2 }]
      };

      const globalVars: Record<string, string> = {};
      await runner.run(collection, { globalVariables: globalVars });

      // 2 iterations × 2 requests = 4 collection preRequest executions
      expect(globalVars['iterColPreCount']).toBe('4');
    });
  });
});


