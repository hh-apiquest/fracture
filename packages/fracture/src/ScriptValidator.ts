import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { ValidationError, ScriptType, PluginEventDefinition, IProtocolPlugin } from '@apiquest/types';

/**
 * ScriptValidator provides AST-based validation and analysis of collection scripts
 * - Validates quest.test() placement (disallowed in pre-scripts, certain plugin events)
 * - Validates quest.expectMessages() placement (only in preRequestScript)
 * - Detects conditional test declarations (breaks determinism)
 * - Counts expected tests for progress reporting
 */
export class ScriptValidator {
  /**
   * Validate that quest.test() calls are only in allowed script types
   * @param script - JavaScript code to validate
   * @param scriptType - Type of script (collection-pre, request-post, etc.)
   * @param path - Request path for error reporting
   * @returns Array of validation errors (empty if valid)
   */
  static validateTestLocation(
    script: string,
    scriptType: ScriptType,
    path: string
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Disallow quest.test() in these script types
    const disallowedTypes = [
      ScriptType.CollectionPre,
      ScriptType.CollectionPost,
      ScriptType.FolderPre,
      ScriptType.FolderPost,
      ScriptType.PreRequest,
    ];

    if (!disallowedTypes.includes(scriptType)) {
      return []; // Allowed in PostRequest and some PluginEvent scripts
    }

    // Parse and check for quest.test() calls
    try {
      const ast = acorn.parse(script, { ecmaVersion: 2022, sourceType: 'module', locations: true });
      
      walk.simple(ast, {
        CallExpression(node: acorn.CallExpression) {
          if (
            node.callee.type === 'MemberExpression' &&
            (node.callee).object.type === 'Identifier' &&
            ((node.callee).object).name === 'quest' &&
            (node.callee).property.type === 'Identifier' &&
            ((node.callee).property).name === 'test'
          ) {
            errors.push({
              message: `quest.test() is not allowed in ${scriptType} scripts`,
              location: path,
              source: 'script',
              scriptType,
              details: {
                line: node.loc?.start.line,
                column: node.loc?.start.column,
                suggestion: 'Move tests to postRequestScript or use quest.skip() inside tests',
              },
            });
          }
        },
      });
    } catch (error) {
      const err = error as { message?: string; loc?: { line?: number; column?: number } };
      errors.push({
        message: `Syntax error in script: ${err.message ?? String(error)}`,
        location: path,
        source: 'script',
        scriptType,
        details: {
          line: err.loc?.line,
          column: err.loc?.column,
        },
      });
    }

    return errors;
  }

  /**
   * Validate that quest.test() is NOT inside conditional statements (breaks determinism)
   * @param script - JavaScript code to validate
   * @param scriptType - Type of script
   * @param path - Request path for error reporting
   * @returns Array of validation errors (empty if valid)
   */
  static validateNoConditionalTests(
    script: string,
    scriptType: ScriptType,
    path: string
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    try {
      const ast = acorn.parse(script, { ecmaVersion: 2022, sourceType: 'module', locations: true });

      walk.ancestor(ast, {
        CallExpression(node: acorn.CallExpression, ancestors: acorn.Node[]) {
          if (
            node.callee.type === 'MemberExpression' &&
            (node.callee).object.type === 'Identifier' &&
            ((node.callee).object).name === 'quest' &&
            (node.callee).property.type === 'Identifier' &&
            ((node.callee).property).name === 'test'
          ) {
            const insideConditional = ancestors.some(
              (ancestor) =>
                ancestor.type === 'IfStatement' ||
                ancestor.type === 'ConditionalExpression' ||
                ancestor.type === 'LogicalExpression' ||
                ancestor.type === 'TryStatement'
            );

            if (insideConditional) {
              errors.push({
                message: 'quest.test() cannot be declared conditionally (breaks deterministic test counting)',
                location: path,
                source: 'script',
                scriptType,
                details: {
                  line: node.loc?.start.line,
                  column: node.loc?.start.column,
                  suggestion: 'Use quest.skip() inside the test, or use request.condition field for request-level control',
                },
              });
            }
          }
        },
      });
    } catch (error) {
      // Syntax errors already caught by validateTestLocation
    }

    return errors;
  }

