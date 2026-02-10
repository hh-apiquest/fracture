/**
 * Test Plan Section 17.8 (Part 19.1): Nested Chains & Execution Order
 * Batches 3-4: Nested folder script chains and execution order tracking
 */

import { describe, test, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { CollectionRunner } from '../src/CollectionRunner.js';
import type { Collection } from '@apiquest/types';
import { mockOptionsPlugin } from './test-helpers.js';
import { createTestServer, type MockHttpServer } from './test-helpers.js';

describe('Section 19.1: Nested Chains & Execution Order', () => {
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
  // Batch 3: Nested folder script chains (6 tests)
  // ========================================================================
  
  describe('19.3 Nested folder script chains', () => {
    test('Outer folder preRequest runs before inner folder preRequest', async () => {
      const collection: Collection = {
        info: { id: 'col-15', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-outer',
            name: 'Outer',
            preRequestScript: `
              quest.global.variables.set('order', 
                (quest.global.variables.get('order') || '') + 'OUTER-'
              );
            `,
            items: [
              {
                type: 'folder',
                id: 'folder-inner',
                name: 'Inner',
                preRequestScript: `
                  quest.global.variables.set('order', 
                    (quest.global.variables.get('order') || '') + 'INNER-'
                  );
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
          }
        ]
      };

      const globalVars: Record<string, string> = {};
      await runner.run(collection, { globalVariables: globalVars });

      // Should be OUTER- then INNER-
      expect(globalVars['order']).toBe('OUTER-INNER-');
    });

    test('Inner folder preRequest runs before request preRequest', async () => {
      const collection: Collection = {
        info: { id: 'col-16', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-inner',
            name: 'Inner',
            preRequestScript: `
              quest.global.variables.set('chainOrder', 
                (quest.global.variables.get('chainOrder') || '') + 'FOLDER>'
              );
            `,
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'Request',
                data: { method: 'GET', url: '${serverUrl}/status/200' },
                preRequestScript: `
                  quest.global.variables.set('chainOrder', 
                    (quest.global.variables.get('chainOrder') || '') + 'REQUEST'
                  );
                `
              }
            ]
          }
        ]
      };

      const globalVars: Record<string, string> = {};
      await runner.run(collection, { globalVariables: globalVars });

      expect(globalVars['chainOrder']).toBe('FOLDER>REQUEST');
    });

    test('Full pre chain: Collection → Outer → Inner → Request', async () => {
      const collection: Collection = {
        info: { id: 'col-17', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        preRequestScript: `
          quest.global.variables.set('fullChain', 'COL>');
        `,
        items: [
          {
            type: 'folder',
            id: 'folder-outer',
            name: 'Outer',
            preRequestScript: `
              quest.global.variables.set('fullChain', 
                quest.global.variables.get('fullChain') + 'OUTER>'
              );
            `,
            items: [
              {
                type: 'folder',
                id: 'folder-inner',
                name: 'Inner',
                preRequestScript: `
                  quest.global.variables.set('fullChain', 
                    quest.global.variables.get('fullChain') + 'INNER>'
                  );
                `,
                items: [
                  {
                    type: 'request',
                    id: 'req-1',
                    name: 'Request',
                    data: { method: 'GET', url: '${serverUrl}/status/200' },
                    preRequestScript: `
                      quest.global.variables.set('fullChain', 
                        quest.global.variables.get('fullChain') + 'REQ'
                      );
                    `
                  }
                ]
              }
            ]
          }
        ]
      };

      const globalVars: Record<string, string> = {};
      await runner.run(collection, { globalVariables: globalVars });

      expect(globalVars['fullChain']).toBe('COL>OUTER>INNER>REQ');
    });

    test('Full post chain LIFO: Request → Inner → Outer → Collection', async () => {
      const collection: Collection = {
        info: { id: 'col-18', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        postRequestScript: `
          quest.global.variables.set('postChain', 
            (quest.global.variables.get('postChain') || '') + '>COL'
          );
        `,
        items: [
          {
            type: 'folder',
            id: 'folder-outer',
            name: 'Outer',
            postRequestScript: `
              quest.global.variables.set('postChain', 
                (quest.global.variables.get('postChain') || '') + '>OUTER'
              );
            `,
            items: [
              {
                type: 'folder',
                id: 'folder-inner',
                name: 'Inner',
                postRequestScript: `
                  quest.global.variables.set('postChain', 
                    (quest.global.variables.get('postChain') || '') + '>INNER'
                  );
                `,
                items: [
                  {
                    type: 'request',
                    id: 'req-1',
                    name: 'Request',
                    data: { method: 'GET', url: '${serverUrl}/status/200' },
                    postRequestScript: `
                      quest.global.variables.set('postChain', 'REQ');
                    `
                  }
                ]
              }
            ]
          }
        ]
      };

      const globalVars: Record<string, string> = {};
      await runner.run(collection, { globalVariables: globalVars });

      // LIFO: Request first, then inner, outer, collection
      expect(globalVars['postChain']).toBe('REQ>INNER>OUTER>COL');
    });

    test('Variables cascade through nested chain', async () => {
      const collection: Collection = {
        info: { id: 'col-19', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        preRequestScript: `
          quest.scope.variables.set('level1', 'col');
        `,
        items: [
          {
            type: 'folder',
            id: 'folder-outer',
            name: 'Outer',
            preRequestScript: `
              quest.scope.variables.set('level2', 
                quest.scope.variables.get('level1') + '>outer'
              );
            `,
            items: [
              {
                type: 'folder',
                id: 'folder-inner',
                name: 'Inner',
                preRequestScript: `
                  quest.scope.variables.set('level3', 
                    quest.scope.variables.get('level2') + '>inner'
                  );
                `,
                items: [
                  {
                    type: 'request',
                    id: 'req-1',
                    name: 'Request',
                    data: { method: 'GET', url: '${serverUrl}/status/200' },
                    postRequestScript: `
                      quest.test('All cascade variables visible', () => {
                        expect(quest.scope.variables.get('level1')).to.equal('col');
                        expect(quest.scope.variables.get('level2')).to.equal('col>outer');
                        expect(quest.scope.variables.get('level3')).to.equal('col>outer>inner');
                      });
                    `
                  }
                ]
              }
            ]
          }
        ]
      };

      const result = await runner.run(collection);
      expect(result.requestResults[0].tests.every(t => t.passed)).toBe(true);
    });

    test('3-level nesting works correctly', async () => {
      const collection: Collection = {
        info: { id: 'col-20', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-L1',
            name: 'Level1',
            preRequestScript: `
              quest.global.variables.set('L1', 'yes');
            `,
            items: [
              {
                type: 'folder',
                id: 'folder-L2',
                name: 'Level2',
                preRequestScript: `
                  quest.global.variables.set('L2', 'yes');
                `,
                items: [
                  {
                    type: 'folder',
                    id: 'folder-L3',
                    name: 'Level3',
                    preRequestScript: `
                      quest.global.variables.set('L3', 'yes');
                    `,
                    items: [
                      {
                        type: 'request',
                        id: 'req-1',
                        name: 'Deep Request',
                        data: { method: 'GET', url: '${serverUrl}/status/200' },
                        postRequestScript: `
                          quest.test('All 3 levels executed', () => {
                            expect(quest.global.variables.get('L1')).to.equal('yes');
                            expect(quest.global.variables.get('L2')).to.equal('yes');
                            expect(quest.global.variables.get('L3')).to.equal('yes');
                          });
                        `
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      };

      const result = await runner.run(collection);
      expect(result.requestResults[0].tests.every(t => t.passed)).toBe(true);
    });
  });

  // ========================================================================
  // Batch 4: Script execution order tracking (3 tests)
  // ========================================================================
  
  describe('19.4 Script execution order tracking', () => {
    test('Complete chain order via console tracking', async () => {
      const collection: Collection = {
        info: { id: 'col-21', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        preRequestScript: `
          quest.global.variables.set('execOrder', 
            (quest.global.variables.get('execOrder') || '') + '1-COL-PRE,'
          );
        `,
        postRequestScript: `
          quest.global.variables.set('execOrder', 
            quest.global.variables.get('execOrder') + '7-COL-POST'
          );
        `,
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'Folder',
            preRequestScript: `
              quest.global.variables.set('execOrder', 
                quest.global.variables.get('execOrder') + '2-FOLDER-PRE,'
              );
            `,
            postRequestScript: `
              quest.global.variables.set('execOrder', 
                quest.global.variables.get('execOrder') + '6-FOLDER-POST,'
              );
            `,
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'Request',
                data: { method: 'GET', url: '${serverUrl}/status/200' },
                preRequestScript: `
                  quest.global.variables.set('execOrder', 
                    quest.global.variables.get('execOrder') + '3-REQ-PRE,'
                  );
                `,
                postRequestScript: `
                  quest.global.variables.set('execOrder', 
                    quest.global.variables.get('execOrder') + '5-REQ-POST,'
                  );
                  quest.test('Execution order correct at request post', () => {
                    // At this point in time, folder and collection post scripts haven't run yet
                    const order = quest.global.variables.get('execOrder');
                    expect(order).to.equal('1-COL-PRE,2-FOLDER-PRE,3-REQ-PRE,5-REQ-POST,');
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
      // After all scripts complete, verify the full chain
      expect(globalVars['execOrder']).toBe('1-COL-PRE,2-FOLDER-PRE,3-REQ-PRE,5-REQ-POST,6-FOLDER-POST,7-COL-POST');
    });

    test('Order tracked via global append pattern', async () => {
      const collection: Collection = {
        info: { id: 'col-22', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        preRequestScript: `
          quest.global.variables.set('track', '1');
        `,
        postRequestScript: `
          quest.global.variables.set('track', 
            quest.global.variables.get('track') + '5'
          );
        `,
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'Folder',
            preRequestScript: `
              quest.global.variables.set('track', 
                quest.global.variables.get('track') + '2'
              );
            `,
            postRequestScript: `
              quest.global.variables.set('track', 
                quest.global.variables.get('track') + '4'
              );
            `,
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'Request',
                data: { method: 'GET', url: '${serverUrl}/status/200' },
                postRequestScript: `
                  quest.global.variables.set('track', 
                    quest.global.variables.get('track') + '3'
                  );
                `
              }
            ]
          }
        ]
      };

      const globalVars: Record<string, string> = {};
      await runner.run(collection, { globalVariables: globalVars });

      // Order: 1(col-pre) → 2(folder-pre) → 3(req-post) → 4(folder-post) → 5(col-post)
      expect(globalVars['track']).toBe('12345');
    });

    test('Multiple requests show correct order', async () => {
      const collection: Collection = {
        info: { id: 'col-23', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        preRequestScript: `
          quest.global.variables.set('multiTrack', 
            (quest.global.variables.get('multiTrack') || '') + 'C'
          );
        `,
        postRequestScript: `
          quest.global.variables.set('multiTrack', 
            quest.global.variables.get('multiTrack') + 'P'
          );
        `,
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Request 1',
            data: { method: 'GET', url: '${serverUrl}/status/200' },
            postRequestScript: `
              quest.global.variables.set('multiTrack', 
                quest.global.variables.get('multiTrack') + 'R'
              );
            `
          },
          {
            type: 'request',
            id: 'req-2',
            name: 'Request 2',
            data: { method: 'GET', url: '${serverUrl}/status/200' },
            postRequestScript: `
              quest.global.variables.set('multiTrack', 
                quest.global.variables.get('multiTrack') + 'R'
              );
            `
          }
        ]
      };

      const globalVars: Record<string, string> = {};
      await runner.run(collection, { globalVariables: globalVars });

      // Pattern: C(col-pre) R(req1-post) P(col-post) C(col-pre) R(req2-post) P(col-post)
      expect(globalVars['multiTrack']).toBe('CRPCRP');
    });

    test('Multiple folders show correct order', async () => {
      const collection: Collection = {
        info: { id: 'col-24', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        preRequestScript: `
          quest.global.variables.set('folderOrder', 
            (quest.global.variables.get('folderOrder') || '') + 'C|'
          );
        `,
        postRequestScript: `
          quest.global.variables.set('folderOrder', 
            quest.global.variables.get('folderOrder') + 'c|'
          );
        `,
        items: [
          {
            type: 'folder',
            id: 'folder-A',
            name: 'Folder A',
            preRequestScript: `
              quest.global.variables.set('folderOrder', 
                quest.global.variables.get('folderOrder') + 'A|'
              );
            `,
            postRequestScript: `
              quest.global.variables.set('folderOrder', 
                quest.global.variables.get('folderOrder') + 'a|'
              );
            `,
            items: [
              {
                type: 'request',
                id: 'req-A',
                name: 'Request A',
                data: { method: 'GET', url: '${serverUrl}/status/200' },
                postRequestScript: `
                  quest.global.variables.set('folderOrder', 
                    quest.global.variables.get('folderOrder') + 'RA|'
                  );
                `
              }
            ]
          },
          {
            type: 'folder',
            id: 'folder-B',
            name: 'Folder B',
            preRequestScript: `
              quest.global.variables.set('folderOrder', 
                quest.global.variables.get('folderOrder') + 'B|'
              );
            `,
            postRequestScript: `
              quest.global.variables.set('folderOrder', 
                quest.global.variables.get('folderOrder') + 'b|'
              );
            `,
            items: [
              {
                type: 'request',
                id: 'req-B',
                name: 'Request B',
                data: { method: 'GET', url: '${serverUrl}/status/200' },
                postRequestScript: `
                  quest.global.variables.set('folderOrder', 
                    quest.global.variables.get('folderOrder') + 'RB|'
                  );
                `
              }
            ]
          }
        ]
      };

      const globalVars: Record<string, string> = {};
      await runner.run(collection, { globalVariables: globalVars });

      // Pattern: 
      // C|A|RA|a|c| (Folder A: col-pre, folderA-pre, reqA-post, folderA-post, col-post)
      // C|B|RB|b|c| (Folder B: col-pre, folderB-pre, reqB-post, folderB-post, col-post)
      expect(globalVars['folderOrder']).toBe('C|A|RA|a|c|C|B|RB|b|c|');
    });
  });
});


