export enum StorageKey {
  Settings = 'warmoji.settings.v1',
  Captain = 'warmoji.captain.v1',
  Map = 'warmoji.map.v1',
  Recruit = 'warmoji.recruit.v1',
  Highscore = 'warmoji.highscore.v2',
  DevTools = 'warmoji.devtools.v1',
}

export interface StringStorage {
  getItem(key: StorageKey): string | null
  setItem(key: StorageKey, value: string): void
}

export function browserStorage(): StringStorage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}
