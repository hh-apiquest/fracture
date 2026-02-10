/**
 * TaskGraph - DAG Builder for Parallel Execution
 *
 * Transforms a collection tree into a directed acyclic graph (DAG) where:
 * - Nodes represent atomic tasks (script execution or request I/O)
 * - Edges represent ordering dependencies (structural + explicit dependsOn)
 *
 * Design:
 * - Script nodes: Serial execution through script queue (collection-pre/post, folder-pre/post, plugin events)
 * - Request nodes: Parallel execution via request pool
 *   - Inherited pre/post scripts execute INSIDE request through script queue
 *   - These are stored in node metadata, not as separate DAG nodes
 *
 * Edge types:
 * - Structural: Parent-child hierarchy (folder-pre → children → folder-post)
 * - DependsOn: Explicit dependencies from request/folder dependsOn fields
 * - Event: Request → plugin event scripts → parent folder-post
 */

import type {
  Collection,
  CollectionItem,
  Folder,
  Request,
  ProtocolScript,
  ScriptType,
  PathType,
  Auth
} from '@apiquest/types';
import { isNullOrWhitespace } from './utils.js';
import { Logger } from './Logger.js';

/**
 * TaskNode represents a node in the DAG
 * Can be either a script node or a request node
 */
export interface TaskNode {
  // Identity
  id: string;
  name: string;
  type: 'script' | 'request' | 'folder-enter' | 'folder-exit';
  path: PathType;
  parentFolderId?: PathType;
  
  // Script node fields
  scriptType?: ScriptType;
  script?: string;
  
  // Request/Folder condition
  condition?: string;
  
  // Request node: inherited scripts (executed inside request through script queue)
  // Array maintains order: outermost to innermost
  inheritedPreScripts?: string[];    // Collection → Folders → Request
  inheritedPostScripts?: string[];   // Request → Folders → Collection (LIFO)
  
  // Auth inheritance: Request > Folder > Parent Folder > Collection
  effectiveAuth?: Auth;
  
  // Original item (for request/folder execution)
  item?: Request | Folder;
  
  // Plugin event metadata (for script nodes of type plugin-event)
  eventName?: string;
  parentRequestId?: string;
}

/**
 * TaskEdge represents a dependency between two nodes
 */
export interface TaskEdge {
  from: string;
  to: string;
  type: 'structural' | 'dependsOn' | 'event';
}

/**
 * Builds DAG from collection structure
 */
export class TaskGraph {
  private nodes: Map<string, TaskNode> = new Map();
  private edges: TaskEdge[] = [];
  private dependentsMap: Map<string, string[]> = new Map();
  private inDegreeMap: Map<string, number> = new Map();
  private parentByNodeId: Map<string, PathType> = new Map();
  private childrenByFolderId: Map<PathType, string[]> = new Map();
  private logger: Logger;
  private allowParallel: boolean = false;  // Default to sequential
  
  // Mappings for dependsOn resolution
  private startNodeByItemId: Map<string, string> = new Map();
  private completionNodeByItemId: Map<string, string> = new Map();
  private pendingDependsOn: Array<{ depId: string; targetItemId: string }> = [];

  constructor(baseLogger?: Logger) {
    this.logger = baseLogger?.createLogger('TaskGraph') ?? new Logger('TaskGraph');
  }

