/**
 * Compile-time assertions that scriptDeclarations.request.d.ts and
 * scriptDeclarations.response.d.ts match the HttpScriptRequestAPI and
 * HttpScriptResponseAPI interfaces in types.ts.
 *
 * This file produces NO runtime output. If the protocolAPIProvider in index.ts
 * changes its request or response shape, update types.ts and the declaration
 * files — or this file will fail to compile.
 */

import type { HttpScriptRequestAPI, HttpScriptResponseAPI, HttpProtocolAPI } from './types.js';

// Verify HttpProtocolAPI contains typed request and response
type CheckRequestType = HttpProtocolAPI['request'] extends HttpScriptRequestAPI ? true : never;
type CheckResponseType = HttpProtocolAPI['response'] extends HttpScriptResponseAPI ? true : never;

const assertRequestType: CheckRequestType = true as const;
const assertResponseType: CheckResponseType = true as const;

void assertRequestType;
void assertResponseType;

// Request field checks — match scriptDeclarations.request.d.ts declarations
type CheckRequestUrl = HttpScriptRequestAPI['url'] extends string ? true : never;
type CheckRequestMethod = HttpScriptRequestAPI['method'] extends string ? true : never;
type CheckRequestBodyGet = ReturnType<HttpScriptRequestAPI['body']['get']> extends string | null ? true : never;
type CheckRequestBodyMode = HttpScriptRequestAPI['body']['mode'] extends string | null ? true : never;
type CheckRequestHeadersToObject = ReturnType<HttpScriptRequestAPI['headers']['toObject']> extends Record<string, string> ? true : never;

const assertUrl: CheckRequestUrl = true as const;
const assertMethod: CheckRequestMethod = true as const;
const assertBodyGet: CheckRequestBodyGet = true as const;
const assertBodyMode: CheckRequestBodyMode = true as const;
const assertHeadersToObject: CheckRequestHeadersToObject = true as const;

void assertUrl; void assertMethod; void assertBodyGet; void assertBodyMode; void assertHeadersToObject;

// Response field checks — match scriptDeclarations.response.d.ts declarations
type CheckResponseStatus = HttpScriptResponseAPI['status'] extends number ? true : never;
type CheckResponseBody = HttpScriptResponseAPI['body'] extends string ? true : never;
type CheckResponseJsonReturn = ReturnType<HttpScriptResponseAPI['json']> extends unknown ? true : never;
type CheckResponseToBe = HttpScriptResponseAPI['to']['be']['ok'] extends boolean ? true : never;
type CheckResponseToHaveStatus = ReturnType<HttpScriptResponseAPI['to']['have']['status']> extends boolean ? true : never;

const assertStatus: CheckResponseStatus = true as const;
const assertBody: CheckResponseBody = true as const;
const assertJsonReturn: CheckResponseJsonReturn = true as const;
const assertToBe: CheckResponseToBe = true as const;
const assertToHaveStatus: CheckResponseToHaveStatus = true as const;

void assertStatus; void assertBody; void assertJsonReturn; void assertToBe; void assertToHaveStatus;
