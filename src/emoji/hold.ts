import Phaser from 'phaser'
import type { OutlineKind } from './svg'
import { emojiKey, emojiRaster } from './textures'
import { HoldTable } from './holdTable'
import type { TextureSpec } from './holdTable'

// scene 持有的 emoji 纹理随其 SHUTDOWN 归还

export interface EmojiRef {
  readonly id: string
  readonly outline?: OutlineKind
}

class Hold {
  readonly scene: Phaser.Scene
  readonly keys: ReadonlySet<string>
  /** 全部生成结束后兑现；单张失败只报错 */
  readonly ready: Promise<void>
  /** 创建时已全部就绪 */
  readonly done: boolean
  released = false

  constructor(scene: Phaser.Scene, keys: ReadonlySet<string>, ready: Promise<void>, done: boolean) {
    this.scene = scene
    this.keys = keys
    this.ready = ready
    this.done = done
  }

  release(): void {
    if (this.released) return
    this.released = true
    holdsOf.get(this.scene)?.delete(this)
    tableOf(this.scene.game).release([...this.keys])
    scheduleSettle(this.scene.game)
  }
}

/** 让 create 等持有就绪；持有已归还则不再回调 loader */
class HoldFile extends Phaser.Loader.File {
  private readonly hold: Hold

  constructor(loader: Phaser.Loader.LoaderPlugin, hold: Hold) {
    super(loader, { type: 'emojiHold', key: `emoji-hold-${++fileSerial}`, cache: false })
    this.hold = hold
    this.state = Phaser.Loader.FILE_POPULATED
  }

  onProcess(): void {
    this.state = Phaser.Loader.FILE_PROCESSING
    void this.hold.ready.then(() => {
      if (!this.hold.released) this.onProcessComplete()
    })
  }
}

let table: HoldTable<HTMLImageElement> | undefined
const holdsOf = new Map<Phaser.Scene, Set<Hold>>()
const reported = new Set<string>()
let settleQueued = false
let fileSerial = 0

function tableOf(game: Phaser.Game): HoldTable<HTMLImageElement> {
  table ??= new HoldTable<HTMLImageElement>(
    {
      exists: (key) => game.textures.exists(key),
      add: (key, img) => {
        game.textures.addImage(key, img)
      },
      remove: (key) => {
        game.textures.remove(key)
      },
    },
    () => shownKeys(game),
  )
  return table
}

/** 各 scene 显示列表里（含容器内部）正在用的纹理 */
function shownKeys(game: Phaser.Game): Set<string> {
  const keys = new Set<string>()
  const walk = (list: readonly Phaser.GameObjects.GameObject[]): void => {
    for (const obj of list) {
      if ('texture' in obj) {
        const key = (obj.texture as Phaser.Textures.Texture | undefined)?.key
        if (key) keys.add(key)
      }
      if (obj instanceof Phaser.GameObjects.Container || obj instanceof Phaser.GameObjects.Layer) walk(obj.list)
    }
  }
  for (const scene of game.scene.getScenes(false)) walk(scene.children.list)
  return keys
}

function scheduleSettle(game: Phaser.Game): void {
  if (settleQueued) return
  settleQueued = true
  // 须在本帧 scene 切换之后、渲染之前结算
  game.events.once(Phaser.Core.Events.POST_STEP, () => {
    settleQueued = false
    tableOf(game).settle()
  })
}

function hold(scene: Phaser.Scene, refs: readonly EmojiRef[]): Hold {
  const specs = new Map<string, TextureSpec<HTMLImageElement>>()
  for (const r of refs) {
    const key = emojiKey(r.id, r.outline)
    if (!specs.has(key)) specs.set(key, { key, make: () => emojiRaster(r.id, r.outline) })
  }
  const { ready, done } = tableOf(scene.game).retain([...specs.values()])
  const h = new Hold(scene, new Set(specs.keys()), ready, done)
  let mine = holdsOf.get(scene)
  if (!mine) {
    const set = (mine = new Set<Hold>())
    holdsOf.set(scene, set)
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      holdsOf.delete(scene)
      for (const x of set) x.release()
    })
  }
  mine.add(h)
  return h
}

/** 只在 preload 里调用：create 等清单全部就绪 */
export function preloadEmojis(scene: Phaser.Scene, refs: readonly EmojiRef[]): void {
  const h = hold(scene, refs)
  if (!h.done) scene.load.addFile(new HoldFile(scene.load, h))
}

/** 当前没有持有的 scene 不查；同一 (scene, key) 只报一次 */
function assertHeld(scene: Phaser.Scene, key: string): void {
  const mine = holdsOf.get(scene)
  if (!mine) return
  for (const h of mine) if (h.keys.has(key)) return
  const tag = `${scene.scene.key}|${key}`
  if (reported.has(tag)) return
  reported.add(tag)
  console.error(`${scene.scene.key} 未持有 emoji 纹理：${key}`)
}

export function emojiImage(
  scene: Phaser.Scene,
  x: number,
  y: number,
  id: string,
  size: number,
  outline?: OutlineKind,
): Phaser.GameObjects.Image {
  const key = emojiKey(id, outline)
  assertHeld(scene, key)
  return scene.add.image(x, y, key).setDisplaySize(size, size)
}
