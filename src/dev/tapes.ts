import type Phaser from 'phaser'
import type { DevItem, DevTab } from '../devtools'
import { MAPS } from '../data/maps'
import { decodeTape, encodeTape, keptTapes } from '../ecs/tape'
import type { Tape } from '../ecs/tape'
import { SceneKey } from '../scene/keys'
import { goto } from './pages'

function tapeText(t: Tape): string {
  return `${MAPS[t.run.mapId].name} · ${t.ticks} 步${t.final === null ? '' : ' · 已打完'} · ${t.events.length} 条输入`
}

/** 照录像从头重打一场：战斗换成录像里的那一局 */
function replay(game: Phaser.Game, tape: Tape): void {
  goto(game, SceneKey.Battle, { tape })
}

/** 名字带上地图与步数 */
function save(tape: Tape): void {
  const url = URL.createObjectURL(new Blob([encodeTape(tape)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `warmoji-${tape.run.mapId}-${tape.ticks}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function load(game: Phaser.Game): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json,.json'
  input.onchange = (): void => {
    const file = input.files?.[0]
    if (!file) return
    file
      .text()
      .then((text) => replay(game, decodeTape(text)))
      .catch((e: unknown) => console.error('读不了这份录像', e))
  }
  input.click()
}

/** 每场战斗都录下来；回放从哪个页面都能开始 */
export function tapesTab(game: Phaser.Game): DevTab {
  return {
    id: 'tapes',
    title: '录像',
    items: (): DevItem[] => [
      ...keptTapes().flatMap((t, i): DevItem[] => [
        { kind: 'text', label: i === 0 ? '最近一场' : '上一场', mono: true, read: () => tapeText(t) },
        { kind: 'buttons', buttons: [{ label: '回放', run: () => replay(game, t) }, { label: '存成文件', run: () => save(t) }] },
      ]),
      { kind: 'action', label: '读入录像文件回放', desc: '回放照着录下的输入重打，每秒比对一次战局', run: () => load(game) },
    ],
  }
}
