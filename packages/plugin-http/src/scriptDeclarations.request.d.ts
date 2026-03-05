/**
 * HTTP protocol — request IntelliSense declarations
 *
 * Ambient declarations describing what quest.request exposes when the active
 * protocol is HTTP. Registered with Monaco via addExtraLib() for pre-request
 * and post-request script editors.
 *
 * Source of truth: protocolAPIProvider() in fracture/packages/plugin-http/src/index.ts
 * Enforcement: scriptDeclarations.assert.ts verifies these match the runtime shape.
 */

declare interface HttpRequestHeaders {
  add(header: { key: string; value: string }): void;
  remove(key: string): void;
  get(key: string): string | null;
  upsert(header: { key: string; value: string }): void;
  toObject(): Record<string, string>;
}

declare interface HttpRequestBody {
  get(): string | null;
  set(content: string): void;
  readonly mode: string | null;
}

declare const quest: {
  request: {
    url: string;
    method: string;
    body: HttpRequestBody;
    headers: HttpRequestHeaders;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};
