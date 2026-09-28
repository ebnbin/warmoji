import editorJson from '../assets/editor.json'
import { POOLS } from '../data/battlefield'
import { CHARACTERS, MEMBER, TEAM } from '../data/characters'
import { MAX_CHAR_LEVEL } from '../data/charLevel'
import { ENEMIES } from '../data/enemies'
import { SQUAD } from '../data/feel'
import { fromJson } from '../data/json'
import { MAPS } from '../data/maps'
import { runChecks } from '../data/runCheck'
import type { Issue } from '../data/runCheck'
import type { EndRule, FightDef, PhaseDef, RunDef, SpawnRule, StageDef, WavesRule } from '../types/runs'

/** 每一层都去掉只读：编辑器就地改草稿 */
export type Mutable<T> = T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T

/** 编辑器里正在调的一局 */
export type Draft = Mutable<RunDef>
export type Step = Draft['steps'][number]
export type Fight = Mutable<FightDef>
export type Stage = Mutable<StageDef>
export type Phase = Mutable<PhaseDef>
export type Spawn = Mutable<SpawnRule>
export type Waves = Mutable<WavesRule>
export type WaveSquad = Waves['squads'][number]
export type End = Mutable<EndRule>

/** 按阶段写的一场：编辑器只写这一种 */
export function isStage(f: Fight): f is Stage {
  return f.phases !== undefined
}

const CHECKS = runChecks({
  enemies: ENEMIES,
  maps: MAPS,
  pools: POOLS,
  characters: CHARACTERS,
  maxCharLevel: MAX_CHAR_LEVEL,
  team: TEAM,
  radius: MEMBER.radius,
  fanDistance: SQUAD.fanDistance,
})

const fresh = (): Draft => fromJson<Draft>(structuredClone(editorJson))

let draft = fresh()

/** 正在调的草稿：离开编辑器再回来还在，刷新网页回到默认的一局 */
export function currentDraft(): Draft {
  return draft
}

/** 默认那一局的预设队伍 */
export function defaultTeam(): Draft['team'] {
  return fresh().team
}

/** 丢掉改动，回到默认的一局 */
export function resetDraft(): void {
  draft = fresh()
}

/** 草稿眼下的问题：和构建期查内置关卡的是同一套检查 */
export function draftIssues(): Issue[] {
  return CHECKS.run(draft)
}

/** 按草稿此刻的样子定下一局：开局之后再改草稿不影响这一局 */
export function draftSnapshot(): RunDef {
  return structuredClone(draft)
}
