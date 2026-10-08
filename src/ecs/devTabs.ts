import type { EcsBattleScene } from './EcsBattleScene'
import { devChoice, devFlag, markMetrics, pickOnce, resetMetrics } from '../devtools'
import type { DevChoice, DevItem, DevSceneTabs, DevTab } from '../devtools'
import { CHARACTERS, ROSTER_IDS, TEAM } from '../data/characters'
import { bossesOf, mapEnemyRoster } from '../data/maps'
import { beginSandbox } from '../run/state'
import {
  applySandboxPreset,
  isSandboxCharacterOn,
  isSandboxEnemyOn,
  sandboxDifficulty,
  sandboxFireRate,
  sandboxInvincible,
  sandboxLevel,
  sandboxPresetId,
  sandboxScale,
  sandboxStarters,
  SANDBOX_PRESETS,
  SCALES,
  scaleStep,
  setSandboxDifficulty,
  setSandboxFireRate,
  setSandboxInvincible,
  setSandboxLevel,
  setSandboxScale,
  toggleSandboxCharacter,
  toggleSandboxEnemy,
} from './sandbox/knobs'
import type { SandboxLevel, SandboxMul } from './sandbox/knobs'
import { LENS_MODES } from './lens'
import type { LensMode } from './lens'
import { pipelineProfile, profilePipelineWhen, resetPipelineProfile } from './systems/pipeline/step'
import { hostNumChoices } from './systems/shared/devNumbers'
import { LAYER_M } from './utils/pass'

export const showTargets = devFlag({ id: 'battle.targets', label: '队员目标连线', desc: '从每个队员画到其当前目标' })
export const showWalls = devFlag({ id: 'battle.walls', label: '碰撞边界', desc: '勾出身体走不进去的岩壁、山体，残垣里标准身高跨不过的墙，沙漠的标志物' })
export const showGates = devFlag({ id: 'battle.gates', label: '出怪口', desc: '画出敌人从哪些地方进场，越亮的这十秒出得越多' })
const meters = (layers: number): string => `${+(layers * LAYER_M).toFixed(1)} 米`
export const showHeights = devFlag({
  id: 'battle.heights',
  label: '高度',
  desc: `地形按挡到第几层上色：绿到离地 ${meters(1)}、黄到 ${meters(2)}、橙到 ${meters(3)}、红更高、紫一直高上去；填满的挡子弹，棋盘格的只挡身体，灰色斜纹是没有高度的硬边界。身体旁的小标尺一格一层，占着的层上色，白线以下的高度跨得过；子弹的圈按它此刻飞在哪一层上色`,
})
export const showGrid = devFlag({ id: 'battle.grid', label: '坐标网格', desc: '每格一条白线；红线是 y = 0，绿线是 x = 0，两条相交处就是原点；黄框是能走的地方与地图的边不能越出的安全区' })
const LENS_LABELS: Record<LensMode, string> = { follow: '跟随', map: '完整地图' }
export const lensMode = devChoice<LensMode>({
  id: 'battle.lens',
  label: '镜头',
  desc: '完整地图不跟随队长，整张图放进一屏',
  options: LENS_MODES.map((id) => ({ id, label: LENS_LABELS[id] })),
  default: 'follow',
})

// 模拟层不依赖开发面板：剖析开关与玩法数值从这里注入，持久化与显示归开发面板；回放时模拟层按录下的数值钉住
const profiling = devFlag({ id: 'battle.profile', label: '流水线剖析', desc: '逐 system 计时，有一点开销' })
profilePipelineWhen(profiling, () => performance.now())

interface Tuned {
  readonly choice: DevChoice<string>
  readonly fallback: string
}

const tuned: Tuned[] = []
hostNumChoices((k) => {
  const choice = devChoice({
    id: k.id,
    label: `${k.group} · ${k.label}`,
    desc: `${k.desc ? `${k.desc} · ` : ''}默认 ${k.fmt(k.fallback)}`,
    options: k.values.map((v) => ({ id: String(v), label: k.fmt(v) })),
    default: String(k.fallback),
  })
  tuned.push({ choice, fallback: String(k.fallback) })
  return () => Number(choice())
})
const tunedCount = (): number => tuned.filter((t) => t.choice() !== t.fallback).length

