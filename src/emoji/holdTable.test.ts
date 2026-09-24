import { describe, expect, it, vi } from 'vitest'
import { HoldTable } from './holdTable'
import type { TextureSpec } from './holdTable'

// 守卫：纹理在还有 scene 持有或仍在显示时被删，用它的对象下一帧渲染就抛错、主循环停止；
// 生成途中已被全部归还的纹理若照样入库，此后再无人归还，永久泄漏

function setup(shown: ReadonlySet<string> = new Set()): { store: Map<string, string>; table: HoldTable<string> } {
  const store = new Map<string, string>()
  const table = new HoldTable<string>(
    {
      exists: (key) => store.has(key),
      add: (key, source) => {
        store.set(key, source)
      },
      remove: (key) => {
        store.delete(key)
      },
    },
    () => shown,
  )
  return { store, table }
}

const spec = (key: string): TextureSpec<string> => ({ key, make: () => Promise.resolve(key) })

describe('纹理持有表', () => {
  it('还有持有者或仍在显示的纹理不删', async () => {
    const shown = new Set<string>()
    const { store, table } = setup(shown)
    await table.retain([spec('a'), spec('b')]).ready
    await table.retain([spec('b')]).ready
    table.release(['a', 'b'])
    table.settle()
    expect([...store.keys()]).toEqual(['b'])

    shown.add('b')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    table.release(['b'])
    table.settle()
    expect(store.has('b')).toBe(true)
    expect(error).toHaveBeenCalledOnce()
    error.mockRestore()
  })

  it('生成途中被全部归还的纹理，生成完不入库', async () => {
    let finish!: (source: string) => void
    const { store, table } = setup()
    const { ready } = table.retain([
      {
        key: 'a',
        make: () =>
          new Promise<string>((resolve) => {
            finish = resolve
          }),
      },
    ])
    table.release(['a'])
    table.settle()
    finish('a')
    await ready
    expect(store.has('a')).toBe(false)
  })
})
