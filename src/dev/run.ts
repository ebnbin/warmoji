import type Phaser from 'phaser'
import type { DevProvider, DevSection } from '../devtools'
import { CHARACTERS, ROSTER_IDS, TEAM } from '../data/characters'
import { MAP_IDS, MAPS } from '../data/maps'
import { waveDurationMs } from '../data/waves'
import { beginSandboxRun } from '../ecs/sandbox/knobs'
import { beginRun, currentRun, endRun } from '../run/state'
import { SceneKey } from '../scene/keys'
import type { MapId } from '../types/maps'
import { gotoScene } from './nav'

let mapId: MapId = MAP_IDS[0]!
let teamSize = 1
let startWave = 1
const TEAM_SIZES = Array.from({ length: TEAM.maxSize }, (_, i) => i + 1)
const START_WAVES = [1, 2, 3, 5, 8, 10]

function newRun(): void {
  const run = beginRun(ROSTER_IDS.slice(0, teamSize), mapId)
  run.wave = Math.max(run.wave, startWave)
  let skipped = 0
  for (let w = 1; w < run.wave; w++) skipped += waveDurationMs(w)
  run.combatMs = skipped
}

function ensureRun(): void {
  if (!currentRun()) newRun()
}

function runText(): string {
  const run = currentRun()
  if (!run) return '当前没有进行中的一局'
  return [
    `${MAPS[run.mapId].name}${run.sandbox ? ' · 试炼场' : ''}`,
    `第 ${run.wave} 波 · 金币 ${run.coins} · 击杀 ${run.kills} · 等级 ${run.xp.level}（${run.xp.xp} xp）`,
    `队伍 ${run.roster.map((id) => CHARACTERS[id].name).join('、')} · 队长 ${CHARACTERS[run.leaderId].name}`,
    `累计战斗 ${Math.round(run.combatMs / 1000)} s`,
  ].join('\n')
}

/** 游戏级：一局的建立、状态与流程页直跳，与当前停在哪一页无关 */
function runSections(game: Phaser.Game): DevSection[] {
  return [
    {
      id: 'status',
      title: '对局',
      items: () => [
        { kind: 'text', mono: true, read: runText },
        {
          kind: 'buttons',
          buttons: [
            { label: '金币 +100', run: () => void (currentRun() && (currentRun()!.coins += 100)) },
            { label: '金币 +1000', run: () => void (currentRun() && (currentRun()!.coins += 1000)) },
            {
              label: '结束本局回主菜单',
              run: (): void => {
                endRun()
                gotoScene(game, SceneKey.Menu)
              },
            },
          ],
        },
      ],
    },
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
          label: '首发人数 · 按花名册顺序',
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
          kind: 'action',
          label: '开始一局战斗',
          desc: '按上面的地图、队长、人数、波数新建一局，跳过招募与商店直接进战斗',
          run: (): void => {
            newRun()
            gotoScene(game, SceneKey.Battle)
          },
        },
        {
          kind: 'action',
          label: '进入试炼场',
          desc: '用上面选的地图开一局试炼场：队员无敌，刷怪规模与敌人种类在战斗页签里调',
          run: (): void => {
            beginSandboxRun(mapId)
            gotoScene(game, SceneKey.Battle)
          },
        },
      ],
    },
    {
      id: 'flow',
      title: '流程页',
      items: () => [
        { kind: 'text', read: () => '直接跳到某个流程页；需要对局的页面在没有对局时先按开局页的选择建一局' },
        {
          kind: 'buttons',
          buttons: [
            { label: '商店', run: () => (ensureRun(), gotoScene(game, SceneKey.Shop)) },
            { label: '招募', run: () => (ensureRun(), gotoScene(game, SceneKey.Recruit)) },
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

export function runProvider(game: Phaser.Game): DevProvider {
  return { id: 'run', title: '对局', sections: runSections(game) }
}
