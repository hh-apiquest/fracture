/**
 * HTTP protocol — response IntelliSense declarations
 *
 * Ambient declarations describing what quest.response exposes when the active
 * protocol is HTTP. Registered with Monaco via addExtraLib() for post-request
 * script editors.
 *
 * Source of truth: protocolAPIProvider() in fracture/packages/plugin-http/src/index.ts
 * Enforcement: scriptDeclarations.assert.ts verifies these match the runtime shape.
 */

declare interface HttpResponseHeaders {
  get(name: string): string | string[] | null;
  has(name: string): boolean;
  toObject(): Record<string, string | string[]>;
}

declare interface HttpResponseTo {
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

declare interface HttpResponse {
  status: number;
  statusText: string;
  headers: HttpResponseHeaders;
  body: string;
  text(): string;
  json(): unknown;
  duration: number;
  size: number;
  to: HttpResponseTo;
}

declare const quest: {
  response: HttpResponse;
  [key: string]: unknown;
};