/** 0 是停住 */
const SIM_RATES: readonly number[] = [0, 0.1, 0.25, 0.5, 1, 2, 4]
const MULS: readonly SandboxMul[] = [1, 3, 10]
const LEVELS: readonly { readonly lv: SandboxLevel; readonly label: string }[] = [
  { lv: 0, label: '基础' },
  { lv: 1, label: '一阶' },
  { lv: 2, label: '二阶' },
]
const STEADY_RATIO = 0.95

function statusText(battle: EcsBattleScene): string {
  const p = battle.perfSnapshot()
  const kinds = battle.devEnemyCounts()
  return [
    `敌人      ${p.enemies}`,
    `弹体      ${p.projectiles}`,
    `金币      ${p.coins}`,
    `刷怪预告  ${p.pending}`,
    `刷怪间隔  ${p.spawnIntervalMs} ms`,
    `图集页    ${p.atlasPages}`,
    `按种类    ${kinds.length > 0 ? kinds.slice(0, 8).map((k) => `${k.name} ${k.n}`).join(' · ') : '无'}`,
  ].join('\n')
}

function teamText(battle: EcsBattleScene): string {
  return battle.run.roster
    .map((id) => {
      const c = CHARACTERS[id]
      return `${c.name}  极速 ${c.stats.moveSpeed.toFixed(1)}  响应 ${(c.body.mass / c.body.drag).toFixed(2)}s  质量 ${c.body.mass}`
    })
    .join('\n')
}

function profileText(): string {
  const p = pipelineProfile()
  if (p.frames === 0) return '未采样：打开上面的流水线剖析'
  const total = p.rows.reduce((s, r) => s + r.avgMs, 0)
  return [
    `已采样 ${p.frames} 帧 · 各 system 平均合计 ${total.toFixed(2)} ms/帧`,
    ...p.rows.slice(0, 14).map((r) => `${r.avgMs.toFixed(3).padStart(7)} ms  ${r.name}`),
  ].join('\n')
}

function statusTab(battle: EcsBattleScene): DevTab {
  return {
    id: 'status',
    title: '概况',
    items: () => [
      { kind: 'text', mono: true, read: () => statusText(battle) },
      { kind: 'text', label: '关卡', mono: true, read: () => battle.devPhaseText() },
      { kind: 'text', label: '出怪口', mono: true, read: () => battle.devGateText() },
      { kind: 'text', label: '录像', desc: '每步之前的输入都录下，回放照着重打，每秒比对一次战局', mono: true, read: () => battle.tapeText() },
    ],
  }
}

/** 指令和玩家的操作一样录进录像 */
function commandsTab(battle: EcsBattleScene): DevTab {
  return {
    id: 'commands',
    title: '指令',
    items: () => [
      {
        kind: 'buttons',
        label: '生成',
        buttons: [
          { label: '1 只', run: () => battle.dev({ kind: 'spawn', what: 'one' }) },
          { label: '1 只精英', run: () => battle.dev({ kind: 'spawn', what: 'elite' }) },
          { label: '精英潮', run: () => battle.dev({ kind: 'spawn', what: 'surge' }) },
          ...bossesOf(battle.run.mapId).map((b, n) => ({ label: b.name, run: (): void => battle.dev({ kind: 'spawn', what: 'boss', n }) })),
          { label: '全灭', run: () => battle.dev({ kind: 'killAll' }) },
        ],
      },
      {
        kind: 'buttons',
        label: '作弊',
        buttons: [
          { label: '金币 +1000', run: () => battle.dev({ kind: 'grant', what: 'coins' }) },
          { label: '升一级', run: () => battle.dev({ kind: 'grant', what: 'level' }) },
          { label: '技能冷却清零', run: () => battle.dev({ kind: 'resetSkill' }) },
          ...(battle.endless ? [] : [{ label: '结束本波', run: (): void => battle.dev({ kind: 'endWave' }) }]),
          { label: '下一阶段', run: () => battle.dev({ kind: 'nextPhase' }) },
        ],
      },
    ],
  }
}

