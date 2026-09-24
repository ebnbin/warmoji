// 纹理按 key 计数持有：归还的扣减推迟到 settle，归零且不在显示才删除；只删本表生成的纹理

export interface TextureStore<S> {
  exists(key: string): boolean
  add(key: string, source: S): void
  remove(key: string): void
}

export interface TextureSpec<S> {
  readonly key: string
  /** 失败须 reject */
  readonly make: () => Promise<S>
}

interface Entry {
  refs: number
  owned: boolean
  done: boolean
  ready: Promise<void>
}

export class HoldTable<S> {
  private readonly store: TextureStore<S>
  /** settle 时至多取一次 */
  private readonly shownKeys: () => ReadonlySet<string>
  private readonly entries = new Map<string, Entry>()
  private pending: string[] = []

  constructor(store: TextureStore<S>, shownKeys: () => ReadonlySet<string>) {
    this.store = store
    this.shownKeys = shownKeys
  }

  /** ready 在全部生成结束后兑现，单张失败只报错；done 表示此刻已全部就绪 */
  retain(specs: readonly TextureSpec<S>[]): { ready: Promise<void>; done: boolean } {
    const waits: Promise<void>[] = []
    for (const spec of specs) {
      const entry = this.entries.get(spec.key) ?? this.create(spec)
      entry.refs++
      if (!entry.done) waits.push(entry.ready)
    }
    return { ready: Promise.all(waits).then(() => undefined), done: waits.length === 0 }
  }

  /** 同一帧内再被持有的 key 不会删了再建 */
  release(keys: readonly string[]): void {
    this.pending.push(...keys)
  }

  settle(): void {
    const keys = this.pending
    this.pending = []
    let shown: ReadonlySet<string> | undefined
    for (const key of keys) {
      const entry = this.entries.get(key)
      if (!entry || --entry.refs > 0) continue
      this.entries.delete(key)
      if (!entry.owned || !this.store.exists(key)) continue
      shown ??= this.shownKeys()
      if (shown.has(key)) {
        console.error(`纹理已无人持有却仍在显示，保留不删：${key}`)
        continue
      }
      this.store.remove(key)
    }
  }

  private create(spec: TextureSpec<S>): Entry {
    const exists = this.store.exists(spec.key)
    const entry: Entry = { refs: 0, owned: !exists, done: exists, ready: Promise.resolve() }
    this.entries.set(spec.key, entry)
    if (exists) return entry
    entry.ready = spec
      .make()
      .then(
        (source) => {
          // 生成途中已被全部归还
          if (this.entries.get(spec.key) !== entry) return
          if (this.store.exists(spec.key)) entry.owned = false
          else this.store.add(spec.key, source)
        },
        (err: unknown) => console.error(`纹理生成失败 ${spec.key}: ${String(err)}`),
      )
      .finally(() => {
        entry.done = true
      })
    return entry
  }
}
