import type Phaser from 'phaser'
import type { DevSection } from '../devtools'
import { CAPTAINS, PICKABLE_CAPTAIN_IDS } from '../data/captains'
import { ROSTER_IDS } from '../data/characters'
import { MAP_IDS, MAPS } from '../data/maps'
import { waveDurationMs } from '../data/waves'
import { beginSandboxRun } from '../ecs/sandbox/knobs'
import { beginRun, currentRun } from '../run/state'
import { SceneKey } from '../scene/keys'
import type { CaptainId } from '../types/captains'
import type { MapId } from '../types/maps'
import { gotoScene } from './nav'

let mapId: MapId = MAP_IDS[0]!
let captainId: CaptainId = PICKABLE_CAPTAIN_IDS[0]!
let teamSize = 1
let startWave = 1
const TEAM_SIZES = [1, 2, 4, 8]
const START_WAVES = [1, 2, 3, 5, 8, 10]

function newRun(): void {
  const captain = CAPTAINS[captainId]
  const run = beginRun(captainId, ROSTER_IDS.slice(0, Math.min(teamSize, captain.teamSize)), mapId)
  run.wave = Math.max(run.wave, startWave)
  let skipped = 0
  for (let w = 1; w < run.wave; w++) skipped += waveDurationMs(w)
  run.combatMs = skipped
}

function ensureRun(): void {
  if (!currentRun()) newRun()
}

/** 主菜单页专有：跳过招募与商店直接开打，或直跳各流程页 */
export function quickStartSections(game: Phaser.Game): DevSection[] {
  return [
    {
      id: 'quickstart',
      title: '开局',
      items: () => [
        {
          kind: 'choice',
          label: '地图',
          options: MAP_IDS.map((id) => ({ id, label: MAPS[id].name })),
          get: () => mapId,
          set: (id): void => {
            const m = MAP_IDS.find((x) => x === id)
            if (m) mapId = m
          },
        },
        {
          kind: 'choice',
          label: '队长',
          options: PICKABLE_CAPTAIN_IDS.map((id) => ({ id, label: CAPTAINS[id].name })),
          get: () => captainId,
          set: (id): void => {
            const c = PICKABLE_CAPTAIN_IDS.find((x) => x === id)
            if (c) captainId = c
          },
        },
        {
          kind: 'choice',
          label: '首发人数 · 按花名册顺序，受队长上限约束',
          options: TEAM_SIZES.map((n) => ({ id: String(n), label: String(n) })),
          get: () => String(teamSize),
          set: (id) => (teamSize = Number(id)),
        },
        {
          kind: 'choice',
          label: '起始波数',
          options: START_WAVES.map((n) => ({ id: String(n), label: `第 ${n} 波` })),
          get: () => String(startWave),
          set: (id) => (startWave = Number(id)),
        },
        {
          kind: 'buttons',
          label: '跳过招募与商店直接开打',
          buttons: [
            {
              label: '开始一局',
              run: (): void => {
                newRun()
                gotoScene(game, SceneKey.Battle)
              },
            },
            {
              label: '试炼场开局',
              run: (): void => {
                beginSandboxRun(mapId)
                gotoScene(game, SceneKey.Battle)
              },
            },
          ],
        },
      ],
    },
    {
      id: 'flow',
      title: '流程页',
      items: () => [
        { kind: 'text', read: () => '没有对局时先按开局页的选择建一局默认的' },
        {
          kind: 'buttons',
          buttons: [
            { label: '选队长', run: () => gotoScene(game, SceneKey.Captain) },
            { label: '商店', run: () => (ensureRun(), gotoScene(game, SceneKey.Shop)) },
            { label: '招募', run: () => (ensureRun(), gotoScene(game, SceneKey.Recruit)) },
            { label: '阵型', run: () => (ensureRun(), gotoScene(game, SceneKey.Formation)) },
            { label: '卡牌', run: () => (ensureRun(), gotoScene(game, SceneKey.Cards)) },
            { label: '结算 · 胜', run: () => (ensureRun(), gotoScene(game, SceneKey.Result, { win: true })) },
            { label: '结算 · 负', run: () => (ensureRun(), gotoScene(game, SceneKey.Result, { win: false })) },
            { label: '图鉴', run: () => gotoScene(game, SceneKey.Wiki) },
            { label: 'Studio', run: () => gotoScene(game, SceneKey.Studio) },
            { label: '设置页', run: () => gotoScene(game, SceneKey.Settings) },
          ],
        },
      ],
    },
  ]
}
