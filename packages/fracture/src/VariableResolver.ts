import type { ExecutionContext, IterationData } from '@apiquest/types';
import { extractValue, isNullOrEmpty } from './utils.js';
import { Logger } from './Logger.js';

export class VariableResolver {
  private logger: Logger;

  constructor(baseLogger?: Logger) {
    this.logger = baseLogger?.createLogger('VariableResolver') ?? new Logger('VariableResolver');
  }

  /**
   * Resolve {{variables}} in a template string
   * Priority: iteration data > local > collection > environment > global
   */
  resolve(template: string, context: ExecutionContext): string {
    if (isNullOrEmpty(template) || typeof template !== 'string') {
      return template;
    }

    // Find all {{variable}} patterns
    const variableCount = (template.match(/\{\{([^}]+)\}\}/g) ?? []).length;
    if (variableCount > 0) {
      this.logger.trace(`Resolving ${variableCount} variable(s) in template`);
    }

    return template.replace(/\{\{([^}]+)\}\}/g, (match: string, varName: string) => {
      const trimmedName = varName.trim();
      const value = this.getVariable(trimmedName, context);
      
      if (value !== null && value !== undefined) {
        this.logger.trace(`Resolved {{${trimmedName}}} -> ${typeof value === 'string' && value.length > 50 ? value.substring(0, 50) + '...' : value}`);
        return String(value);
      } else {
        this.logger.trace(`Variable {{${trimmedName}}} not found, keeping placeholder`);
        return match;
      }
    });
  }

  /**
   * Resolve all values in an object (recursively)
   */
  resolveAll(obj: unknown, context: ExecutionContext): unknown {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.resolve(obj, context);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.resolveAll(item, context));
    }

    if (typeof obj === 'object') {
      const resolved: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        resolved[key] = this.resolveAll(value, context);
      }
      return resolved;
    }

    return obj;
  }

  /**
   * Get variable value with cascading priority
   * Priority: iteration data > scope stack (innermost to outermost) > collection > environment > global
   */
  private getVariable(name: string, context: ExecutionContext): unknown {
    // 1. Iteration data (highest priority)
    const currentIterationData = context.iterationData?.[context.iterationCurrent - 1];
    if (currentIterationData !== null && currentIterationData !== undefined && name in currentIterationData) {
      this.logger.trace(`Variable '${name}' found in iteration data`);
      return currentIterationData[name];
    }

    // 2. Scope stack (hierarchical scope variables - search from innermost to outermost)
    // This represents quest.scope.variables which flows through the script inheritance chain
    if (context.scopeStack !== null && context.scopeStack !== undefined && context.scopeStack.length > 0) {
      // Search from top of stack (most specific) to bottom (least specific)
      for (let i = context.scopeStack.length - 1; i >= 0; i--) {
        const frame = context.scopeStack[i];
        if (name in frame.vars) {
          this.logger.trace(`Variable '${name}' found in scope stack (frame ${context.scopeStack.length - 1 - i})`);
          return frame.vars[name];
        }
      }
    }

    // 3. Collection variables
    if (name in context.collectionVariables) {
      this.logger.trace(`Variable '${name}' found in collection variables`);
      return extractValue(context.collectionVariables[name]);
    }

    // 4. Environment variables
    if (context.environment !== null && context.environment !== undefined && name in context.environment.variables) {
      this.logger.trace(`Variable '${name}' found in environment variables`);
      return extractValue(context.environment.variables[name]);
    }

    // 5. Global variables (lowest priority)
    if (name in context.globalVariables) {
      this.logger.trace(`Variable '${name}' found in global variables`);
      return extractValue(context.globalVariables[name]);
    }

    this.logger.trace(`Variable '${name}' not found in any scope`);
    return null;
  }
}
