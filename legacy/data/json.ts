export function fromJson<T>(json: unknown): T {
  return json as T
}
