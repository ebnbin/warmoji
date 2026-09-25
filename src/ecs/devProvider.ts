import type { EcsBattleScene } from './EcsBattleScene'
import { devFlagItem, markPerf, resetPerf } from '../devtools'
import type { DevItem, DevProvider } from '../devtools'
import { CHARACTERS, ROSTER_IDS } from '../data/characters'
import { mapEnemyRoster } from '../data/maps'
import {
  applySandboxPreset,
  beginSandboxRun,
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
import { pipelineProfile, resetPipelineProfile } from './systems/pipeline/step'

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
    {
      kind: 'buttons',
      label: '生成',
      buttons: [
        { label: '1 只', run: () => battle.devSpawn('one') },
        { label: '1 只精英', run: () => battle.devSpawn('elite') },
        { label: '精英潮', run: () => battle.devSpawn('surge') },
        { label: 'Boss', run: () => battle.devSpawn('boss') },
        { label: '全灭', run: () => battle.devKillAll() },
      ],
    },
    {
      kind: 'buttons',
      label: '作弊',
      buttons: [
        { label: '金币 +1000', run: () => battle.devGrant('coins') },
        { label: '升一级', run: () => battle.devGrant('level') },
        { label: '技能冷却清零', run: () => battle.devResetSkill() },
        ...(battle.sandbox ? [] : [{ label: '结束本波', run: (): void => battle.devEndWave() }]),
      ],
    },
    devFlagItem('battle.targets'),
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
    beginSandboxRun(battle.run.mapId)
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
    mulChoice('攻速 · 我方冷却 ÷ 它', sandboxFireRate, setSandboxFireRate),
    {
      kind: 'toggle',
      label: '无敌',
      get: sandboxInvincible,
      set: (on): void => {
        setSandboxInvincible(on)
        battle.applySandboxInvincible()
      },
    },
    {
      kind: 'flags',
      label: '角色 · 最少 1 最多 8 · 改动后重建队伍',
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

/** 战斗 scene 专有能力；试炼场页签只在试炼场模式下出现 */
export function battleDevProvider(battle: EcsBattleScene): DevProvider {
  return {
    id: 'battle',
    title: '战斗',
    sections: [
      { id: 'battle', title: '战斗', items: () => battleItems(battle) },
      ...(battle.sandbox ? [{ id: 'sandbox', title: '试炼场', items: (): DevItem[] => sandboxItems(battle) }] : []),
    ],
  }
}

/** 试炼场刷怪达到上限时把性能采样窗口起点标在那一刻 */
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
