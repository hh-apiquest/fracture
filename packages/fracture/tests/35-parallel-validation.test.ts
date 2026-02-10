/**
 * Test Plan Section 35: Parallel Execution Validation
 * Tests validation rules for parallel execution,
 * especially cookie-jar-persist incompatibility
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { CollectionRunner } from '../src/CollectionRunner.js';
import type { Collection } from '@apiquest/types';
import { mockOptionsPlugin } from './test-helpers.js';

describe('Section 35: Parallel Execution Validation', () => {
  let runner: CollectionRunner;

  beforeEach(() => {
    runner = new CollectionRunner();
    runner.registerPlugin(mockOptionsPlugin);
  });

  // ========================================================================
  // 35.1: Reject parallel + cookie-jar-persist
  // ========================================================================
  
  describe('35.1 Parallel incompatible with cookie-jar-persist', () => {
    test('Rejects parallel with cookie-jar-persist', async () => {
      const collection: Collection = {
        info: { id: 'test-invalid-combo', name: 'Invalid Combination' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req1',
            name: 'Request 1',
            data: { url: 'mock://test' }
          }
        ]
      };

      // Should return validation error for incompatible options
      const result = await runner.run(collection, {
        execution: { allowParallel: true },
        jar: { persist: true }
      });
      
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors!.length).toBeGreaterThan(0);
      expect(result.validationErrors![0].message).toContain('parallel execution');
    });

    test('Accepts parallel without persist', async () => {
      const collection: Collection = {
        info: { id: 'test-parallel-no-persist', name: 'Parallel Without Persist' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req1',
            name: 'Request 1',
            data: { url: 'mock://test' }
          }
        ]
      };

      // Should work fine - parallel without persist
      const result = await runner.run(collection, {
        execution: { allowParallel: true },
        jar: { persist: false }
      });

      expect(result.requestResults.length).toBe(1);
    });

    test('Accepts sequential with persist', async () => {
      const collection: Collection = {
        info: { id: 'test-sequential-persist', name: 'Sequential With Persist' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req1',
            name: 'Request 1',
            data: { url: 'mock://test' }
          }
        ]
      };

      // Should work fine - sequential with persist
      const result = await runner.run(collection, {
        execution: { allowParallel: false },
        jar: { persist: true }
      });

      expect(result.requestResults.length).toBe(1);
    });
  });

  // ========================================================================
  // 35.2: Default values work correctly
  // ========================================================================
  
  describe('35.2 Default option values', () => {
    test('No execution options defaults to sequential', async () => {
      const collection: Collection = {
        info: { id: 'test-defaults', name: 'Default Options' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req1',
            name: 'Request 1',
            data: { url: 'mock://test' }
          }
        ]
      };

      // No execution options - should default to sequential
      const result = await runner.run(collection);
      expect(result.requestResults.length).toBe(1);
    });

    test('Empty execution object defaults to sequential', async () => {
      const collection: Collection = {
        info: { id: 'test-empty-execution', name: 'Empty Execution' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req1',
            name: 'Request 1',
            data: { url: 'mock://test' }
          }
        ]
      };

      const result = await runner.run(collection, {
        execution: {}
      });
      
      expect(result.requestResults.length).toBe(1);
    });

    test('No jar options works with parallel', async () => {
      const collection: Collection = {
        info: { id: 'test-no-jar', name: 'No Jar Options' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req1',
            name: 'Request 1',
            data: { url: 'mock://test' }
          }
        ]
      };

      // Parallel with no jar options should work
      const result = await runner.run(collection, {
        execution: { allowParallel: true }
      });
      
      expect(result.requestResults.length).toBe(1);
    });
  });

  // ========================================================================
  // 35.3: Cookie jar validation specific cases
  // ========================================================================
  
  describe('35.3 Cookie jar edge cases', () => {
    test('Parallel with jar persist:false works', async () => {
      const collection: Collection = {
        info: { id: 'test-jar-no-persist', name: 'Jar No Persist' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req1',
            name: 'Request 1',
            data: { url: 'mock://test' }
          }
        ]
      };

      const result = await runner.run(collection, {
        execution: { allowParallel: true },
        jar: { persist: false }
      });
      
      expect(result.requestResults.length).toBe(1);
    });

    test('Parallel with jar persist:undefined works', async () => {
      const collection: Collection = {
        info: { id: 'test-jar-undef-persist', name: 'Jar Undefined Persist' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req1',
            name: 'Request 1',
            data: { url: 'mock://test' }
          }
        ]
      };

      const result = await runner.run(collection, {
        execution: { allowParallel: true },
        jar: { persist: false }
      });
      
      expect(result.requestResults.length).toBe(1);
    });
  });

  // ========================================================================
  // 35.4: Concurrency validation
  // ========================================================================
  
  describe('35.4 Concurrency validation', () => {
    test('maxConcurrency=0 defaults to 1', async () => {
      const collection: Collection = {
        info: { id: 'test-concurrency-zero', name: 'Concurrency Zero' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req1',
            name: 'Request 1',
            data: { url: 'mock://test' }
          }
        ]
      };

      // maxConcurrency=0 should be treated as 1
      const result = await runner.run(collection, {
        execution: { allowParallel: true, maxConcurrency: 0 }
      });
      
      expect(result.requestResults.length).toBe(1);
    });

    test('maxConcurrency=undefined uses sensible default', async () => {
      const collection: Collection = {
        info: { id: 'test-concurrency-undef', name: 'Concurrency Undefined' },
        protocol: 'mock-options',
        items: Array.from({ length: 5 }, (_, i) => ({
          type: 'request' as const,
          id: `req${i}`,
          name: `Request ${i}`,
          data: { url: 'mock://test' }
        }))
      };

      // Should use default concurrency
      const result = await runner.run(collection, {
        execution: { allowParallel: true }
      });
      
      expect(result.requestResults.length).toBe(5);
    });

    test('Large maxConcurrency works', async () => {
      const collection: Collection = {
        info: { id: 'test-large-concurrency', name: 'Large Concurrency' },
        protocol: 'mock-options',
        items: Array.from({ length: 3 }, (_, i) => ({
          type: 'request' as const,
          id: `req${i}`,
          name: `Request ${i}`,
          data: { url: 'mock://test' }
        }))
      };

      // maxConcurrency larger than request count should work
      const result = await runner.run(collection, {
        execution: { allowParallel: true, maxConcurrency: 100 }
      });
      
      expect(result.requestResults.length).toBe(3);
    });
  });
});
