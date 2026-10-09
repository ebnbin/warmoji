import Phaser from 'phaser'
import type { OutlineKind } from './outline'
import { emojiKey, emojiRaster } from './textures'
import { HoldTable } from './holdTable'
import type { HoldStats, TextureSpec } from './holdTable'

export interface EmojiRef {
  readonly id: string
  readonly outline?: OutlineKind
}

class Hold {
  readonly scene: Phaser.Scene
  readonly keys: ReadonlySet<string>
  readonly ready: Promise<void>
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

function shownKeys(game: Phaser.Game): Set<string> {
  const keys = new Set<string>()
  const walk = (list: readonly Phaser.GameObjects.GameObject[]): void => {
    for (const obj of list) {
      if ('texture' in obj && obj.texture instanceof Phaser.Textures.Texture && obj.texture.key) keys.add(obj.texture.key)
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

/** 每个场景持有的纹理 key，场景关掉时随持有一起清掉 */
const heldKeys = new Map<Phaser.Scene, Set<string>>()

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
    heldKeys.set(scene, new Set())
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      holdsOf.delete(scene)
      heldKeys.delete(scene)
      for (const x of set) x.release()
    })
  }
  mine.add(h)
  const keys = heldKeys.get(scene)!
  for (const k of h.keys) keys.add(k)
  return h
}

/** 场景要显示一个 emoji：由这个场景持有到它关掉；纹理已经在了 ready 是 undefined，否则等它载好 */
export function holdEmoji(scene: Phaser.Scene, ref: EmojiRef): { readonly key: string; readonly ready?: Promise<void> } {
  const key = emojiKey(ref.id, ref.outline)
  if (heldKeys.get(scene)?.has(key) && scene.textures.exists(key)) return { key }
  const h = heldKeys.get(scene)?.has(key) ? undefined : hold(scene, [ref])
  if (scene.textures.exists(key)) return { key }
  return { key, ready: h?.ready ?? tableOf(scene.game).waitFor(key) }
}

export function emojiHoldStats(game: Phaser.Game): { table: HoldStats; scenes: { key: string; holds: number }[] } {
  return {
    table: tableOf(game).stats(),
    scenes: [...holdsOf].map(([scene, holds]) => ({ key: scene.scene.key, holds: holds.size })),
  }
}

export function preloadEmojis(scene: Phaser.Scene, refs: readonly EmojiRef[]): void {
  const h = hold(scene, refs)
  if (!h.done) scene.load.addFile(new HoldFile(scene.load, h))
}