/** 只停模拟：画面、镜头、开发面板与输入照常，停住时可一步一步往前走，点选身体看它此刻的样子 */
function simTab(battle: EcsBattleScene): DevTab {
  return {
    id: 'sim',
    title: '模拟',
    items: () => [
      {
        kind: 'choice',
        label: '模拟速度',
        desc: '只管模拟，画面与镜头照常；整个游戏的快慢在引擎层的时间页签',
        options: SIM_RATES.map((s) => ({ id: String(s), label: s === 0 ? '停' : `×${s}` })),
        get: () => String(battle.simRate()),
        set: (id) => battle.setSimRate(Number(id)),
      },
      {
        kind: 'buttons',
        buttons: [
          { label: '走一步', run: () => battle.stepTicks(1) },
          { label: '走一秒', run: () => battle.stepTicks(60) },
          { label: '点选单位', run: () => pickOnce((px, py) => battle.inspectAt(px, py)) },
        ],
      },
      { kind: 'text', label: '单位', mono: true, read: () => battle.inspectText() },
    ],
  }
}

function viewTab(): DevTab {
  return {
    id: 'view',
    title: '显示',
    items: () => [lensMode.item, showTargets.item, showWalls.item, showGates.item, showHeights.item, showGrid.item],
  }
}

/** 改过的值会存下来，之后每一局都按它打 */
function tuningTab(battle: EcsBattleScene): DevTab {
  return {
    id: 'tuning',
    title: '调参',
    badge: () => (tunedCount() > 0 ? String(tunedCount()) : ''),
    items: (): DevItem[] => [
      { kind: 'text', label: '队伍物理', desc: '极速是属性表的移速，响应 = 质量 ÷ 阻力', mono: true, read: () => teamText(battle) },
      {
        kind: 'action',
        label: '全部恢复默认',
        desc: tunedCount() > 0 ? `改过 ${tunedCount()} 项` : '都是默认值',
        run: () => tuned.forEach((t) => t.choice.item.set(t.fallback)),
      },
      ...tuned.map((t) => t.choice.item),
    ],
  }
}

function profileTab(): DevTab {
  return {
    id: 'profile',
    title: '剖析',
    items: () => [
      profiling.item,
      { kind: 'text', label: '各 system', desc: '平均毫秒/帧，外层含内层', mono: true, read: profileText },
      { kind: 'buttons', buttons: [{ label: '重置剖析', run: resetPipelineProfile }] },
    ],
  }
}

function mulChoice(label: string, get: () => SandboxMul, set: (m: SandboxMul) => void): DevItem {
  return {
    kind: 'choice',
    label,
    options: MULS.map((m) => ({ id: String(m), label: `×${m}` })),
    get: () => String(get()),
    set: (id): void => {
      const m = MULS.find((x) => String(x) === id)
      if (m !== undefined) set(m)
    },
  }
}

