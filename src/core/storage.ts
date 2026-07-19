// 全项目的字符串存储抽象：core 层不直接碰 localStorage，
// 消费方（highscore/settings/selection/recruit）经此注入，单测注入内存实现。
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
