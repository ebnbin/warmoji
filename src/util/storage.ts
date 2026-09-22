// 不直接碰 localStorage：消费方注入，单测注入内存实现
export interface StringStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** 隐私模式下访问 localStorage 会抛错 */
export function browserStorage(): StringStorage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}