  /**
   * Validate quest.expectMessages() is only called in preRequestScript
   * and validates protocol supports plugin events with canHaveTests
   * @param script - JavaScript code to validate
   * @param scriptType - Type of script
   * @param path - Request path for error reporting
   * @param protocolPlugin - Protocol plugin to check for event support (optional)
   * @param eventName - Specific event name if this is a plugin event script (optional)
   * @returns Array of validation errors (empty if valid)
   */
  static validateExpectMessages(
    script: string,
    scriptType: ScriptType,
    path: string,
    protocolPlugin?: IProtocolPlugin,
    eventName?: string
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    try {
      const ast = acorn.parse(script, { ecmaVersion: 2022, sourceType: 'module', locations: true });

      walk.simple(ast, {
        CallExpression(node: acorn.CallExpression) {
          if (
            node.callee.type === 'MemberExpression' &&
            (node.callee).object.type === 'Identifier' &&
            ((node.callee).object).name === 'quest' &&
            (node.callee).property.type === 'Identifier' &&
            ((node.callee).property).name === 'expectMessages'
          ) {
            if (scriptType !== ScriptType.PreRequest) {
              errors.push({
                message: 'quest.expectMessages() can only be called in preRequestScript',
                location: path,
                source: 'script',
                scriptType,
                details: {
                  line: node.loc?.start.line,
                  column: node.loc?.start.column,
                },
              });
              return;
            }

            if (node.arguments.length > 0) {
              const arg = node.arguments[0];
              if (arg.type === 'Literal' && typeof (arg).value === 'number') {
                const numValue = (arg).value;
                if (!Number.isInteger(numValue) || numValue <= 0) {
                  errors.push({
                    message: 'quest.expectMessages() requires a positive integer count',
                    location: path,
                    source: 'script',
                    scriptType,
                    details: {
                      line: node.loc?.start.line,
                      column: node.loc?.start.column,
                      suggestion: 'Use a positive integer like quest.expectMessages(10)',
                    },
                  });
                }
              } else if (arg.type === 'UnaryExpression' && (arg).operator === '-') {
                errors.push({
                  message: 'quest.expectMessages() requires a positive integer count',
                  location: path,
                  source: 'script',
                  scriptType,
                  details: {
                    line: node.loc?.start.line,
                    column: node.loc?.start.column,
                    suggestion: 'Use a positive integer like quest.expectMessages(10)',
                  },
                });
              }
            }

            if (protocolPlugin !== undefined) {
              if (eventName !== undefined) {
                const eventDef = protocolPlugin.events?.find(
                  (event: PluginEventDefinition) => event.name === eventName
                );
                if (eventDef !== undefined && eventDef.canHaveTests !== true) {
                  errors.push({
                    message: `quest.expectMessages() is not supported for event '${eventName}' (canHaveTests is false)`,
                    location: path,
                    source: 'script',
                    scriptType,
                    details: {
                      line: node.loc?.start.line,
                      column: node.loc?.start.column,
                      suggestion: 'quest.expectMessages() can only be used with events that support tests',
                    },
                  });
                }
              } else {
                const hasTestableEvents = protocolPlugin.events?.some(
                  (event: PluginEventDefinition) => event.canHaveTests === true
                ) ?? false;
                
                if (hasTestableEvents === false) {
                  errors.push({
                    message: `quest.expectMessages() is not supported for protocol '${protocolPlugin.protocols[0]}' (no plugin events with canHaveTests)`,
                    location: path,
                    source: 'script',
                    scriptType,
                    details: {
                      line: node.loc?.start.line,
                      column: node.loc?.start.column,
                      suggestion: 'quest.expectMessages() is only for streaming protocols (websocket, sse, grpc)',
                    },
                  });
                }
              }
            }
          }
        },
      });
    } catch (error) {
      // Syntax errors already caught by validateTestLocation
    }

    return errors;
  }

