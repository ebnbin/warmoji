import Phaser from 'phaser'
import { registerDevSection } from '../devtools'
import type { DevItem } from '../devtools'
import { bgmStatus, playBgm } from '../audio/bgm'
import { playSfx, setSfxEnabled, sfxStats } from '../audio/sfx'
import { setBgmEnabled } from '../audio/bgm'
import { CAPTAINS, PICKABLE_CAPTAIN_IDS } from '../data/captains'
import { CHARACTERS, ROSTER_IDS } from '../data/characters'
import { MAP_IDS, MAPS } from '../data/maps'
import { SFX } from '../data/sfx'
import { waveDurationMs } from '../data/waves'
import { beginSandboxRun } from '../ecs/sandbox/knobs'
import { beginRun, currentRun, endRun } from '../run/state'
import { loadSettings, saveSettings, SETTING_DEFS } from '../save/settings'
import type { CaptainId } from '../types/captains'
import type { MapId } from '../types/maps'
import { keysOf } from '../util/record'
import { browserStorage } from '../util/storage'
import { SceneKey } from './keys'

/** 停掉所有业务 scene 后启动目标 scene：从任意位置跳转 */
export function gotoScene(game: Phaser.Game, key: SceneKey, data?: object): void {
  for (const s of game.scene.getScenes(false)) {
    const status = s.sys.settings.status
    if (s.scene.key !== SceneKey.DevTools && status >= Phaser.Scenes.RUNNING && status <= Phaser.Scenes.SLEEPING) s.scene.stop()
  }
  game.scene.start(key, data)
}

let mapId: MapId = MAP_IDS[0]!
let captainId: CaptainId = PICKABLE_CAPTAIN_IDS[0]!
let teamSize = 1
let startWave = 1
const TEAM_SIZES = [1, 2, 4, 8]
const START_WAVES = [1, 2, 3, 5, 8, 10]

function startRun(game: Phaser.Game): void {
  const captain = CAPTAINS[captainId]
  const run = beginRun(captainId, ROSTER_IDS.slice(0, Math.min(teamSize, captain.teamSize)), mapId)
  run.wave = Math.max(run.wave, startWave)
  let skipped = 0
  for (let w = 1; w < run.wave; w++) skipped += waveDurationMs(w)
  run.combatMs = skipped
  gotoScene(game, SceneKey.Battle)
}

function quickStartItems(game: Phaser.Game): DevItem[] {
  return [
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
        { label: '开始一局', run: () => startRun(game) },
        {
          label: '试炼场开局',
          run: (): void => {
            beginSandboxRun(mapId)
            gotoScene(game, SceneKey.Battle)
          },
        },
      ],
    },
    {
      kind: 'buttons',
      label: '流程页 · 没有对局时先建一局默认的',
      buttons: [
        { label: '商店', run: () => gotoScene(game, ensureRunThen(SceneKey.Shop)) },
        { label: '招募', run: () => gotoScene(game, ensureRunThen(SceneKey.Recruit)) },
        { label: '卡牌', run: () => gotoScene(game, ensureRunThen(SceneKey.Cards)) },
        { label: '结算 · 胜', run: () => gotoScene(game, ensureRunThen(SceneKey.Result), { win: true }) },
        { label: '结算 · 负', run: () => gotoScene(game, ensureRunThen(SceneKey.Result), { win: false }) },
      ],
    },
  ]
}

function ensureRunThen(key: SceneKey): SceneKey {
  if (!currentRun()) beginRun(captainId, ROSTER_IDS.slice(0, Math.min(teamSize, CAPTAINS[captainId].teamSize)), mapId)
  return key
}

function runText(): string {
  const run = currentRun()
  if (!run) return '当前没有进行中的一局'
  const cards = Object.entries(run.teamCards).reduce((s, [, n]) => s + (n ?? 0), 0)
  return [
    `${CAPTAINS[run.captainId].name} · ${MAPS[run.mapId].name}${run.sandbox ? ' · 试炼场' : ''}`,
    `第 ${run.wave} 波 · 金币 ${run.coins} · 击杀 ${run.kills} · 等级 ${run.xp.level}（${run.xp.xp} xp）· 待抽卡 ${run.cardDraws}`,
    `队伍 ${run.roster.map((id) => CHARACTERS[id].name).join('、')}`,
    `队伍卡 ${cards} 张 · 技能冷却 ${Math.ceil(run.skillCdMs / 1000)} s · 累计战斗 ${Math.round(run.combatMs / 1000)} s`,
  ].join('\n')
}

function runItems(game: Phaser.Game): DevItem[] {
  return [
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
  ]
}

function settingsItems(): DevItem[] {
  return SETTING_DEFS.map((def) => ({
    kind: 'toggle',
    label: def.label,
    desc: def.desc,
    get: () => loadSettings(browserStorage())[def.key],
    set: (on): void => {
      const settings = loadSettings(browserStorage())
      settings[def.key] = on
      saveSettings(browserStorage(), settings)
      setSfxEnabled(settings.sound)
      setBgmEnabled(settings.bgm)
    },
  }))
}

function audioItems(): DevItem[] {
  return [
    {
      kind: 'text',
      mono: true,
      read: (): string => {
        const s = sfxStats()
        const b = bgmStatus()
        return [
          `音效 ${s.enabled ? '开' : '关'} · AudioContext ${s.state} · 已烘焙 ${s.baked} · 已播放 ${s.played} · 声部 ${s.active}/${s.max}`,
          `BGM ${b.enabled ? '开' : '关'} · 播放中 ${b.playing ?? '无'} · 期望 ${b.desired ?? '无'}`,
        ].join('\n')
      },
    },
    { kind: 'buttons', label: '试听音效', buttons: keysOf(SFX).map((id) => ({ label: id, run: () => playSfx(id) })) },
    {
      kind: 'buttons',
      label: '切换 BGM',
      buttons: [{ label: 'lobby', run: () => playBgm('lobby') }, ...MAP_IDS.map((id) => ({ label: MAPS[id].name, run: (): void => playBgm(id) }))],
    },
  ]
}

export function registerLobbyDevTools(game: Phaser.Game): void {
  registerDevSection({ id: 'quickstart', title: '开局', items: () => quickStartItems(game) })
  registerDevSection({ id: 'run', title: '对局', items: () => runItems(game) })
  registerDevSection({ id: 'settings', title: '设置', items: settingsItems })
  registerDevSection({ id: 'audio', title: '音频', items: audioItems })
}
