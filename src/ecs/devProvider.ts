import type { EcsBattleScene } from './EcsBattleScene'
import { defineDevChoice, defineDevFlag, devFlagItem, markPerf, pickOnce, resetPerf, TIME_SCALES } from '../devtools'
import type { DevButtonsItem, DevItem, DevProvider } from '../devtools'
import { CHARACTERS, ROSTER_IDS, TEAM } from '../data/characters'
import { mapEnemyRoster } from '../data/maps'
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
import { pipelineProfile, profilePipelineWhen, resetPipelineProfile } from './systems/pipeline/step'
import { hostNumChoices } from './systems/shared/devNumbers'
import { decodeTape, encodeTape } from './tape'
import type { Tape } from './tape'

// 模拟层不依赖开发面板：它的剖析开关与可调数值在这里挂上，持久化与显示归开发面板
profilePipelineWhen(
  defineDevFlag({ id: 'ecs.profile', group: '战斗', label: '流水线剖析', desc: '逐 system 计时，结果在战斗页签' }),
  () => performance.now(),
)
hostNumChoices((k) => {
  const get = defineDevChoice({
    id: k.id,
    group: k.group,
    label: k.label,
    desc: k.desc,
    options: k.values.map((v) => ({ id: String(v), label: k.fmt(v) })),
    default: String(k.fallback),
  })
  return () => Number(get())
})

const MULS: readonly SandboxMul[] = [1, 3, 10]
const LEVELS: readonly { readonly lv: SandboxLevel; readonly label: string }[] = [
  { lv: 0, label: '基础' },
  { lv: 1, label: '一阶' },
  { lv: 2, label: '二阶' },
]
const STEADY_RATIO = 0.95

function profileText(): string {
  const p = pipelineProfile()
  if (p.frames === 0) return '未采样：在"开关"页签打开"战斗 · 流水线剖析"'
  const rows = p.rows.slice(0, 14)
  const total = p.rows.reduce((s, r) => s + r.avgMs, 0)
  return [
    `已采样 ${p.frames} 帧 · 各 system 平均合计 ${total.toFixed(2)} ms/帧`,
    ...rows.map((r) => `${r.avgMs.toFixed(3).padStart(7)} ms  ${r.name}`),
  ].join('\n')
}

