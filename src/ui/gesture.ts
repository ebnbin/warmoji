import Phaser from 'phaser'
import { playSfx } from '../audio/sfx'
import type { SfxId } from '../types/sfx'

export interface Rect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

type GameObject = Phaser.GameObjects.GameObject

interface SceneGestures {
  /** 本次按下后已拖动过的指针：松手时不再算作点按 */
  readonly dragged: Set<number>
  readonly events: Phaser.Events.EventEmitter
  readonly modals: GameObject[]
  /** 最近一次关掉模态层的帧：同一按键在这一帧里不再触发别的处理 */
  closedAt: number
}

const DRAG = 'drag'

const states = new WeakMap<Phaser.Scene, SceneGestures>()
const clips = new WeakMap<GameObject, Rect>()

function gesturesOf(scene: Phaser.Scene): SceneGestures {
  const known = states.get(scene)
  if (known) return known
  const state: SceneGestures = { dragged: new Set(), events: new Phaser.Events.EventEmitter(), modals: [], closedAt: -1 }
  states.set(scene, state)
  scene.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => state.dragged.delete(p.id))
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    states.delete(scene)
    state.events.destroy()
  })
  return state
}

export function markDragged(scene: Phaser.Scene, pointer: Phaser.Input.Pointer): void {
  const state = gesturesOf(scene)
  if (state.dragged.has(pointer.id)) return
  state.dragged.add(pointer.id)
  state.events.emit(DRAG, pointer.id)
}

export function wasDragged(scene: Phaser.Scene, pointer: Phaser.Input.Pointer): boolean {
  return gesturesOf(scene).dragged.has(pointer.id)
}

/** 容器只显示 rect 内的部分：其中的控件在 rect 外既不可见也点不中 */
export function setClip(container: Phaser.GameObjects.Container, rect: Rect): void {
  clips.set(container, rect)
}

function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

export function clipsAllow(obj: GameObject, worldX: number, worldY: number): boolean {
  for (let o: GameObject | null = obj; o; o = o.parentContainer) {
    const r = clips.get(o)
    if (r && !inRect(r, worldX, worldY)) return false
  }
  return true
}

function within(obj: GameObject, root: GameObject): boolean {
  for (let o: GameObject | null = obj; o; o = o.parentContainer) if (o === root) return true
  return false
}

function shown(obj: GameObject): boolean {
  for (let o: GameObject | null = obj; o; o = o.parentContainer) {
    if (!o.active || !(o as unknown as Phaser.GameObjects.Components.Visible).visible) return false
  }
  return true
}

export function pushModal(root: GameObject): void {
  gesturesOf(root.scene).modals.push(root)
}

export function popModal(root: GameObject): void {
  const state = gesturesOf(root.scene)
  const i = state.modals.indexOf(root)
  if (i < 0) return
  state.modals.splice(i, 1)
  state.closedAt = root.scene.game.loop.frame
}

/** 有模态层打开时，模态层之外的控件不响应键盘 */
export function blockedByModal(obj: GameObject): boolean {
  const state = gesturesOf(obj.scene)
  const top = state.modals[state.modals.length - 1]
  return (top !== undefined && !within(obj, top)) || state.closedAt === obj.scene.game.loop.frame
}

export function hasModal(scene: Phaser.Scene): boolean {
  const state = gesturesOf(scene)
  return state.modals.length > 0 || state.closedAt === scene.game.loop.frame
}

/** 指针按下处最上层的可交互对象是否属于 root（或者什么都没按到） */
export function pressedOn(scene: Phaser.Scene, pointer: Phaser.Input.Pointer, root: GameObject): boolean {
  const input = scene.input
  const top = input.sortGameObjects(input.hitTestPointer(pointer), pointer)[0]
  return top === undefined || within(top, root)
}

export type HitShape = Phaser.Geom.Rectangle | Phaser.Geom.Circle

export type PressTarget = GameObject &
  Phaser.GameObjects.Components.Transform & { readonly displayOriginX: number; readonly displayOriginY: number }

export interface PressConfig {
  /** 局部坐标下的命中区 */
  readonly shape: HitShape
  readonly onTap: (pointer?: Phaser.Input.Pointer) => void
  /** 按下与抬起时的视觉反馈 */
  readonly onPress?: (down: boolean) => void
  readonly enabled?: () => boolean
  /** null 表示不出声 */
  readonly sfx?: SfxId | null
  readonly keys?: readonly string[]
  /** 按下即回调，拖动也不取消；用于需要自行跟踪指针的控件 */
  readonly onDown?: (pointer: Phaser.Input.Pointer) => void
}

/** 统一的点按：命中区受滚动裁剪约束，拖动过的指针不算点按，模态层外的快捷键失效 */
export function pressable(target: PressTarget, cfg: PressConfig): void {
  const scene = target.scene
  const contains = cfg.shape instanceof Phaser.Geom.Circle ? Phaser.Geom.Circle.Contains : Phaser.Geom.Rectangle.Contains
  const enabled = cfg.enabled ?? ((): boolean => true)
  const world = new Phaser.Math.Vector2()
  target.setInteractive({
    hitArea: cfg.shape,
    hitAreaCallback: (area: HitShape, x: number, y: number, go: GameObject): boolean => {
      if (!(contains as (a: HitShape, x: number, y: number) => boolean)(area, x, y)) return false
      const t = go as PressTarget
      t.getWorldTransformMatrix().transformPoint(x - t.displayOriginX, y - t.displayOriginY, world)
      return clipsAllow(go, world.x, world.y)
    },
    useHandCursor: true,
  })

  let downId: number | null = null
  const gestures = gesturesOf(scene)
  const release = (): void => {
    if (downId === null) return
    downId = null
    gestures.events.off(DRAG, onDrag)
    cfg.onPress?.(false)
  }
  const onDrag = (id: number): void => {
    if (id === downId) release()
  }
  const fire = (pointer?: Phaser.Input.Pointer): void => {
    if (cfg.sfx !== null) playSfx(cfg.sfx ?? 'click')
    cfg.onTap(pointer)
  }

  target.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (p: Phaser.Input.Pointer) => {
    if (!enabled()) return
    cfg.onDown?.(p)
    downId = p.id
    gestures.events.on(DRAG, onDrag)
    cfg.onPress?.(true)
  })
  target.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, (p: Phaser.Input.Pointer) => {
    if (downId !== p.id) return
    release()
    if (!enabled() || wasDragged(scene, p)) return
    fire(p)
  })
  target.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, (p: Phaser.Input.Pointer) => {
    if (downId === p.id) release()
  })
  target.once(Phaser.GameObjects.Events.DESTROY, () => gestures.events.off(DRAG, onDrag))

  const keyboard = scene.input.keyboard
  if (!keyboard || !cfg.keys) return
  const onKey = (): void => {
    if (!shown(target) || !enabled() || blockedByModal(target)) return
    fire()
  }
  for (const k of cfg.keys) keyboard.on(`keydown-${k}`, onKey)
  target.once(Phaser.GameObjects.Events.DESTROY, () => {
    for (const k of cfg.keys ?? []) keyboard.off(`keydown-${k}`, onKey)
  })
}
