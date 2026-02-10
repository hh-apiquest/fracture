/**
 * Test Plan Section 33: Folder-Level Dependencies and Conditions
 * Tests that folders can have dependsOn and condition fields,
 * affecting execution order and skipping
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { CollectionRunner } from '../src/CollectionRunner.js';
import type { Collection } from '@apiquest/types';
import { mockOptionsPlugin } from './test-helpers.js';

describe('Section 33: Folder-Level Dependencies', () => {
  let runner: CollectionRunner;

  beforeEach(() => {
    runner = new CollectionRunner();
    runner.registerPlugin(mockOptionsPlugin);
  });

  // ========================================================================
  // 33.1: Folder dependsOn request
  // ========================================================================
  
  describe('33.1 Folder depends on request', () => {
    test('Folder waits for dependent request to complete', async () => {
      const globalVars: Record<string, string> = {};
      
      const collection: Collection = {
        info: { id: 'test-folder-dep-req', name: 'Folder Depends On Request' },
        protocol: 'mock-options',
        preRequestScript: `
          const order = quest.global.variables.get('order') || '';
          quest.global.variables.set('order', order + quest.request.info.name + ',');
        `,
        items: [
          {
            type: 'request',
            id: 'auth-req',
            name: 'Authenticate',
            data: { url: 'mock://test' },
            postRequestScript: `
              quest.global.variables.set('authToken', 'token-123');
            `
          },
          {
            type: 'folder',
            id: 'api-folder',
            name: 'API Calls',
            dependsOn: ['auth-req'], // MUST wait for auth
            items: [
              {
                type: 'request',
                id: 'api-call',
                name: 'API Call',
                data: { url: 'mock://test' }
              }
            ]
          }
        ]
      };

      const result = await runner.run(collection, {
        globalVariables: globalVars,
        execution: { allowParallel: true, maxConcurrency: 5 }
      });

      expect(result.requestResults.length).toBe(2);
      
      // Auth must happen before API Call
      const order = globalVars['order'];
      const authIndex = order.indexOf('Authenticate');
      const apiIndex = order.indexOf('API Call');
      
      expect(authIndex).toBeLessThan(apiIndex);
      
      // Verify auth token was set
      expect(globalVars['authToken']).toBe('token-123');
    });
  });

  // ========================================================================
  // 33.2: Folder dependsOn another folder
  // ========================================================================
  
  describe('33.2 Folder depends on another folder', () => {
    test('Folder waits for dependent folder to complete', async () => {
      const globalVars: Record<string, string> = {};
      
      const collection: Collection = {
        info: { id: 'test-folder-dep-folder', name: 'Folder Depends On Folder' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'setup-folder',
            name: 'Setup',
            folderPreScript: `
              const order = quest.global.variables.get('order') || '';
              quest.global.variables.set('order', order + 'Setup,');
            `,
            items: [
              {
                type: 'request',
                id: 'setup-req',
                name: 'Setup Request',
                data: { url: 'mock://test' }
              }
            ]
          },
          {
            type: 'folder',
            id: 'tests-folder',
            name: 'Tests',
            dependsOn: ['setup-folder'], // MUST wait for setup
            folderPreScript: `
              const order = quest.global.variables.get('order') || '';
              quest.global.variables.set('order', order + 'Tests,');
            `,
            items: [
              {
                type: 'request',
                id: 'test-req',
                name: 'Test Request',
                data: { url: 'mock://test' }
              }
            ]
          }
        ]
      };

      const result = await runner.run(collection, {
        globalVariables: globalVars,
        execution: { allowParallel: true, maxConcurrency: 5 }
      });

      expect(result.requestResults.length).toBe(2);
      
      // Setup folder must execute before Tests folder
      const order = globalVars['order'];
      const setupIndex = order.indexOf('Setup');
      const testsIndex = order.indexOf('Tests');
      
      expect(setupIndex).toBeLessThan(testsIndex);
    });
  });

  // ========================================================================
  // 33.3: Folder condition=false skips subtree
  // ========================================================================
  
  describe('33.3 Folder condition skips subtree', () => {
    test('Folder with condition=false skips all children', async () => {
      const collection: Collection = {
        info: { id: 'test-folder-condition', name: 'Folder Condition' },
        protocol: 'mock-options',
        collectionPreScript: `
          quest.global.variables.set('runTests', 'false');
        `,
        items: [
          {
            type: 'request',
            id: 'always-run',
            name: 'Always Run',
            data: { url: 'mock://test' }
          },
          {
            type: 'folder',
            id: 'conditional-folder',
            name: 'Conditional Tests',
            condition: `quest.global.variables.get('runTests') === 'true'`,
            items: [
              {
                type: 'request',
                id: 'skipped-req',
                name: 'Skipped Request',
                data: { url: 'mock://test' }
              }
            ]
          }
        ]
      };

      const result = await runner.run(collection);

      // Should have 2 results: 'always-run' executes, 'skipped-req' is skipped
      expect(result.requestResults.length).toBe(2);
      expect(result.requestResults[0].requestName).toBe('Always Run');
      expect(result.requestResults[0].scriptError).toBeUndefined();
      expect(result.requestResults[1].requestName).toBe('Skipped Request');
      expect(result.requestResults[1].scriptError).toBe('Skipped by condition');
    });

    test('Folder with condition=true executes children', async () => {
      const collection: Collection = {
        info: { id: 'test-folder-condition-true', name: 'Folder Condition True' },
        protocol: 'mock-options',
        collectionPreScript: `
          quest.global.variables.set('runTests', 'true');
        `,
        items: [
          {
            type: 'folder',
            id: 'conditional-folder',
            name: 'Conditional Tests',
            condition: `quest.global.variables.get('runTests') === 'true'`,
            items: [
              {
                type: 'request',
                id: 'included-req',
                name: 'Included Request',
                data: { url: 'mock://test' }
              }
            ]
          }
        ]
      };

      const result = await runner.run(collection);

      expect(result.requestResults.length).toBe(1);
      expect(result.requestResults[0].requestName).toBe('Included Request');
    });
  });

  // ========================================================================
  // 33.4: Nested folder dependencies
  // ========================================================================
  
  describe('33.4 Nested folder dependencies', () => {
    test('Nested folder dependencies are respected', async () => {
      const globalVars: Record<string, string> = {};
      
      const collection: Collection = {
        info: { id: 'test-nested-deps', name: 'Nested Dependencies' },
        protocol: 'mock-options',
        preRequestScript: `
          const order = quest.global.variables.get('order') || '';
          quest.global.variables.set('order', order + quest.request.info.name + ',');
        `,
        items: [
          {
            type: 'request',
            id: 'init',
            name: 'Init',
            data: { url: 'mock://test' }
          },
          {
            type: 'folder',
            id: 'parent-folder',
            name: 'Parent',
            dependsOn: ['init'],
            items: [
              {
                type: 'request',
                id: 'parent-req',
                name: 'Parent Request',
                data: { url: 'mock://test' }
              },
              {
                type: 'folder',
                id: 'child-folder',
                name: 'Child',
                dependsOn: ['parent-req'],
                items: [
                  {
                    type: 'request',
                    id: 'child-req',
                    name: 'Child Request',
                    data: { url: 'mock://test' }
                  }
                ]
              }
            ]
          }
        ]
      };

      const result = await runner.run(collection, {
        globalVariables: globalVars,
        execution: { allowParallel: true, maxConcurrency: 5 }
      });

      expect(result.requestResults.length).toBe(3);
      
      // Check execution order
      const order = globalVars['order'];
      const initIndex = order.indexOf('Init');
      const parentIndex = order.indexOf('Parent Request');
      const childIndex = order.indexOf('Child Request');
      
      expect(initIndex).toBeLessThan(parentIndex);
      expect(parentIndex).toBeLessThan(childIndex);
    });
  });

  // ========================================================================
  // 33.5: Folder dependencies with parallel execution
  // ========================================================================
  
  describe('33.5 Folder dependencies with parallel execution', () => {
    test('Independent folders execute in parallel', async () => {
      const collection: Collection = {
        info: { id: 'test-parallel-folders', name: 'Parallel Folders' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-a',
            name: 'Folder A',
            items: [
              {
                type: 'request',
                id: 'req-a',
                name: 'Request A',
                data: { url: 'mock://test/delay/300' }
              }
            ]
          },
          {
            type: 'folder',
            id: 'folder-b',
            name: 'Folder B',
            // No dependencies - can run parallel with A
            items: [
              {
                type: 'request',
                id: 'req-b',
                name: 'Request B',
                data: { url: 'mock://test/delay/300' }
              }
            ]
          }
        ]
      };

      // Parallel execution
      const parStart = Date.now();
      const parResult = await runner.run(collection, {
        execution: { allowParallel: true, maxConcurrency: 5 }
      });
      const parDuration = Date.now() - parStart;

      expect(parResult.requestResults.length).toBe(2);
      // Both folders execute in parallel - should take ~300ms, not 600ms
      expect(parDuration).toBeLessThan(500);
    });

    test('Dependent folders execute sequentially', async () => {
      const collection: Collection = {
        info: { id: 'test-sequential-folders', name: 'Sequential Folders' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-a',
            name: 'Folder A',
            items: [
              {
                type: 'request',
                id: 'req-a',
                name: 'Request A',
                data: { url: 'mock://test/delay/300' }
              }
            ]
          },
          {
            type: 'folder',
            id: 'folder-b',
            name: 'Folder B',
            dependsOn: ['folder-a'], // MUST wait for A
            items: [
              {
                type: 'request',
                id: 'req-b',
                name: 'Request B',
                data: { url: 'mock://test/delay/300' }
              }
            ]
          }
        ]
      };

      const start = Date.now();
      const result = await runner.run(collection, {
        execution: { allowParallel: true, maxConcurrency: 5 }
      });
      const duration = Date.now() - start;

      expect(result.requestResults.length).toBe(2);
      // Folders execute sequentially - should take ~600ms
      expect(duration).toBeGreaterThanOrEqual(550);
    });
  });
});
