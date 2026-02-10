import type { Collection, CollectionItem, Request, Folder } from '@apiquest/types';
import { ScriptValidator } from './ScriptValidator.js';
import type { PluginManager } from './PluginManager.js';
import { Logger } from './Logger.js';

/**
 * Counts total expected tests in a collection for deterministic test reporting
 */
export class TestCounter {
  private logger: Logger;

  constructor(
    private readonly pluginManager: PluginManager,
    baseLogger?: Logger
  ) {
    this.logger = baseLogger?.createLogger('TestCounter') ?? new Logger('TestCounter');
  }

  /**
   * Count total expected tests in collection
   * - Counts quest.test() calls in all scripts
   * - Multiplies by iteration count
   * - Returns -1 if collection has dynamic plugin events (can't determine count)
   * @returns Total expected test count, or -1 if dynamic
   */
  countTests(collection: Collection): number {
    let totalTests = 0;
    let hasDynamicTests = false;

    this.logger.debug(`Counting tests for collection: ${collection.info.name}`);

    // Note: collectionPre/Post and folderPre/Post scripts CANNOT have tests (validation catches this)
    // Only preRequestScript and postRequestScript can have tests

    // Helper to walk tree and count tests for each REQUEST with inherited scripts
    const countRequestTests = (item: CollectionItem, inheritedPreRequest: string[], inheritedPostRequest: string[]): void => {
      if (item.type === 'folder') {
        const folder = item;

        // Build inherited script chain (scripts STACK, not override)
        const newInheritedPre = (folder.preRequestScript !== null && folder.preRequestScript !== undefined && folder.preRequestScript.length > 0)
          ? [...inheritedPreRequest, folder.preRequestScript]
          : inheritedPreRequest;
        const newInheritedPost = (folder.postRequestScript !== null && folder.postRequestScript !== undefined && folder.postRequestScript.length > 0)
          ? [...inheritedPostRequest, folder.postRequestScript]
          : inheritedPostRequest;

        // Recursively process folder contents
        for (const child of folder.items) {
          countRequestTests(child, newInheritedPre, newInheritedPost);
        }
      } else {
        // Request - count ALL scripts in execution chain for THIS request
        const request = item;
        
        // Inherited postRequestScripts (collection and all ancestor folders) - they STACK
        for (const script of inheritedPostRequest) {
          totalTests += ScriptValidator.countTests(script);
        }

        // Request-level postRequestScript (this is where tests are!)
        if (request.postRequestScript !== null && request.postRequestScript !== undefined && request.postRequestScript.length > 0) {
          totalTests += ScriptValidator.countTests(request.postRequestScript);
        }

        // Plugin event scripts
        if (request.data.scripts !== null && request.data.scripts !== undefined && Array.isArray(request.data.scripts)) {
          const protocolPlugin = this.pluginManager.getPlugin(collection.protocol);
          if (protocolPlugin?.events !== null && protocolPlugin?.events !== undefined) {
            for (const script of request.data.scripts) {
              const eventDef = protocolPlugin.events.find(e => e.name === script.event);
              if (eventDef?.canHaveTests === true) {
                const expectedMessages = ScriptValidator.extractExpectedMessages(
                  (request.preRequestScript !== null && request.preRequestScript !== undefined && request.preRequestScript.length > 0) ? request.preRequestScript : ''
                );
                
                if (expectedMessages !== null) {
                  const testsPerEvent = ScriptValidator.countTests(script.script);
                  totalTests += testsPerEvent * expectedMessages;
                } else {
                  hasDynamicTests = true;
                }
              }
            }
          }
        }
      }
    };

    // Process all items with collection-level inherited scripts
    const collectionPre = (collection.preRequestScript !== null && collection.preRequestScript !== undefined && collection.preRequestScript.length > 0) ? [collection.preRequestScript] : [];
    const collectionPost = (collection.postRequestScript !== null && collection.postRequestScript !== undefined && collection.postRequestScript.length > 0) ? [collection.postRequestScript] : [];
    
    for (const item of collection.items) {
      countRequestTests(item, collectionPre, collectionPost);
    }

    // Multiply by iteration count
    const iterationCount = (collection.testData?.length !== null && collection.testData?.length !== undefined && collection.testData.length > 0) ? collection.testData.length : 1;
    totalTests *= iterationCount;

    const result = hasDynamicTests ? -1 : totalTests;
    if (hasDynamicTests) {
      this.logger.debug('Dynamic test count detected; returning -1');
    }
    this.logger.debug(`Expected test count resolved: ${result}`);
    return result;
  }
}