  /**
   * Build DAG from collection
   * @param collection - The collection to build
   * @param allowParallel - Whether parallel execution is enabled (affects DAG structure)
   */
  public build(collection: Collection, allowParallel: boolean = false): void {
    this.allowParallel = allowParallel;
    this.logger.debug(`Building DAG: allowParallel=${allowParallel}, collection="${collection.info.name}"`);
    
    const collectionPreId = 'script:collection-pre';
    const collectionPostId = 'script:collection-post';

    // Add collection-level script nodes
    this.addNode({
      id: collectionPreId,
      name: 'collection-pre',
      type: 'script',
      scriptType: 'collection-pre' as ScriptType,
      script: collection.collectionPreScript,
      path: 'collection:/'
    });

    this.addNode({
      id: collectionPostId,
      name: 'collection-post',
      type: 'script',
      scriptType: 'collection-post' as ScriptType,
      script: collection.collectionPostScript,
      path: 'collection:/'
    });

    // Build inherited script arrays
    const collectionPreScripts = this.toArray(collection.preRequestScript);
    const collectionPostScripts = this.toArray(collection.postRequestScript);

    // Start with collection-level auth (if present)
    const collectionAuth = collection.auth;

    // Build child nodes
    // In sequential mode: add explicit edges to enforce declaration order
    // In parallel mode: siblings can execute concurrently (no sequential edges)
    let previousCompletionId: string = collectionPreId;
    
    for (const item of collection.items) {
      this.logger.trace(`Building item: ${item.type}:${item.name}, previousCompletionId=${previousCompletionId}`);
      const { startId, endId } = this.buildItem(
        item,
        'collection:/',
        previousCompletionId,  // Sequential: this item waits for previous
        collectionPostId,
        collectionPreScripts,
        collectionPostScripts,
        collectionAuth
      );
      
      this.logger.trace(`Built item: startId=${startId}, endId=${endId}`);
      
      // Update previousCompletionId for next sibling
      // Sequential mode: endId (strict ordering)
      // Parallel mode: collectionPreId (all siblings start after collection-pre)
      previousCompletionId = this.allowParallel ? collectionPreId : endId;
    }
    
    // Final barrier: last item → collection-post
    if (!this.allowParallel) {
      this.logger.trace(`Adding final sequential barrier: ${previousCompletionId} → ${collectionPostId}`);
      this.addEdge(previousCompletionId, collectionPostId, 'structural');
    }
    
    this.logger.debug(`DAG built: ${this.nodes.size} nodes, ${this.edges.length} edges`);

    // Resolve dependsOn edges
    this.resolveDependsOnEdges();
  }

  /**
   * Get all nodes
   */
  public getNodes(): Map<string, TaskNode> {
    return this.nodes;
  }

  /**
   * Get all edges
   */
  public getEdges(): TaskEdge[] {
    return this.edges;
  }

  public getChildrenByFolderId(): Map<PathType, string[]> {
    return this.childrenByFolderId;
  }

  public getParentByNodeId(): Map<string, PathType> {
    return this.parentByNodeId;
  }

  /**
   * Get dependents for a node
   */
  public getDependents(nodeId: string): string[] {
    return this.dependentsMap.get(nodeId) ?? [];
  }

  /**
   * Get in-degree for a node
   */
  public getInDegree(nodeId: string): number {
    return this.inDegreeMap.get(nodeId) ?? 0;
  }

  /**
   * Get nodes with zero in-degree (ready for execution)
   */
  public getReadyNodes(): TaskNode[] {
    const ready: TaskNode[] = [];
    for (const [nodeId, degree] of this.inDegreeMap) {
      if (degree === 0) {
        const node = this.nodes.get(nodeId);
        if (node !== undefined) {
          ready.push(node);
        }
      }
    }
    
    this.logger.trace(`getReadyNodes() found ${ready.length} nodes: ${ready.map(n => `${n.type}:${n.name ?? n.id}`).join(', ')}`);
    
    return ready;
  }

  /**
   * Mark node as complete and return newly ready nodes
   */
  public completeNode(nodeId: string): TaskNode[] {
    const nowReady: TaskNode[] = [];
    const deps = this.getDependents(nodeId);
    
    for (const depId of deps) {
      const currentDegree = this.inDegreeMap.get(depId) ?? 0;
      const newDegree = currentDegree - 1;
      this.inDegreeMap.set(depId, newDegree);
      
      if (newDegree === 0) {
        const node = this.nodes.get(depId);
        if (node !== undefined) {
          nowReady.push(node);
        }
      }
    }
    
    this.logger.trace(`completeNode(${nodeId}) made ${nowReady.length} nodes ready: ${nowReady.map(n => `${n.type}:${n.name ?? n.id}`).join(', ')}`);
    
   return nowReady;
  }