function sandboxTab(battle: EcsBattleScene): DevTab {
  const restart = (): void => {
    beginSandbox(battle.run.mapId)
    resetMetrics()
    battle.scene.restart()
  }
  const roster = mapEnemyRoster(battle.run.mapId)
  return {
    id: 'sandbox',
    title: '沙盒',
    items: () => [
      {
        kind: 'text',
        mono: true,
        read: (): string => {
          const step = scaleStep()
          const preset = sandboxPresetId()
          return [
            `队伍 ${sandboxStarters().length} 人 · ${LEVELS[sandboxLevel()]!.label} · 攻速 ×${sandboxFireRate()}`,
            `敌人血量 ×${sandboxDifficulty()} · 规模「${step.label}」上限 ${step.spawn.cap} · 每批 ${step.spawn.batch}`,
            preset === undefined ? '自定义（旋钮被手动改过）' : `预设：${SANDBOX_PRESETS.find((p) => p.id === preset)?.label ?? preset}`,
          ].join('\n')
        },
      },
      {
        kind: 'choice',
        label: '强度预设',
        desc: '应用后重开本局',
        options: SANDBOX_PRESETS.map((p) => ({ id: p.id, label: p.label, desc: p.desc })),
        get: () => sandboxPresetId() ?? '',
        set: (id): void => {
          const p = SANDBOX_PRESETS.find((x) => x.id === id)
          if (!p) return
          applySandboxPreset(p.id)
          restart()
        },
      },
      {
        kind: 'multi',
        label: '敌人',
        desc: '实时生效',
        options: roster.map((d) => ({ id: d.kind, label: d.name })),
        has: (id) => roster.some((d) => d.kind === id && isSandboxEnemyOn(d.kind)),
        toggle: (id): void => {
          const d = roster.find((x) => x.kind === id)
          if (d) toggleSandboxEnemy(d.kind)
        },
      },
      {
        kind: 'choice',
        label: '规模',
        desc: '在场上限',
        options: SCALES.map((s) => ({ id: s.id, label: `${s.label} ${s.spawn.cap}` })),
        get: () => sandboxScale(),
        set: (id): void => {
          const s = SCALES.find((x) => x.id === id)
          if (s) setSandboxScale(s.id)
        },
      },
      mulChoice('难度 · 敌人血量', sandboxDifficulty, setSandboxDifficulty),
      mulChoice('攻速 · 我方冷却 ÷ 它', sandboxFireRate, (m) => {
        setSandboxFireRate(m)
        battle.dev({ kind: 'knobs' })
      }),
      {
        kind: 'toggle',
        label: '无敌',
        get: sandboxInvincible,
        set: (on): void => {
          setSandboxInvincible(on)
          battle.dev({ kind: 'invincible', on })
        },
      },
      {
        kind: 'multi',
        label: '角色',
        desc: `最少 1 最多 ${TEAM.maxSize} · 改动后重建队伍`,
        options: ROSTER_IDS.map((id) => ({ id, label: CHARACTERS[id].name })),
        has: (id) => ROSTER_IDS.some((c) => c === id && isSandboxCharacterOn(c)),
        toggle: (id): void => {
          const c = ROSTER_IDS.find((x) => x === id)
          if (!c) return
          toggleSandboxCharacter(c)
          restart()
        },
      },
      {
        kind: 'choice',
        label: '角色等级',
        desc: '换整套能力形态，重开本局',
        options: LEVELS.map((l) => ({ id: String(l.lv), label: l.label })),
        get: () => String(sandboxLevel()),
        set: (id): void => {
          const l = LEVELS.find((x) => String(x.lv) === id)
          if (!l) return
          setSandboxLevel(l.lv)
          restart()
        },
      },
      { kind: 'action', label: '重开本局', desc: '按当前旋钮重建队伍与战场，性能采样归零', run: restart },
    ],
  }
}

/** 沙盒页签只在沙盒里出现 */
export function battleDevTabs(battle: EcsBattleScene): DevSceneTabs {
  return {
    title: '战斗',
    tabs: [
      statusTab(battle),
      commandsTab(battle),
      simTab(battle),
      viewTab(),
      tuningTab(battle),
      profileTab(),
      ...(battle.knobs ? [sandboxTab(battle)] : []),
    ],
  }
}

/** 沙盒刷怪达到上限时把性能采样窗口起点标在那一刻 */
export function watchSandboxSteady(battle: EcsBattleScene): void {
  let steady = false
  battle.time.addEvent({
    delay: 500,
    loop: true,
    callback: (): void => {
      if (steady || battle.perfSnapshot().enemies < scaleStep().spawn.cap * STEADY_RATIO) return
      steady = true
      markMetrics()
    },
  })
}
