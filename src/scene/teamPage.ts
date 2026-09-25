import Phaser from 'phaser'
import { CAPTAINS } from '../data/captains'
import { emojiImage } from '../emoji/hold'
import { endRun } from '../run/state'
import type { RunState } from '../run/state'
import type { CharacterId } from '../types/characters'
import type { ItemId } from '../types/items'
import type { ScrollView } from '../ui/scroll'
import { roundRect } from '../ui/shapes'
import { FONT, UI_FONT } from '../util/fonts'
import { characterStatGroups } from './statLines'
import { SceneKey } from './keys'

export interface TeamLayout {
  content: { w: number; h: number }
  headerY: number
  stepY: number
  detail: { x: number; y: number; w: number; h: number }
  preview: { x: number; y: number; w: number; h: number }
  detailText: { x: number; y: number; w: number; h: number }
  list: { x: number; y: number; w: number; h: number }
  btn: { y: number; w: number; h: number }
}

const LANDSCAPE: TeamLayout = {
  content: { w: 1280, h: 720 },
  headerY: 44,
  stepY: 96,
  detail: { x: 40, y: 132, w: 730, h: 484 },
  preview: { x: 40, y: 132, w: 264, h: 484 },
  detailText: { x: 320, y: 132, w: 450, h: 484 },
  list: { x: 810, y: 132, w: 430, h: 484 },
  btn: { y: 660, w: 340, h: 68 },
}

const PORTRAIT: TeamLayout = {
  content: { w: 720, h: 1280 },
  headerY: 52,
  stepY: 106,
  detail: { x: 24, y: 144, w: 672, h: 460 },
  preview: { x: 24, y: 144, w: 672, h: 196 },
  detailText: { x: 24, y: 352, w: 672, h: 252 },
  list: { x: 24, y: 628, w: 672, h: 470 },
  btn: { y: 1184, w: 360, h: 72 },
}

export function teamLayout(w: number, h: number): TeamLayout {
  return h > w ? PORTRAIT : LANDSCAPE
}

export const PREVIEW_SPIN = 0.18

export function fitIconSize(posts: readonly { x: number; y: number }[], scale: number, base: number): number {
  let minD = Infinity
  for (let i = 0; i < posts.length; i++) {
    for (let j = i + 1; j < posts.length; j++) {
      minD = Math.min(minD, Math.hypot(posts[i]!.x - posts[j]!.x, posts[i]!.y - posts[j]!.y))
    }
  }
  if (!Number.isFinite(minD)) return base
  return Math.max(24, Math.min(base, minD * scale * 0.92))
}

export function isInitialWave(run: RunState): boolean {
  return run.wave === CAPTAINS[run.captainId].startWave
}

export function nextAfterTeam(run: RunState): SceneKey.Battle | SceneKey.Shop {
  return isInitialWave(run) && !CAPTAINS[run.captainId].firstWaveShop ? SceneKey.Battle : SceneKey.Shop
}

export function addTeamFrame(
  scene: Phaser.Scene,
  L: TeamLayout,
  origin: { x: number; y: number },
  title: string,
  banner: string,
  res: number,
): void {
  const cx = origin.x + L.content.w / 2
  scene.add
    .text(cx, origin.y + L.headerY, title, {
      fontFamily: UI_FONT,
      fontSize: FONT.title,
      fontStyle: 'bold',
      color: '#f5f5f5',
      resolution: res,
    })
    .setOrigin(0.5)
  scene.add
    .text(cx, origin.y + L.stepY, banner, {
      fontFamily: UI_FONT,
      fontSize: FONT.body,
      fontStyle: 'bold',
      color: '#b3e5fc',
      resolution: res,
    })
    .setOrigin(0.5)
  const D = L.detail
  const panel = scene.add.graphics()
  roundRect(panel, origin.x + D.x, origin.y + D.y, D.w, D.h, 14, {
    fill: 0x000000,
    fillAlpha: 0.22,
    stroke: 0xffffff,
    strokeAlpha: 0.1,
  })
}

export function addRunExit(
  scene: Phaser.Scene,
  run: RunState,
  x: number,
  y: number,
  res: number,
  dragged = (): boolean => false,
): void {
  const style = { fontFamily: UI_FONT, fontSize: FONT.strong, color: '#c8c8d4', resolution: res }
  if (isInitialWave(run)) {
    const leave = (): void => {
      endRun()
      scene.scene.start(SceneKey.Captain)
    }
    const back = scene.add.text(x, y, '← 返回', style).setOrigin(0, 0.5).setInteractive({ useHandCursor: true })
    back.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      if (!dragged()) leave()
    })
    scene.input.keyboard?.on('keydown-ESC', leave)
    return
  }
  let armed = false
  const quit = scene.add.text(x, y, '✕ 结束', style).setOrigin(0, 0.5).setInteractive({ useHandCursor: true })
  quit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
    if (dragged()) return
    if (armed) {
      endRun()
      scene.scene.start(SceneKey.Menu)
      return
    }
    armed = true
    quit.setText('再点一次确认').setColor('#ef9a9a')
    scene.time.delayedCall(2500, () => {
      armed = false
      if (quit.active) quit.setText('✕ 结束').setColor('#c8c8d4')
    })
  })
}

export function addConfirmButton(
  scene: Phaser.Scene,
  L: TeamLayout,
  origin: { x: number; y: number },
  label: string,
  res: number,
  onConfirm: () => void,
  dragged = (): boolean => false,
): { bg: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text } {
  const cx = origin.x + L.content.w / 2
  const cy = origin.y + L.btn.y
  const rect = { x: cx - L.btn.w / 2, y: cy - L.btn.h / 2, w: L.btn.w, h: L.btn.h }
  const bg = scene.add.graphics()
  bg.fillStyle(0x81d4fa, 1)
  bg.fillRoundedRect(rect.x, rect.y, rect.w, rect.h, rect.h / 2)
  const text = scene.add
    .text(cx, cy, label, {
      fontFamily: UI_FONT,
      fontSize: FONT.lead,
      fontStyle: 'bold',
      color: '#17323f',
      resolution: res,
    })
    .setOrigin(0.5)
  scene.add
    .zone(rect.x, rect.y, rect.w, rect.h)
    .setOrigin(0)
    .setInteractive({ useHandCursor: true })
    .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      if (!dragged()) onConfirm()
    })
  scene.input.keyboard?.on('keydown-ENTER', onConfirm)
  scene.input.keyboard?.on('keydown-SPACE', onConfirm)
  return { bg, label: text }
}

export function renderStatGroups(
  scene: Phaser.Scene,
  view: ScrollView,
  width: number,
  id: CharacterId,
  items: ItemId[],
  res: number,
  startY: number,
): number {
  const wrap = width - 104
  let cursor = startY
  for (const group of characterStatGroups(id, items, 1, { path: false })) {
    view.add([
      emojiImage(scene, 42, cursor, group.icon, 35),
      scene.add
        .text(62, cursor, group.title, {
          fontFamily: UI_FONT,
          fontSize: FONT.strong,
          fontStyle: 'bold',
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0, 0.5),
    ])
    cursor += 38
    for (const line of group.lines) {
      const t = scene.add
        .text(62, cursor, line, {
          fontFamily: UI_FONT,
          fontSize: FONT.body,
          color: '#d0d0d8',
          wordWrap: { width: wrap },
          lineSpacing: 6,
          resolution: res,
        })
        .setOrigin(0, 0)
      view.add(t)
      cursor += Math.max(34, t.height + 8)
    }
    cursor += 10
  }
  return cursor
}
