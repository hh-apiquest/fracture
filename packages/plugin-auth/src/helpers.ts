// Helper functions for string validation
export function isNullOrEmpty(value: string | null | undefined): boolean {
  return value === null || value === undefined || value === '';
}

export function isNullOrWhitespace(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === '';
}
