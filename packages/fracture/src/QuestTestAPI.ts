import type { TestResult } from '@apiquest/types';
import { ScriptType } from '@apiquest/types';

/**
 * Special error class for quest.skip()
 */
class SkipError extends Error {
  public readonly skipReason: string;
  
  constructor(message: string) {
    super(message);
    this.name = 'SkipError';
    this.skipReason = message;
  }
}

function isPromise(value: unknown): value is Promise<void> {
  return value !== null &&
         value !== undefined &&
         typeof value === 'object' &&
         typeof (value as { then?: unknown }).then === 'function';
}

/**
 * Creates the test API methods (quest.test, quest.skip, quest.fail)
 * These methods allow scripts to define and control test assertions
 */
export function createQuestTestAPI(
  tests: TestResult[],
  scriptType: ScriptType,
  emitAssertion: (test: TestResult) => void,
  abortSignal?: AbortSignal
): {
  test: (name: string, fn: () => void | Promise<void>) => void;
  skip: (reason: string) => never;
  fail: (message: string) => never;
} {
  let isInsideTest = false;

  return {
    /**
     * Define a test assertion
     * Can only be called in postRequestScript or plugin event scripts
     */
    test(name: string, fn: () => void | Promise<void>) {
      // Enforce: tests can only be called in request post scripts (never pre, folder, or collection)
      const allowedScriptTypes = [
        ScriptType.PostRequest,
        ScriptType.PluginEvent
      ];
      if (!allowedScriptTypes.includes(scriptType)) {
        throw new Error(
          `quest.test() can only be called in request post scripts. ` +
          `Current script type: ${scriptType}. ` +
          `Tests require request/response context and cannot be used in ` +
          `collectionPost, folderPost, or pre-request scripts.`
        );
      }
      
      // Check abort signal - skip test if already aborted
      if (abortSignal?.aborted === true) {
        const testResult: TestResult = {
          name,
          passed: false,
          skipped: true,
          error: 'Test skipped - execution aborted'
        };
        tests.push(testResult);
        emitAssertion(testResult);
        return;
      }
      
      isInsideTest = true;
      try {
        const result = fn();
        
        // If fn returns a Promise, handle it
        if (isPromise(result)) {
          result
            .then(() => {
              const testResult: TestResult = {
                name,
                passed: true,
                skipped: false
              };
              tests.push(testResult);
              emitAssertion(testResult);
            })
            .catch((error: unknown) => {
              // Check if this is a skip error
              const testResult: TestResult = error instanceof SkipError
                ? {
                    name,
                    passed: false,
                    skipped: true,
                    error: error.skipReason
                  }
                : {
                    name,
                    passed: false,
                    skipped: false,
                    error: (error as { message?: string }).message ?? String(error)
                  };
              tests.push(testResult);
              emitAssertion(testResult);
            })
            .finally(() => {
              isInsideTest = false;
            });
        } else {
          // Synchronous test
          const testResult: TestResult = {
            name,
            passed: true,
            skipped: false
          };
          tests.push(testResult);
          emitAssertion(testResult);
          isInsideTest = false;
        }
      } catch (error: unknown) {
        // Check if this is a skip error
        const testResult: TestResult = error instanceof SkipError
          ? {
              name,
              passed: false,
              skipped: true,
              error: error.skipReason  // Include skip reason in error field
            }
          : {
              name,
              passed: false,
              skipped: false,
              error: (error as { message?: string }).message ?? String(error)
            };
        tests.push(testResult);
        emitAssertion(testResult);
        isInsideTest = false;
      }
    },

    /**
     * Skip the current test
     * Must be called inside quest.test() callback
     */
    skip(reason: string): never {
      if (!isInsideTest) {
        throw new Error('quest.skip() must be called inside quest.test() callback');
      }
      throw new SkipError(reason);
    },

    /**
     * Fail the current test with custom message
     * Must be called inside quest.test() callback
     */
    fail(message: string): never {
      if (!isInsideTest) {
        throw new Error('quest.fail() must be called inside quest.test() callback');
      }
      throw new Error(message);
    }
  };
}
