import type {
  IAuthPlugin,
  IProtocolPlugin,
  Request,
  Auth,
  ExecutionContext,
  RuntimeOptions,
  AuthExecutor
} from '@apiquest/types';
import { Logger } from './Logger.js';

/**
 * AuthNegotiator handles all auth orchestration logic for request execution.
 *
 * Responsibilities:
 * - Build an AuthExecutor around the active protocol plugin
 * - Dispatch to negotiate() for multi-round handshake auth (Digest, NTLM)
 * - Dispatch to apply() for preemptive one-shot auth (Bearer, Basic, ApiKey, OAuth2)
 *
 */
export class AuthNegotiator {
  private logger: Logger;

  constructor(baseLogger?: Logger) {
    this.logger = baseLogger?.createLogger('AuthNegotiator') ?? new Logger('AuthNegotiator');
  }

  /**
   * Build an AuthExecutor for the given protocol plugin.
   * Uses the protocol plugin's createAuthExecutor() if available,
   * otherwise wraps plugin.execute() directly (works for HTTP, SOAP, GraphQL).
   */
  buildAuthExecutor(
    plugin: IProtocolPlugin,
    context: ExecutionContext,
    options: RuntimeOptions,
    emitEvent?: (eventName: string, eventData: unknown) => Promise<void>
  ): AuthExecutor {
    if ('createAuthExecutor' in plugin && typeof plugin.createAuthExecutor === 'function') {
      return plugin.createAuthExecutor(context, options, emitEvent);
    }
    return {
      send: async (req: Request) => {
        return await plugin.execute(req, context, options, emitEvent);
      }
    };
  }

  /**
   * Apply preemptive auth to request (apply() path: bearer, basic, apikey, oauth2, etc.).
   * Called when the auth plugin implements apply() but not negotiate().
   */
  private async applyAuth(
    request: Request,
    auth: Auth,
    authPlugin: IAuthPlugin,
    options: RuntimeOptions
  ): Promise<Request> {
    if (typeof authPlugin.apply !== 'function') {
      this.logger.error(`Auth plugin '${auth.type}' has no apply() method`);
      throw new Error(`Auth plugin '${auth.type}' has no apply() method`);
    }

    this.logger.debug(`Applying auth: ${auth.type} (plugin: ${authPlugin.name})`);

    try {
      const pluginLogger = this.logger.createLogger(`Auth:${authPlugin.name}`);
      return await authPlugin.apply(request, auth, options, pluginLogger);
    } catch (error: unknown) {
      const errorMsg = (error as { message?: string }).message ?? 'Unknown error';
      this.logger.error(`Auth plugin error (${auth.type}): ${errorMsg}`);
      throw new Error(`Auth plugin error (${auth.type}): ${errorMsg}`);
    }
  }

  /**
   * Execute auth for a request.
   *
   * Dispatches to negotiate() for multi-round handshakes (Digest, NTLM) or
   * apply() for preemptive one-shot auth (Bearer, Basic, ApiKey, OAuth2).
   *
   * Returns the possibly-modified request with auth headers applied.
   * Updates context.currentRequest when auth modifies the request.
   *
   * @param request - The request to authenticate
   * @param auth - Auth configuration from the request/collection
   * @param authPlugins - Map of auth type -> IAuthPlugin
   * @param protocolPlugin - Active protocol plugin (needed to build AuthExecutor for negotiate)
   * @param context - Execution context (currentRequest will be updated)
   * @param options - Merged runtime options
   * @param emitEvent - Optional plugin event callback (passed to AuthExecutor)
   */
  async executeAuth(
    request: Request,
    auth: Auth,
    authPlugins: Map<string, IAuthPlugin>,
    protocolPlugin: IProtocolPlugin,
    context: ExecutionContext,
    options: RuntimeOptions,
    emitEvent?: (eventName: string, eventData: unknown) => Promise<void>
  ): Promise<Request> {
    // No-op auth types — pass through unchanged
    if (auth.type === 'none' || auth.type === 'inherit') {
      context.currentRequest = request;
      return request;
    }

    const authPlugin = authPlugins.get(auth.type);

    if (authPlugin === null || authPlugin === undefined) {
      this.logger.error(`No auth plugin registered for type: ${auth.type}`);
      throw new Error(`No auth plugin registered for type: ${auth.type}`);
    }

    const hasNegotiate = typeof authPlugin.negotiate === 'function';
    const hasApply = typeof authPlugin.apply === 'function';

    if (!hasNegotiate && !hasApply) {
      throw new Error(
        `Auth plugin '${auth.type}' must implement either apply() or negotiate(). ` +
        `Plugin '${authPlugin.name}' has neither.`
      );
    }

    const authPluginLogger = this.logger.createLogger(`Auth:${authPlugin.name}`);
    let modifiedRequest = request;

    if (hasNegotiate) {
      // Handshake path: auth plugin drives the full challenge/response exchange.
      this.logger.debug(`Negotiating auth: ${auth.type} (plugin: ${authPlugin.name})`);
      try {
        const executor = this.buildAuthExecutor(protocolPlugin, context, options, emitEvent);
        modifiedRequest = await authPlugin.negotiate!(modifiedRequest, auth, options, executor, authPluginLogger);
      } catch (error: unknown) {
        const errorMsg = (error as { message?: string }).message ?? 'Unknown error';
        this.logger.error(`Auth negotiate error (${auth.type}): ${errorMsg}`);
        throw new Error(`Auth negotiate error (${auth.type}): ${errorMsg}`);
      }
    } else {
      // Preemptive path: bearer, basic, apikey, oauth2, etc.
      modifiedRequest = await this.applyAuth(modifiedRequest, auth, authPlugin, options);
    }

    // Update context.currentRequest to reflect auth modifications
    context.currentRequest = modifiedRequest;
    return modifiedRequest;
  }
}