  /**
   * Validate plugin event script can have tests (based on PluginEventDefinition)
   * @param script - JavaScript code to validate
   * @param eventDefinition - Plugin event definition with canHaveTests flag
   * @param path - Request path for error reporting
   * @returns Array of validation errors (empty if valid)
   */
  static validatePluginEventScript(
    script: string,
    eventDefinition: PluginEventDefinition,
    path: string
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    if (eventDefinition.canHaveTests) {
      return []; // Tests are allowed
    }

    // Check for quest.test() calls when not allowed
    try {
      const ast = acorn.parse(script, { ecmaVersion: 2022, sourceType: 'module', locations: true });

      walk.simple(ast, {
        CallExpression(node: acorn.CallExpression) {
          if (
            node.callee.type === 'MemberExpression' &&
            (node.callee).object.type === 'Identifier' &&
            ((node.callee).object).name === 'quest' &&
            (node.callee).property.type === 'Identifier' &&
            ((node.callee).property).name === 'test'
          ) {
            errors.push({
              message: `quest.test() is not allowed in plugin event '${eventDefinition.name}' (canHaveTests: false)`,
              location: path,
              source: 'script',
              scriptType: ScriptType.PluginEvent,
              details: {
                line: node.loc?.start.line,
                column: node.loc?.start.column,
                suggestion: `Only use quest.test() in plugin events that allow tests (check plugin.events[].canHaveTests)`,
              },
            });
          }
        },
      });
    } catch (error) {
      // Syntax errors already caught by validateTestLocation
    }

    return errors;
  }

  /**
   * Count total quest.test() calls in a script (for deterministic test counting)
   * @param script - JavaScript code to analyze
   * @returns Number of quest.test() calls found
   */
  static countTests(script: string): number {
    let count = 0;

    try {
      const ast = acorn.parse(script, { ecmaVersion: 2022, sourceType: 'module' });

      walk.simple(ast, {
        CallExpression(node: acorn.CallExpression) {
          if (
            node.callee.type === 'MemberExpression' &&
            (node.callee).object.type === 'Identifier' &&
            ((node.callee).object).name === 'quest' &&
            (node.callee).property.type === 'Identifier' &&
            ((node.callee).property).name === 'test'
          ) {
            count++;
          }
        },
      });
    } catch (error) {
      // If script has syntax errors, return 0 (will be caught by validation)
      return 0;
    }

    return count;
  }

  /**
   * Extract expected message count from quest.expectMessages() call in preRequestScript
   * @param script - JavaScript code to analyze (must be preRequestScript)
   * @returns Expected message count, or null if not specified
   */
  static extractExpectedMessages(script: string): number | null {
    let expectedCount: number | null = null;

    try {
      const ast = acorn.parse(script, { ecmaVersion: 2022, sourceType: 'module' });

      walk.simple(ast, {
        CallExpression(node: acorn.CallExpression) {
          if (
            node.callee.type === 'MemberExpression' &&
            (node.callee).object.type === 'Identifier' &&
            ((node.callee).object).name === 'quest' &&
            (node.callee).property.type === 'Identifier' &&
            ((node.callee).property).name === 'expectMessages'
          ) {
            if (node.arguments.length > 0) {
              const firstArg = node.arguments[0];
              if (firstArg.type === 'Literal' && typeof (firstArg).value === 'number') {
                expectedCount = (firstArg).value;
              }
            }
          }
        },
      });
    } catch (error) {
      // If script has syntax errors, return null
      return null;
    }

    return expectedCount;
  }

  /**
   * Validate all aspects of a script (comprehensive validation)
   * @param script - JavaScript code to validate
   * @param scriptType - Type of script
   * @param path - Request path for error reporting
   * @param eventDefinition - Optional plugin event definition (for PluginEvent scripts)
   * @param protocolPlugin - Optional protocol plugin for protocol-specific validation
   * @returns Array of validation errors (empty if valid)
   */
  static validateScript(
    script: string,
    scriptType: ScriptType,
    path: string,
    eventDefinition?: PluginEventDefinition,
    protocolPlugin?: IProtocolPlugin,
    strictMode: boolean = true
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // 1. Validate test location
    errors.push(...this.validateTestLocation(script, scriptType, path));

    if (strictMode === true && (scriptType === ScriptType.PostRequest || eventDefinition?.canHaveTests === true)) {
      errors.push(...this.validateNoConditionalTests(script, scriptType, path));
    }

    // 3. Validate quest.expectMessages() placement
    errors.push(...this.validateExpectMessages(
      script, 
      scriptType, 
      path, 
      protocolPlugin,
      eventDefinition?.name  // Pass event name if this is a plugin event script
    ));

    if (scriptType === ScriptType.PluginEvent && eventDefinition !== undefined) {
      errors.push(...this.validatePluginEventScript(script, eventDefinition, path));
    }

    return errors;
  }
}
