export enum StorageKey {
  Settings = 'warmoji.settings.v1',
  Map = 'warmoji.map.v1',
  BoxMap = 'warmoji.boxMap.v1',
  Highscore = 'warmoji.highscore.v2',
  Labs = 'warmoji.labs.v1',
  Mutators = 'warmoji.mutators.v1',
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