  private addNode(node: TaskNode): void {
    this.nodes.set(node.id, node);
    if (node.parentFolderId !== undefined) {
      this.parentByNodeId.set(node.id, node.parentFolderId);
      const children = this.childrenByFolderId.get(node.parentFolderId) ?? [];
      children.push(node.id);
      this.childrenByFolderId.set(node.parentFolderId, children);
    }
    if (!this.dependentsMap.has(node.id)) {
      this.dependentsMap.set(node.id, []);
    }
    if (!this.inDegreeMap.has(node.id)) {
      this.inDegreeMap.set(node.id, 0);
    }
  }

  private addEdge(from: string, to: string, type: 'structural' | 'dependsOn' | 'event'): void {
    this.edges.push({ from, to, type });
    
    // Update dependents
    const deps = this.dependentsMap.get(from) ?? [];
    deps.push(to);
    this.dependentsMap.set(from, deps);
    
    // Increment in-degree
    const degree = this.inDegreeMap.get(to) ?? 0;
    this.inDegreeMap.set(to, degree + 1);
  }

  private buildItem(
    item: CollectionItem,
    parentPath: PathType,
    parentPreId: string,
    parentPostId: string,
    inheritedPreScripts: string[],
    inheritedPostScripts: string[],
    parentAuth?: Auth
  ): { startId: string; endId: string } {
    if (item.type === 'folder') {
      return this.buildFolder(
        item,
        parentPath,
        parentPreId,
        parentPostId,
        inheritedPreScripts,
        inheritedPostScripts,
        parentAuth
      );
    } else {
      return this.buildRequest(
        item,
        parentPath,
        parentPreId,
        parentPostId,
        inheritedPreScripts,
        inheritedPostScripts,
        parentAuth
      );
    }
  }

