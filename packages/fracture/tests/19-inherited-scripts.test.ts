/**
 * Test Plan Section 17.8 (Part 19): Inherited Script Execution & Variable Scoping
 * Tests inherited preRequest/postRequest scripts and snapshot/restore patterns
 */

import { describe, test, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { CollectionRunner } from '../src/CollectionRunner.js';
import type { Collection } from '@apiquest/types';
import { mockOptionsPlugin } from './test-helpers.js';
import { createTestServer, type MockHttpServer } from './test-helpers.js';

describe('Section 19: Inherited Script Execution (Section 17.8)', () => {
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
  // Batch 1: Collection preRequest/postRequest script inheritance (8 tests)
  // ========================================================================
  
  describe('19.1 Collection preRequest/postRequest inheritance', () => {
    test('Collection preRequestScript executes before EACH request', async () => {
      const collection: Collection = {
        info: { id: 'col-1', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        preRequestScript: `
          quest.global.variables.set('counter', 
            String(parseInt(quest.global.variables.get('counter') || '0') + 1)
          );
        `,
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Request 1',
            data: { method: 'GET', url: 'mock://status/200' }
          },
          {
            type: 'request',
            id: 'req-2',
            name: 'Request 2',
            data: { method: 'GET', url: 'mock://status/200' }
          }
        ]
      };

      const globalVars: Record<string, string> = {};
      await runner.run(collection, { globalVariables: globalVars });

      // Collection preRequest should run 2 times (once per request)
      expect(globalVars['counter']).toBe('2');
    });

    test('Collection postRequestScript executes after EACH request', async () => {
      const collection: Collection = {
        info: { id: 'col-2', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        postRequestScript: `
          quest.global.variables.set('postCounter', 
            String(parseInt(quest.global.variables.get('postCounter') || '0') + 1)
          );
        `,
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Request 1',
            data: { method: 'GET', url: 'mock://status/200' }
          },
          {
            type: 'request',
            id: 'req-2',
            name: 'Request 2',
            data: { method: 'GET', url: 'mock://status/200' }
          }
        ]
      };

      const globalVars: Record<string, string> = {};
      await runner.run(collection, { globalVariables: globalVars });

      // Collection postRequest should run 2 times (once per request)
      expect(globalVars['postCounter']).toBe('2');
    });

    test('Collection pre/post scripts execute for root-level requests', async () => {
      const collection: Collection = {
        info: { id: 'col-3', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        preRequestScript: `
          quest.collection.variables.set('preRan', 'true');
        `,
        postRequestScript: `
          quest.collection.variables.set('postRan', 'true');
        `,
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Root Request',
            data: { method: 'GET', url: 'mock://status/200' },
            postRequestScript: `
              quest.test('Collection scripts executed', () => {
                expect(quest.collection.variables.get('preRan')).to.equal('true');
                expect(quest.collection.variables.get('postRan')).to.be.null; // Not yet
              });
            `
          }
        ]
      };

      const result = await runner.run(collection);
      expect(result.requestResults[0].tests[0].passed).toBe(true);
    });

    test('Collection pre/post scripts execute for requests inside folders', async () => {
      const collection: Collection = {
        info: { id: 'col-4', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        preRequestScript: `
          quest.global.variables.set('colPreRan', 'yes');
        `,
        postRequestScript: `
          quest.global.variables.set('colPostRan', 'yes');
        `,
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'Folder',
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'Nested Request',
                data: { method: 'GET', url: 'mock://status/200' },
                postRequestScript: `
                  quest.test('Collection scripts ran', () => {
                    expect(quest.global.variables.get('colPreRan')).to.equal('yes');
                  });
                `
              }
            ]
          }
        ]
      };

      const globalVars: Record<string, string> = {};
      const result = await runner.run(collection, { globalVariables: globalVars });
      
      expect(result.requestResults[0].tests[0].passed).toBe(true);
      expect(globalVars['colPostRan']).toBe('yes');
    });

    test('Collection pre/post scripts execute for requests inside nested folders', async () => {
      const collection: Collection = {
        info: { id: 'col-5', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        preRequestScript: `
          quest.global.variables.set('nestedPre', 'ran');
        `,
        postRequestScript: `
          quest.global.variables.set('nestedPost', 'ran');
        `,
        items: [
          {
            type: 'folder',
            id: 'folder-outer',
            name: 'Outer',
            items: [
              {
                type: 'folder',
                id: 'folder-inner',
                name: 'Inner',
                items: [
                  {
                    type: 'request',
                    id: 'req-1',
                    name: 'Deep Request',
                    data: { method: 'GET', url: 'mock://status/200' },
                    postRequestScript: `
                      quest.test('Collection scripts ran in nested folders', () => {
                        expect(quest.global.variables.get('nestedPre')).to.equal('ran');
                      });
                    `
                  }
                ]
              }
            ]
          }
        ]
      };

      const globalVars: Record<string, string> = {};
      const result = await runner.run(collection, { globalVariables: globalVars });
      
      expect(result.requestResults[0].tests[0].passed).toBe(true);
      expect(globalVars['nestedPost']).toBe('ran');
    });

    test('Collection pre/post scripts execute across all iterations', async () => {
      const collection: Collection = {
        info: { id: 'col-6', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        preRequestScript: `
          quest.global.variables.set('iterPre', 
            (quest.global.variables.get('iterPre') || '') + 'P'
          );
        `,
        postRequestScript: `
          quest.global.variables.set('iterPost', 
            (quest.global.variables.get('iterPost') || '') + 'O'
          );
        `,
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Request',
            data: { method: 'GET', url: 'mock://status/200' }
          }
        ],
        testData: [{ iter: 1 }, { iter: 2 }, { iter: 3 }]
      };

      const globalVars: Record<string, string> = {};
      await runner.run(collection, { globalVariables: globalVars });

      // 3 iterations × 1 request = 3 pre, 3 post
      expect(globalVars['iterPre']).toBe('PPP');
      expect(globalVars['iterPost']).toBe('OOO');
    });

    test('Variables from collection preRequestScript visible in request preRequestScript', async () => {
      const collection: Collection = {
        info: { id: 'col-7', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        preRequestScript: `
          quest.scope.variables.set('fromCollectionPre', 'value123');
        `,
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Request',
            data: { method: 'GET', url: 'mock://status/200' },
            preRequestScript: `
              // Verify variable is visible by setting a collection marker
              const val = quest.scope.variables.get('fromCollectionPre');
              if (val === 'value123') {
                quest.collection.variables.set('preRequestSawIt', 'yes');
              }
            `,
            postRequestScript: `
              quest.test('Can see collection preRequest scope variable', () => {
                expect(quest.collection.variables.get('preRequestSawIt')).to.equal('yes');
              });
            `
          }
        ]
      };

      const result = await runner.run(collection);
      expect(result.requestResults[0].tests[0].passed).toBe(true);
    });

    test('Variables from collection preRequestScript visible in request postRequestScript', async () => {
      const collection: Collection = {
        info: { id: 'col-8', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        preRequestScript: `
          quest.scope.variables.set('fromColPre', 'visibleInPost');
        `,
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Request',
            data: { method: 'GET', url: 'mock://status/200' },
            postRequestScript: `
              quest.test('Collection pre local visible in post', () => {
                expect(quest.scope.variables.get('fromColPre')).to.equal('visibleInPost');
              });
            `
          }
        ]
      };

      const result = await runner.run(collection);
      expect(result.requestResults[0].tests[0].passed).toBe(true);
    });
  });

  // ========================================================================
  // Batch 2: Folder preRequest/postRequest script inheritance (6 tests)
  // ========================================================================
  
  describe('19.2 Folder preRequest/postRequest inheritance', () => {
    test('Folder preRequestScript executes before EACH request in folder', async () => {
      const collection: Collection = {
        info: { id: 'col-9', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'TestFolder',
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
                data: { method: 'GET', url: 'mock://status/200' }
              },
              {
                type: 'request',
                id: 'req-2',
                name: 'Request 2',
                data: { method: 'GET', url: 'mock://status/200' }
              }
            ]
          }
        ]
      };

      const globalVars: Record<string, string> = {};
      await runner.run(collection, { globalVariables: globalVars });

      // Folder preRequest should run 2 times (once per request in folder)
      expect(globalVars['folderPreCount']).toBe('2');
    });

    test('Folder postRequestScript executes after EACH request in folder', async () => {
      const collection: Collection = {
        info: { id: 'col-10', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'TestFolder',
            postRequestScript: `
              quest.global.variables.set('folderPostCount', 
                String(parseInt(quest.global.variables.get('folderPostCount') || '0') + 1)
              );
            `,
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'Request 1',
                data: { method: 'GET', url: 'mock://status/200' }
              },
              {
                type: 'request',
                id: 'req-2',
                name: 'Request 2',
                data: { method: 'GET', url: 'mock://status/200' }
              }
            ]
          }
        ]
      };

      const globalVars: Record<string, string> = {};
      await runner.run(collection, { globalVariables: globalVars });

      expect(globalVars['folderPostCount']).toBe('2');
    });

    test('Folder pre/post scripts do NOT execute for requests outside folder', async () => {
      const collection: Collection = {
        info: { id: 'col-11', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-outside',
            name: 'Outside Request',
            data: { method: 'GET', url: 'mock://status/200' },
            postRequestScript: `
              quest.test('Folder scripts did NOT run', () => {
                expect(quest.global.variables.get('folderPreRan')).to.be.null;
                expect(quest.global.variables.get('folderPostRan')).to.be.null;
              });
            `
          },
          {
            type: 'folder',
            id: 'folder-1',
            name: 'TestFolder',
            preRequestScript: `
              quest.global.variables.set('folderPreRan', 'yes');
            `,
            postRequestScript: `
              quest.global.variables.set('folderPostRan', 'yes');
            `,
            items: [
              {
                type: 'request',
                id: 'req-inside',
                name: 'Inside Request',
                data: { method: 'GET', url: 'mock://status/200' }
              }
            ]
          }
        ]
      };

      const result = await runner.run(collection);
      expect(result.requestResults[0].tests[0].passed).toBe(true);
    });

    test('Folder pre/post scripts do NOT execute for sibling folder requests', async () => {
      const collection: Collection = {
        info: { id: 'col-12', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-A',
            name: 'Folder A',
            preRequestScript: `
              // Count how many times Folder A's pre script runs
              quest.global.variables.set('folderACount', 
                String(parseInt(quest.global.variables.get('folderACount') || '0') + 1)
              );
              quest.global.variables.set('folderALastRequest', quest.request.info.name);
            `,
            items: [
              {
                type: 'request',
                id: 'req-A',
                name: 'Request A',
                data: { method: 'GET', url: 'mock://status/200' }
              }
            ]
          },
          {
            type: 'folder',
            id: 'folder-B',
            name: 'Folder B',
            items: [
              {
                type: 'request',
                id: 'req-B',
                name: 'Request B',
                data: { method: 'GET', url: 'mock://status/200' },
                postRequestScript: `
                  quest.test('Sibling folder script did NOT run for Request B', () => {
                    // Folder A script should have run exactly ONCE (for Request A only)
                    expect(quest.global.variables.get('folderACount')).to.equal('1');
                    // And it should have been for Request A, not Request B
                    expect(quest.global.variables.get('folderALastRequest')).to.equal('Request A');
                  });
                `
              }
            ]
          }
        ]
      };

      const result = await runner.run(collection);
      expect(result.requestResults[1].tests[0].passed).toBe(true);
    });

    test('Variables from folder preRequestScript visible in folder requests', async () => {
      const collection: Collection = {
        info: { id: 'col-13', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'TestFolder',
            preRequestScript: `
              quest.scope.variables.set('fromFolderPre', 'folderValue');
            `,
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'Request',
                data: { method: 'GET', url: 'mock://status/200' },
                postRequestScript: `
                  quest.test('Folder pre local visible in request', () => {
                    expect(quest.scope.variables.get('fromFolderPre')).to.equal('folderValue');
                  });
                `
              }
            ]
          }
        ]
      };

      const result = await runner.run(collection);
      expect(result.requestResults[0].tests[0].passed).toBe(true);
    });

    test('Folder preRequestScript locals persist across ALL requests until folder ends', async () => {
      const collection: Collection = {
        info: { id: 'col-15', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'TestFolder',
            folderPreScript: `
              // Initialize folder-scoped variables (runs ONCE when folder starts)
              // Stack: [collection, folder] - variables go into folder scope
              quest.scope.variables.set('folderScopeTracker', '');
              quest.scope.variables.set('folderInitial', 'setInFirstRun');
            `,
            preRequestScript: `
              // Runs before EACH request in folder
              // Stack: [collection, folder, request]
              // Append to folder-scoped variable (search-and-set finds it in folder scope)
              const current = quest.scope.variables.get('folderScopeTracker') || '';
              quest.scope.variables.set('folderScopeTracker', current + 'F');
            `,
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'Request 1',
                data: { method: 'GET', url: 'mock://status/200' },
                postRequestScript: `
                  quest.test('Request 1: Folder scope variables visible', () => {
                    // Folder pre ran once before this request: 'F'
                    expect(quest.scope.variables.get('folderScopeTracker')).to.equal('F');
                    expect(quest.scope.variables.get('folderInitial')).to.equal('setInFirstRun');
                  });
                `
              },
              {
                type: 'request',
                id: 'req-2',
                name: 'Request 2',
                data: { method: 'GET', url: 'mock://status/200' },
                postRequestScript: `
                  quest.test('Request 2: Folder scope variables PERSIST from Request 1', () => {
                    // Folder pre ran AGAIN before req2, appending: 'FF'
                    expect(quest.scope.variables.get('folderScopeTracker')).to.equal('FF');
                    // Initial value still there (set in folderPreScript)
                    expect(quest.scope.variables.get('folderInitial')).to.equal('setInFirstRun');
                  });
                `
              },
              {
                type: 'request',
                id: 'req-3',
                name: 'Request 3',
                data: { method: 'GET', url: 'mock://status/200' },
                postRequestScript: `
                  quest.test('Request 3: Folder scope variables STILL persist', () => {
                    // Folder pre ran 3rd time: 'FFF'
                    expect(quest.scope.variables.get('folderScopeTracker')).to.equal('FFF');
                    expect(quest.scope.variables.get('folderInitial')).to.equal('setInFirstRun');
                  });
                `
              }
            ]
          }
        ]
      };

      const result = await runner.run(collection);
      expect(result.requestResults[0].tests[0].passed).toBe(true);
      expect(result.requestResults[1].tests[0].passed).toBe(true);
      expect(result.requestResults[2].tests[0].passed).toBe(true);
    });

    test('Variables from folder postRequestScript visible in next request in folder', async () => {
      const collection: Collection = {
        info: { id: 'col-14', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'TestFolder',
            folderPreScript: `
              // Initialize folder-scoped variables (runs ONCE when folder starts)
              // Stack: [collection, folder] - variables go into folder scope
              quest.scope.variables.set('folderPostTracker', '');
            `,
            postRequestScript: `
              // Runs after EACH request in folder
              // Stack: [collection, folder, request]
              // Modify folder-scoped variable (search-and-set finds it in folder scope)
              const current = quest.scope.variables.get('folderPostTracker') || '';
              quest.scope.variables.set('folderPostTracker', current + 'P');
              
              // Also set a request-scoped variable to verify it gets cleared
              if (!quest.scope.variables.get('requestOnlyVar')) {
                quest.scope.variables.set('requestOnlyVar', 'shouldBeClearedBeforeNextRequest');
              }
            `,
            folderPostScript: `
              // Verify folder scope variables persisted through all requests
              // Stack: [collection, folder]
              const tracker = quest.scope.variables.get('folderPostTracker');
              quest.global.variables.set('finalFolderPostTracker', tracker || 'missing');
            `,
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'Request 1',
                data: { method: 'GET', url: 'mock://status/200' }
              },
              {
                type: 'request',
                id: 'req-2',
                name: 'Request 2',
                data: { method: 'GET', url: 'mock://status/200' },
                preRequestScript: `
                  // Verify request-scoped var from previous request was cleared
                  const requestCleared = quest.scope.variables.get('requestOnlyVar');
                  quest.global.variables.set('requestVarCleared', requestCleared === null ? 'yes' : 'no');
                  
                  // Verify folder scope var persisted from Request 1's postScript
                  const tracker = quest.scope.variables.get('folderPostTracker');
                  quest.global.variables.set('trackerBeforeReq2', tracker || 'missing');
                `,
                postRequestScript: `
                  quest.test('Folder postRequestScript scope variables persist', () => {
                    // Folder-scoped variable should persist: Request 1's post added 'P'
                    expect(quest.global.variables.get('trackerBeforeReq2')).to.equal('P');
                    // Request-scoped var should have been cleared
                    expect(quest.global.variables.get('requestVarCleared')).to.equal('yes');
                    // After this request's folder post, tracker will be 'PP'
                    // (verified in folderPostScript at end)
                  });
                `
              }
            ]
          }
        ]
      };

      const globalVars: Record<string, string> = {};
      const result = await runner.run(collection, { globalVariables: globalVars });
      expect(result.requestResults[1].tests[0].passed).toBe(true);
      // Verify folderPostScript saw the final tracker value
      expect(globalVars['finalFolderPostTracker']).toBe('PP');
    });
  });
});


