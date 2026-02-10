// Section 29: Abort and Bail Tests
// Tests abort signal propagation and --bail option

import { describe, test, expect, beforeEach } from 'vitest';
import { CollectionRunner } from '../src/CollectionRunner.js';
import type { Collection } from '@apiquest/types';
import { mockOptionsPlugin } from './test-helpers.js';

describe('Section 29: Abort and Bail', () => {
  let runner: CollectionRunner;

  beforeEach(() => {
    runner = new CollectionRunner();
    runner.registerPlugin(mockOptionsPlugin);
  });

  describe('29.1 Bail on Test Failure', () => {
    test('bail stops execution on first failed test', async () => {
      const collection: Collection = {
        info: { id: 'bail-1', name: 'Bail Stop Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'First request - has failing test',
          data: { method: 'GET', url: 'mock://json' },
          postRequestScript: `
            quest.test('Should fail', () => {
              expect(1).to.equal(2);
            });
          `
        }, {
          type: 'request',
          id: 'req-2',
          name: 'Second request - should not execute',
          data: { method: 'GET', url: 'mock://json' },
          postRequestScript: `
            quest.test('Should not run', () => {
              expect(true).to.be.true;
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        execution: { bail: true }
      });

      // First request executed, second did not
      expect(result.requestResults).toHaveLength(1);
      expect(result.requestResults[0].requestId).toBe('req-1');
      expect(result.failedTests).toBe(1);
      expect(result.passedTests).toBe(0);
      
      // Result should indicate abort
      expect(result.aborted).toBe(true);
      expect(result.abortReason).toBe('Test failure (--bail)');
    });

    test('bail skips tests in same script after first failure', async () => {
      const collection: Collection = {
        info: { id: 'bail-2', name: 'Bail Skip Tests', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Request with multiple tests',
          data: { method: 'GET', url: 'mock://json' },
          postRequestScript: `
            quest.test('Test 1 - passes', () => {
              expect(true).to.be.true;
            });
            
            quest.test('Test 2 - fails', () => {
              expect(1).to.equal(2);
            });
            
            quest.test('Test 3 - should be skipped', () => {
              expect(true).to.be.true;
            });
            
            quest.test('Test 4 - should be skipped', () => {
              expect(true).to.be.true;
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        execution: { bail: true }
      });

      // Check test results
      expect(result.totalTests).toBe(4);
      expect(result.passedTests).toBe(1); // Test 1
      expect(result.failedTests).toBe(1); // Test 2
      expect(result.skippedTests).toBe(2); // Test 3 & 4 skipped
      
      // Verify skipped test messages
      const tests = result.requestResults[0].tests;
      expect(tests[0].passed).toBe(true);
      expect(tests[1].passed).toBe(false);
      expect(tests[1].skipped).toBe(false);
      expect(tests[2].passed).toBe(false);
      expect(tests[2].skipped).toBe(true);
      expect(tests[2].error).toBe('Test skipped - execution aborted');
      expect(tests[3].passed).toBe(false);
      expect(tests[3].skipped).toBe(true);
    });

    test('without bailall tests execute', async () => {
      const collection: Collection = {
        info: { id: 'nobail-1', name: 'No Bail Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'First request - has failing test',
          data: { method: 'GET', url: 'mock://json' },
          postRequestScript: `
            quest.test('Should fail', () => {
              expect(1).to.equal(2);
            });
          `
        }, {
          type: 'request',
          id: 'req-2',
          name: 'Second request - should execute',
          data: { method: 'GET', url: 'mock://json' },
          postRequestScript: `
            quest.test('Should run', () => {
              expect(true).to.be.true;
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        execution: { bail: false }
      });

      // Both requests executed
      expect(result.requestResults).toHaveLength(2);
      expect(result.failedTests).toBe(1);
      expect(result.passedTests).toBe(1);
      
      // Result should NOT indicate abort
      expect(result.aborted).toBeFalsy();
    });
  });

  describe('29.2 External Abort Signal', () => {
    test('external signal aborts execution mid-run', async () => {
      const collection: Collection = {
        info: { id: 'external-1', name: 'External Abort', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'First request - fast',
          data: { method: 'GET', url: 'mock://json' }
        }, {
          type: 'request',
          id: 'req-2',
          name: 'Second request - delayed',
          data: { method: 'GET', url: 'mock://delay/100' }
        }, {
          type: 'request',
          id: 'req-3',
          name: 'Third request - should not execute',
          data: { method: 'GET', url: 'mock://json' }
        }]
      };

      const controller = new AbortController();
      
      // Abort during second request's delay
      setTimeout(() => controller.abort('User cancelled'), 20);
      
      const result = await runner.run(collection, {
        signal: controller.signal
      });

      // Should execute 1-2 requests depending on timing
      expect(result.requestResults.length).toBeGreaterThanOrEqual(1);
      expect(result.requestResults.length).toBeLessThan(3);
      expect(result.aborted).toBe(true);
    });

    test('pre-aborted signal prevents any execution', async () => {
      const collection: Collection = {
        info: { id: 'external-2', name: 'Pre-Aborted Signal', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Should not execute',
          data: { method: 'GET', url: 'mock://json' }
        }]
      };

      const controller = new AbortController();
      controller.abort('Aborted before execution');
      
      const result = await runner.run(collection, {
        signal: controller.signal
      });

      // No requests should execute
      expect(result.requestResults).toHaveLength(0);
      expect(result.aborted).toBe(true);
    });

    test('external signal skips queued tests in current script', async () => {
      const collection: Collection = {
        info: { id: 'external-3', name: 'External Abort Mid-Script', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Request with delay',
          data: { method: 'GET', url: 'mock://delay/50' },
          postRequestScript: `
            quest.test('Test 1', () => {
              expect(true).to.be.true;
            });
            
            quest.test('Test 2', () => {
              expect(true).to.be.true;
            });
          `
        }]
      };

      const controller = new AbortController();
      
      // Abort during the request delay
      setTimeout(() => controller.abort('External abort'), 10);
      
      try {
        const result = await runner.run(collection, {
          signal: controller.signal
        });
        
        // If execution completes, should be marked as aborted
        expect(result.aborted).toBe(true);
      } catch (error) {
        // If throws, it should be abort-related error
        expect((error as Error).message).toContain('abort');
      }
    });
  });

  describe('29.3 Abort During Iterations', () => {
    test('bail stops iterations on first failure', async () => {
      const collection: Collection = {
        info: { id: 'iter-1', name: 'Iteration Bail', version: '1.0.0' },
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
          data: { method: 'GET', url: 'mock://json' },
          postRequestScript: `
            const iter = quest.variables.get('iteration');
            quest.test('Iteration ' + iter, () => {
              // Fail on iteration 2
              expect(iter).not.to.equal('2');
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        execution: { bail: true }
      });

      // Should execute iterations 1 and 2 then stop
      expect(result.requestResults).toHaveLength(2);
      expect(result.passedTests).toBe(1); // Iteration 1
      expect(result.failedTests).toBe(1); // Iteration 2
      expect(result.aborted).toBe(true);
      expect(result.abortReason).toBe('Test failure (--bail)');
    });
  });

  describe('29.4 Abort Idempotency', () => {
    test('multiple test failures only trigger abort once', async () => {
      const collection: Collection = {
        info: { id: 'idemp-1', name: 'Idempotent Abort', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Request with multiple failures',
          data: { method: 'GET', url: 'mock://json' },
          postRequestScript: `
            quest.test('Fail 1', () => {
              expect(1).to.equal(2);
            });
            
            // This would trigger abort callback again, but test should be skipped
            quest.test('Fail 2', () => {
              expect(1).to.equal(2);
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        execution: { bail: true }
      });

      // First test fails and triggers abort, second test is skipped
      expect(result.totalTests).toBe(2);
      expect(result.failedTests).toBe(1);
      expect(result.skippedTests).toBe(1);
      expect(result.aborted).toBe(true);
      expect(result.abortReason).toBe('Test failure (--bail)');
    });
  });

  describe('29.5 Abort During Script Execution', () => {
    test('signal available in sandbox for script usage', async () => {
      const collection: Collection = {
        info: { id: 'sandbox-1', name: 'Signal In Sandbox', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Check signal in sandbox',
          data: { method: 'GET', url: 'mock://json' },
          postRequestScript: `
            quest.test('signal is available', () => {
              expect(signal).to.not.be.undefined;
              expect(signal).to.be.instanceOf(AbortSignal);
            });
            
            quest.test('signal is not aborted initially', () => {
              expect(signal.aborted).to.be.false;
            });
          `
        }]
      };

      const result = await runner.run(collection);

      expect(result.passedTests).toBe(2);
    });
  });

  describe('29.7 Delay with Bail', () => {
    test('delay option works independently of bail', async () => {
      const collection: Collection = {
        info: { id: 'delay-bail-1', name: 'Delay + Bail', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'First request',
          data: { method: 'GET', url: 'mock://json' },
          postRequestScript: `
            quest.test('Pass', () => {
              expect(true).to.be.true;
            });
          `
        }, {
          type: 'request',
          id: 'req-2',
          name: 'Second request - fails',
          data: { method: 'GET', url: 'mock://json' },
          postRequestScript: `
            quest.test('Fail', () => {
              expect(1).to.equal(2);
            });
          `
        }, {
          type: 'request',
          id: 'req-3',
          name: 'Should not execute',
          data: { method: 'GET', url: 'mock://json' }
        }]
      };

      const start = Date.now();
      const result = await runner.run(collection, {
        execution: { delay: 50, bail: true }
      });
      const duration = Date.now() - start;

      // Should execute req-1, delay, then req-2 (which fails), then stop
      expect(result.requestResults).toHaveLength(2);
      expect(result.passedTests).toBe(1);
      expect(result.failedTests).toBe(1);
      expect(result.aborted).toBe(true);
      
      // Should have at least one delay (between req-1 and req-2)
      expect(duration).toBeGreaterThanOrEqual(50);
    });
  });

  describe('29.6 Abort in Folder/Collection Scripts', () => {
    test('external abort before folder execution', async () => {
      const collection: Collection = {
        info: { id: 'folder-1', name: 'Folder Abort', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'folder',
          id: 'f1',
          name: 'Folder with delay',
          folderPreScript: `
            await quest.wait(50);
          `,
          items: [{
            type: 'request',
            id: 'req-1',
            name: 'Should not execute',
            data: { method: 'GET', url: 'mock://json' }
          }]
        }]
      };

      const controller = new AbortController();
      setTimeout(() => controller.abort('Abort during folder script'), 10);
      
      const result = await runner.run(collection, {
        signal: controller.signal
      });

      // Folder script should throw after abort, no requests executed
      expect(result.requestResults).toHaveLength(0);
      expect(result.aborted).toBe(true);
    });
  });
});