  private buildFolder(
    folder: Folder,
    parentPath: PathType,
    parentPreId: string,
    parentPostId: string,
    inheritedPreScripts: string[],
    inheritedPostScripts: string[],
    parentAuth?: Auth
  ): { startId: string; endId: string } {
    const folderPath = this.buildPath(parentPath, folder.name, 'folder');
    const folderEnterId = `folder-enter:${folderPath}`;
    const folderPreId = `script:folder-pre:${folderPath}`;
    const folderPostId = `script:folder-post:${folderPath}`;
    const folderExitId = `folder-exit:${folderPath}`;
    
    this.logger.trace(`buildFolder: ${folder.name} (enter=${folderEnterId}, exit=${folderExitId})`);

    // Add folder-enter node (lifecycle: PUSH scope + beforeFolder event)
    // ALWAYS executes regardless of script existence
    this.addNode({
      id: folderEnterId,
      name: `${folder.name}-enter`,
      type: 'folder-enter',
      parentFolderId: parentPath.startsWith('folder:/') ? parentPath : undefined,
      condition: folder.condition,
      path: folderPath,
      item: folder
    });

    // Add folder-exit node (lifecycle: POP scope + afterFolder event)
    // ALWAYS executes regardless of script existence
    this.addNode({
      id: folderExitId,
      name: `${folder.name}-exit`,
      type: 'folder-exit',
      parentFolderId: parentPath.startsWith('folder:/') ? parentPath : undefined,
      path: folderPath,
      item: folder
    });

    // Add folder-pre script node ONLY if script exists
    if (!isNullOrWhitespace(folder.folderPreScript)) {
      this.addNode({
        id: folderPreId,
        name: `${folder.name}-pre`,
        type: 'script',
        scriptType: 'folder-pre' as ScriptType,
        script: folder.folderPreScript,
        parentFolderId: folderPath,
        path: folderPath,
        item: folder
      });
    }

    // Add folder-post script node ONLY if script exists
    if (!isNullOrWhitespace(folder.folderPostScript)) {
      this.addNode({
        id: folderPostId,
        name: `${folder.name}-post`,
        type: 'script',
        scriptType: 'folder-post' as ScriptType,
        script: folder.folderPostScript,
        parentFolderId: folderPath,
        path: folderPath,
        item: folder
      });
    }

    // Structural edges: parent → folder-enter
    this.addEdge(parentPreId, folderEnterId, 'structural');

    // folder-enter → folder-pre (if pre-script exists)
    if (!isNullOrWhitespace(folder.folderPreScript)) {
      this.addEdge(folderEnterId, folderPreId, 'structural');
    }

    // folder-post → folder-exit (if post-script exists)
    if (!isNullOrWhitespace(folder.folderPostScript)) {
      this.addEdge(folderPostId, folderExitId, 'structural');
    }

    // folder-exit → parent
    this.addEdge(folderExitId, parentPostId, 'structural');

    // Register for dependsOn resolution
    // Start node is folder-enter (lifecycle), completion is folder-exit (lifecycle)
    this.startNodeByItemId.set(folder.id, folderEnterId);
    this.completionNodeByItemId.set(folder.id, folderExitId);

    const folderDeps = folder.dependsOn;
    if (folderDeps !== undefined && folderDeps.length > 0) {
      for (const depId of folderDeps) {
        this.pendingDependsOn.push({ depId, targetItemId: folder.id });
      }
    }

    // Build inherited scripts for children
    const folderPreScripts = [...inheritedPreScripts];
    if (!isNullOrWhitespace(folder.preRequestScript)) {
      folderPreScripts.push(folder.preRequestScript!);
    }

    const folderPostScripts = [...inheritedPostScripts];
    if (!isNullOrWhitespace(folder.postRequestScript)) {
      // Use unshift for LIFO (inner runs before outer)
      folderPostScripts.unshift(folder.postRequestScript!);
    }

    // Determine which node children connect to (enter or pre-script)
    const childrenParentPreId = !isNullOrWhitespace(folder.folderPreScript) ? folderPreId : folderEnterId;
    // Determine which node receives children completion (post-script or exit)
    const childrenParentPostId = !isNullOrWhitespace(folder.folderPostScript) ? folderPostId : folderExitId;

    // If condition is statically false, skip children
    if (this.isConditionFalse(folder.condition)) {
      // Direct edge: folder-enter → folder-exit (bypassing children and scripts)
      this.addEdge(folderEnterId, folderExitId, 'structural');
      return { startId: folderEnterId, endId: folderExitId };
    }

    // Compute effective auth (folder auth overrides parent)
    const folderAuth = folder.auth ?? parentAuth;

    // Build children (preserve declaration order)
    for (const child of folder.items) {
      this.buildItem(
        child,
        folderPath,
        childrenParentPreId,
        childrenParentPostId,
        folderPreScripts,
        folderPostScripts,
        folderAuth  // Pass folder's effective auth to children
      );
    }

    // Barrier edge (ensures children completion point waits for all children)
    this.addEdge(childrenParentPreId, childrenParentPostId, 'structural');
    
    return { startId: folderEnterId, endId: folderExitId };
  }

