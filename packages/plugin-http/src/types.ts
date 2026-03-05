// ============================================================================
// HTTP Plugin Types
// ============================================================================

/**
 * Typed shape of the HTTP protocolAPIProvider return value.
 * Used by plugin-http/index.ts for the return type of protocolAPIProvider,
 * and by scriptDeclarations.assert.ts for compile-time enforcement.
 */
export interface HttpRequestBodyAPI {
  get(): string | null;
  set(content: string): void;
  readonly mode: string | null;
}

export interface HttpRequestHeadersAPI {
  add(header: { key: string; value: string }): void;
  remove(key: string): void;
  get(key: string): string | null;
  upsert(header: { key: string; value: string }): void;
  toObject(): Record<string, string>;
}

export interface HttpScriptRequestAPI {
  url: string;
  method: string;
  body: HttpRequestBodyAPI;
  headers: HttpRequestHeadersAPI;
}

export interface HttpResponseHeadersAPI {
  get(name: string): string | string[] | null;
  has(name: string): boolean;
  toObject(): Record<string, string | string[]>;
}

export interface HttpResponseToAPI {
  be: {
    ok: boolean;
    success: boolean;
    clientError: boolean;
    serverError: boolean;
  };
  have: {
    status(code: number): boolean;
    header(name: string): boolean;
    jsonBody(field: string): boolean;
  };
}

export interface HttpScriptResponseAPI {
  status: number;
  statusText: string;
  headers: HttpResponseHeadersAPI;
  body: string;
  text(): string;
  json(): unknown;
  duration: number;
  size: number;
  to: HttpResponseToAPI;
}

export interface HttpProtocolAPI {
  request: HttpScriptRequestAPI;
  response: HttpScriptResponseAPI;
  [key: string]: unknown;
}


/**
 * HTTP Response Data Structure
 * This is what gets stored in ProtocolResponse.data
 */
export interface HttpResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string | string[]>;
  body: string;
}

/**
 * HTTP Body Mode Types
 */
export type HttpBodyMode = 'none' | 'raw' | 'binary' | 'urlencoded' | 'formdata';

/**
 * Key-Value pair for urlencoded and formdata bodies
 */
export interface HttpBodyKV {
  key: string;
  value: string;
  type?: 'text' | 'binary';  // Only used for formdata
  description?: string;
}

/**
 * HTTP Body Data Structure
 * Uses unified kv array for both urlencoded and formdata modes
 */
export interface HttpBodyData {
  mode: HttpBodyMode;
  raw?: string;        // Used when mode is 'raw' or 'binary' (binary expects base64)
  /** MIME type for raw mode body. Automatically set as Content-Type header if not overridden by user. */
  language?: string;
  kv?: HttpBodyKV[];   // Used when mode is 'urlencoded' or 'formdata'
}

/**
 * HTTP Request Data Structure
 */
export interface HttpRequestData {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  url: string;
  headers?: Record<string, string>;
  params?: Array<{ key: string; value: string; description?: string }>;
  body?: string | HttpBodyData;
}
