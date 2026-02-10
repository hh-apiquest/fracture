// Type definitions for Quest API

export interface RequestConfig {
  url: string;
  method?: string;
  header?: Record<string, string>;
  headers?: Record<string, string>;
  body?: string | RequestBody;
}

export interface RequestBody {
  mode?: 'raw' | 'urlencoded' | 'formdata';
  raw?: string;
  urlencoded?: Array<{ key: string; value: string }>;
  formdata?: Array<{ key: string; value: string }>;
}

export interface ResponseObject {
  status: number;
  statusText: string;
  body: string;
  headers: Record<string, string | string[]>;
  time: number;
  json(): unknown | null;
  text(): string;
}

export interface HistoryFilterCriteria {
  path?: string;
  name?: string;
  iteration?: number;
  id?: string;
}