  private buildRequest(
    request: Request,
    parentPath: PathType,
    parentPreId: string,
    parentPostId: string,
    inheritedPreScripts: string[],
    inheritedPostScripts: string[],
    parentAuth?: Auth
  ): { startId: string; endId: string } {
    const requestPath = this.buildPath(parentPath, request.name, 'request');
    const requestId = `request:${requestPath}`;
    
    this.logger.trace(`buildRequest: ${request.name} (id=${requestId})`);

    // Build final script arrays for this request
    const requestPreScripts = [...inheritedPreScripts];
    if (!isNullOrWhitespace(request.preRequestScript)) {
      requestPreScripts.push(request.preRequestScript!);
    }

    const requestPostScripts = [...inheritedPostScripts];
    if (!isNullOrWhitespace(request.postRequestScript)) {
      // Use unshift for LIFO (request runs before inherited)
      requestPostScripts.unshift(request.postRequestScript!);
    }

    // Compute effective auth (request auth overrides folder/collection auth)
    const effectiveAuth = request.auth ?? parentAuth;

    // Add request node
    this.addNode({
      id: requestId,
      name: request.name,
      type: 'request',
      condition: request.condition,
      inheritedPreScripts: requestPreScripts,
      inheritedPostScripts: requestPostScripts,
      effectiveAuth,  // Store computed effectiveAuth for request execution
      parentFolderId: parentPath.startsWith('folder:/') ? parentPath : undefined,
      path: requestPath,
      item: request
    });

    // Structural edges
    this.addEdge(parentPreId, requestId, 'structural');
    this.addEdge(requestId, parentPostId, 'structural');

    // Plugin event scripts are NOT DAG nodes - they execute via emitEvent() callback
    // during plugin I/O phase. This ensures proper serialization and lifecycle.
    // Plugin events fire DURING request execution (e.g., WebSocket onMessage), not as separate tasks.
    // Removed: this.addEventScriptNodes(request, requestId, parentPostId, parentPath);

    // Register for dependsOn resolution
    this.startNodeByItemId.set(request.id, requestId);
    this.completionNodeByItemId.set(request.id, requestId);

    if (request.dependsOn !== undefined && request.dependsOn.length > 0) {
      for (const depId of request.dependsOn) {
        this.pendingDependsOn.push({ depId, targetItemId: request.id });
      }
    }
    
    return { startId: requestId, endId: requestId };
  }

  private addEventScriptNodes(
    request: Request,
    requestId: string,
    parentPostId: string,
    parentPath: PathType
  ): void {
    const eventScripts = request.data?.scripts;
    if (eventScripts === undefined || eventScripts.length === 0) {
      return;
    }

    for (let i = 0; i < eventScripts.length; i++) {
      const eventScript = eventScripts[i];
      const eventNodeId = `script:plugin-event:${requestId}:${i}:${eventScript.event}`;

      this.addNode({
        id: eventNodeId,
        name: `${request.name}-${eventScript.event}`,
        type: 'script',
        scriptType: 'plugin-event' as ScriptType,
        script: eventScript.script,
        parentFolderId: parentPath.startsWith('folder:/') ? parentPath : undefined,
        path: `${requestId}:${eventScript.event}` as PathType,
        eventName: eventScript.event,
        parentRequestId: requestId
      });

      // Event edges: request → event → parent-post
      this.addEdge(requestId, eventNodeId, 'event');
      this.addEdge(eventNodeId, parentPostId, 'structural');
    }
  }

  private resolveDependsOnEdges(): void {
    for (const { depId, targetItemId } of this.pendingDependsOn) {
      const completionNodeId = this.completionNodeByItemId.get(depId);
      if (completionNodeId === undefined) {
        // Dependency not found - this can happen when filtering with excludeDeps=true
        // Skip this dependency edge instead of throwing
        this.logger.warn(`Skipping dependency: Item '${targetItemId}' depends on '${depId}' which is not in the filtered collection`);
        continue;
      }

      const targetStartNodeId = this.startNodeByItemId.get(targetItemId);
      if (targetStartNodeId === undefined) {
        throw new Error(`Internal error: No start node for item '${targetItemId}'`);
      }

      // Add edge: completionNode(dep) → startNode(target)
      this.addEdge(completionNodeId, targetStartNodeId, 'dependsOn');
    }
  }


  /**
   * Build path with proper type prefix (folder: or request:)
   * Similar to ExecutionNode path building
   */
  private buildPath(parent: string, name: string, type: 'folder' | 'request'): PathType {
    // If parent is collection:/
    if (parent === 'collection:/') {
      return `${type}:/${name}` as PathType;
    }
    
    // Remove type prefix from parent path
    const basePath = parent.replace(/^(folder|request):\//, '');
    return `${type}:/${basePath}/${name}` as PathType;
  }

  private toArray(script: string | undefined): string[] {
    return !isNullOrWhitespace(script) ? [script!] : [];
  }

  private isConditionFalse(condition: string | undefined): boolean {
    return condition?.toLowerCase() === 'false';
  }
}
