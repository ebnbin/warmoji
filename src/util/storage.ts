export interface StringStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function browserStorage(): StringStorage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}
