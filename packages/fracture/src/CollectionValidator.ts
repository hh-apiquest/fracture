import type {
  Collection,
  CollectionItem,
  Request,
  Folder,
  RuntimeOptions,
  ValidationResult,
  ValidationError,
} from '@apiquest/types';
import { ScriptType } from '@apiquest/types';
import { ScriptValidator } from './ScriptValidator.js';
import type { PluginManager } from './PluginManager.js';
import { Logger } from './Logger.js';
import { isNullOrWhitespace } from './utils.js';

/**
 * Validates collections and their items (folders/requests) for pre-run validation
 */
export class CollectionValidator {
  private logger: Logger;

  constructor(
    private readonly pluginManager: PluginManager,
    baseLogger?: Logger
  ) {
    this.logger = baseLogger?.createLogger('CollectionValidator') ?? new Logger('CollectionValidator');
  }

  /**
   * Validate entire collection structure, scripts, and configurations
   */
  async validateCollection(
    collection: Collection,
    options: RuntimeOptions,
    strictMode: boolean = true
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    this.logger.debug(`Validating collection: ${collection.info.name} (strict=${strictMode})`);

    // Get protocol plugin for validation
    const protocolPlugin = this.pluginManager.getPlugin(collection.protocol);
    if (protocolPlugin === undefined) {
      this.logger.warn(`Protocol plugin not loaded for validation: ${collection.protocol}`);
    }

    const seenIds = new Set<string>();

    // Helper to recursively validate all items
    const validateItem = (item: CollectionItem, path: string): void => {
      if (seenIds.has(item.id)) {
        errors.push({
          message: `Duplicate item id '${item.id}' found in collection`,
          location: path,
          source: 'schema'
        });
      } else {
        seenIds.add(item.id);
      }

      if (item.type === 'folder') {
        const folder = item;
        
        // Validate folder scripts
        if (!isNullOrWhitespace(folder.folderPreScript)) {
          errors.push(
            ...ScriptValidator.validateScript(
              folder.folderPreScript!,
              ScriptType.FolderPre,
              path,
              undefined,
              protocolPlugin,
              strictMode
            )
          );
        }
        if (!isNullOrWhitespace(folder.folderPostScript)) {
          errors.push(
            ...ScriptValidator.validateScript(
              folder.folderPostScript!,
              ScriptType.FolderPost,
              path,
              undefined,
              protocolPlugin,
              strictMode
            )
          );
        }
        if (!isNullOrWhitespace(folder.preRequestScript)) {
          errors.push(
            ...ScriptValidator.validateScript(
              folder.preRequestScript!,
              ScriptType.PreRequest,
              path,
              undefined,
              protocolPlugin,
              strictMode
            )
          );
        }
        if (!isNullOrWhitespace(folder.postRequestScript)) {
          errors.push(
            ...ScriptValidator.validateScript(
              folder.postRequestScript!,
              ScriptType.PostRequest,
              path,
              undefined,
              protocolPlugin,
              strictMode
            )
          );
        }

        // Validate auth config if present
        if (folder.auth !== null && folder.auth !== undefined && folder.auth.type !== 'inherit' && folder.auth.type !== 'none') {
          const authPlugin = this.pluginManager.getAuthPlugin(folder.auth.type);
          if (authPlugin?.validate !== null && authPlugin?.validate !== undefined) {
            const authResult = authPlugin.validate(folder.auth, options);
            if (authResult.valid === false && authResult.errors !== null && authResult.errors !== undefined) {
              errors.push(...authResult.errors);
            }
          }
        }

        // Recursively validate folder items
        for (const child of folder.items) {
          const childPath = `${path}/${child.name}`;
          validateItem(child, childPath);
        }
      } else {
        // Request validation
        const request = item;
        
        // Validate request scripts
        if (!isNullOrWhitespace(request.preRequestScript)) {
          errors.push(
            ...ScriptValidator.validateScript(
              request.preRequestScript!,
              ScriptType.PreRequest,
              path,
              undefined,
              protocolPlugin,
              strictMode
            )
          );
        }
        if (!isNullOrWhitespace(request.postRequestScript)) {
          errors.push(
            ...ScriptValidator.validateScript(
              request.postRequestScript!,
              ScriptType.PostRequest,
              path,
              undefined,
              protocolPlugin,
              strictMode
            )
          );
        }

        // Validate plugin event scripts
        if (request.data.scripts !== null && request.data.scripts !== undefined && Array.isArray(request.data.scripts)) {
          // Check for duplicate event scripts (only one script per event type allowed)
          const eventCounts = new Map<string, number>();
          for (const script of request.data.scripts) {
            const count = eventCounts.get(script.event) ?? 0;
            eventCounts.set(script.event, count + 1);
            
            if (count >= 1) {
              errors.push({
                message: `Request has multiple scripts for event "${script.event}". Only one script per event type is allowed.`,
                location: path,
                source: 'script'
              });
            }
          }
          
          // Validate each script
          if (protocolPlugin?.events !== null && protocolPlugin?.events !== undefined) {
            for (const script of request.data.scripts) {
              const eventDef = protocolPlugin.events.find(e => e.name === script.event);
              if (eventDef !== null && eventDef !== undefined) {
                errors.push(
                  ...ScriptValidator.validateScript(
                    script.script,
                    ScriptType.PluginEvent,
                    path,
                    eventDef,
                    protocolPlugin,
                    strictMode
                  )
                );
              }
            }
          }
        }

        // Validate protocol request via plugin
        if (protocolPlugin?.validate !== null && protocolPlugin?.validate !== undefined) {
          const protocolResult = protocolPlugin.validate(request, options);
          if (protocolResult.valid === false && protocolResult.errors !== null && protocolResult.errors !== undefined) {
            errors.push(
              ...protocolResult.errors.map(err => ({
                ...err,
                location: path
              }))
            );
          }
        }

        // Validate auth config if present
        if (request.auth !== null && request.auth !== undefined && request.auth.type !== 'inherit' && request.auth.type !== 'none') {
          const authPlugin = this.pluginManager.getAuthPlugin(request.auth.type);
          if (authPlugin?.validate !== null && authPlugin?.validate !== undefined) {
            const authResult = authPlugin.validate(request.auth, options);
            if (authResult.valid === false && authResult.errors !== null && authResult.errors !== undefined) {
              errors.push(
                ...authResult.errors.map(err => ({
                  ...err,
                  location: path
                }))
              );
            }
          }
        }
      }
    };

    // Validate collection-level scripts
    if (!isNullOrWhitespace(collection.collectionPreScript)) {
      errors.push(
        ...ScriptValidator.validateScript(
          collection.collectionPreScript!,
          ScriptType.CollectionPre,
          '/',
          undefined,
          protocolPlugin,
          strictMode
        )
      );
    }
    if (!isNullOrWhitespace(collection.collectionPostScript)) {
      errors.push(
        ...ScriptValidator.validateScript(
          collection.collectionPostScript!,
          ScriptType.CollectionPost,
          '/',
          undefined,
          protocolPlugin,
          strictMode
        )
      );
    }
    if (!isNullOrWhitespace(collection.preRequestScript)) {
      errors.push(
        ...ScriptValidator.validateScript(
          collection.preRequestScript!,
          ScriptType.PreRequest,
          '/',
          undefined,
          protocolPlugin,
          strictMode
        )
      );
    }
    if (!isNullOrWhitespace(collection.postRequestScript)) {
      errors.push(
        ...ScriptValidator.validateScript(
          collection.postRequestScript!,
          ScriptType.PostRequest,
          '/',
          undefined,
          protocolPlugin,
          strictMode
        )
      );
    }

    // Validate collection-level auth
    if (collection.auth !== null && collection.auth !== undefined && collection.auth.type !== 'inherit' && collection.auth.type !== 'none') {
      const authPlugin = this.pluginManager.getAuthPlugin(collection.auth.type);
      if (authPlugin?.validate !== null && authPlugin?.validate !== undefined) {
        const authResult = authPlugin.validate(collection.auth, options);
        if (authResult.valid === false && authResult.errors !== null && authResult.errors !== undefined) {
          errors.push(...authResult.errors);
        }
      }
    }

    // Validate all items recursively
    for (const item of collection.items) {
      validateItem(item, `/${item.name}`);
    }

    this.logger.debug(`Validation completed with ${errors.length} error(s)`);

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