/** 录像存成文件：名字带上地图与步数 */
function saveTape(battle: EcsBattleScene, tape: Tape): void {
  const url = URL.createObjectURL(new Blob([encodeTape(tape)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `warmoji-${battle.run.mapId}-${tape.ticks}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** 选一个录像文件，读出来就照着重打 */
function loadTape(battle: EcsBattleScene): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json,.json'
  input.onchange = (): void => {
    const file = input.files?.[0]
    if (!file) return
    file
      .text()
      .then((text) => battle.replay(decodeTape(text)))
      .catch((e: unknown) => console.error('读不了这份录像', e))
  }
  input.click()
}

function tapeButtons(battle: EcsBattleScene): DevButtonsItem['buttons'] {
  const now = battle.currentTape()
  const before = battle.previousTape()
  return [
    ...(now ? [{ label: '从头回放这一场', run: (): void => battle.replay(now) }, { label: '存下录像', run: (): void => saveTape(battle, now) }] : []),
    ...(before ? [{ label: '回放上一场', run: (): void => battle.replay(before) }] : []),
    { label: '读入录像回放', run: (): void => loadTape(battle) },
  ]
}

function battleItems(battle: EcsBattleScene): DevItem[] {
  return [
    {
      kind: 'text',
      mono: true,
      read: (): string => {
        const p = battle.perfSnapshot()
        const kinds = battle.devEnemyCounts()
        return [
          `敌人      ${p.enemies}`,
          `弹体      ${p.projectiles}`,
          `金币      ${p.coins}`,
          `刷怪预告  ${p.pending}`,
          `刷怪间隔  ${p.spawnIntervalMs} ms`,
          `GameObject ${p.objects}`,
          `图集页    ${p.atlasPages}`,
          `按种类    ${kinds.length > 0 ? kinds.slice(0, 8).map((k) => `${k.name} ${k.n}`).join(' · ') : '无'}`,
        ].join('\n')
      },
    },
    { kind: 'text', label: '关卡', mono: true, read: () => battle.devPhaseText() },
    { kind: 'text', label: '出怪口', mono: true, read: () => battle.devGateText() },
    {
      kind: 'buttons',
      label: '生成',
      buttons: [
        { label: '1 只', run: () => battle.dev({ kind: 'spawn', what: 'one' }) },
        { label: '1 只精英', run: () => battle.dev({ kind: 'spawn', what: 'elite' }) },
        { label: '精英潮', run: () => battle.dev({ kind: 'spawn', what: 'surge' }) },
        { label: 'Boss', run: () => battle.dev({ kind: 'spawn', what: 'boss' }) },
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
    { kind: 'text', label: '录像 · 每步之前的输入都录下，回放照着重打，每秒比对一次战局', mono: true, read: () => battle.tapeText() },
    { kind: 'buttons', buttons: tapeButtons(battle) },
    {
      kind: 'text',
      label: '队伍物理 · 极速是属性表的移速 · 响应 = 质量 ÷ 阻力 · 其余旋钮在"开关"页签',
      mono: true,
      read: (): string =>
        battle.run.roster
          .map((id) => {
            const b = CHARACTERS[id].body
            return `${CHARACTERS[id].name}  极速 ${CHARACTERS[id].stats.moveSpeed.toFixed(1)}  响应 ${(b.mass / b.drag).toFixed(2)}s  质量 ${b.mass}`
          })
          .join('\n'),
    },
    devFlagItem('battle.targets'),
    devFlagItem('battle.walls'),
    devFlagItem('battle.heights'),
    devFlagItem('battle.grid'),
    devFlagItem('battle.gates'),
    devFlagItem('ecs.profile'),
    { kind: 'text', label: '流水线剖析 · 平均毫秒/帧 · 外层含内层', mono: true, read: profileText },
    { kind: 'buttons', buttons: [{ label: '重置剖析', run: resetPipelineProfile }] },
  ]
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

function sandboxItems(battle: EcsBattleScene): DevItem[] {
  const restart = (): void => {
    beginSandbox(battle.run.mapId)
    resetPerf()
    battle.scene.restart()
  }
  const roster = mapEnemyRoster(battle.run.mapId)
  return [
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
      label: '强度预设 · 应用后重开本局',
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
      kind: 'flags',
      label: '敌人 · 实时生效',
      options: roster.map((d) => ({ id: d.kind, label: d.name })),
      has: (id) => roster.some((d) => d.kind === id && isSandboxEnemyOn(d.kind)),
      toggle: (id): void => {
        const d = roster.find((x) => x.kind === id)
        if (d) toggleSandboxEnemy(d.kind)
      },
    },
    {
      kind: 'choice',
      label: '规模 · 在场上限',
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
      kind: 'flags',
      label: `角色 · 最少 1 最多 ${TEAM.maxSize} · 改动后重建队伍`,
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
      label: '角色等级 · 换整套能力形态',
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
  ]
}

/** 只停模拟：画面、镜头、开发面板与输入照常，停住时可一步一步往前走，点选身体看它此刻的样子 */
function inspectItems(battle: EcsBattleScene): DevItem[] {
  return [
    {
      kind: 'choice',
      label: '模拟快慢',
      options: TIME_SCALES.map((s) => ({ id: String(s), label: s === 0 ? '停' : `×${s}` })),
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
    { kind: 'text', label: '检视 · 停住时也照常刷新', mono: true, read: () => battle.inspectText() },
  ]
}

/** 战斗 scene 专有能力；沙盒页签只在沙盒里出现 */
export function battleDevProvider(battle: EcsBattleScene): DevProvider {
  return {
    id: 'battle',
    title: '战斗',
    sections: [
      { id: 'battle', title: '战斗', items: () => battleItems(battle) },
      { id: 'inspect', title: '检视', items: () => inspectItems(battle) },
      ...(battle.knobs ? [{ id: 'sandbox', title: '沙盒', items: (): DevItem[] => sandboxItems(battle) }] : []),
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
      markPerf()
    },
  })
}
