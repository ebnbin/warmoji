import { CAPTAINS, TEST_CAPTAIN } from '../data/captains'
import { ROSTER_IDS } from '../data/characters'
import type { CharacterId } from '../types/characters'
import type { CaptainId } from '../types/captains'

// 测试模式（地图页勾选进入，run.testMode = true）：免死无时限的沙盒，
// 敌人 / 角色 + 密度 / 难度 / 攻速 / 无敌 都能在场内自由切换。
// 队长固定为测试专用队长（编制 8、无限金币、永远满豆、无增益），不可更改。
// 以下为当前选择状态（模块级，跨场景重启保留）。

const enemies = new Set<string>()
// 默认 1 人：最少 1、最多 = 测试队长编制（8）
let roster: CharacterId[] = [...ROSTER_IDS.slice(0, 1)]
let panelOpen = true

/** 角色等级：统一作用于全部角色的升级档（0 基础 / 1 一阶 / 2 二阶，对应升级卡 u1/u2） */
export type LabLevel = 0 | 1 | 2
let level: LabLevel = 0

// 无敌血量（够高即事实上打不死）——替代原压测的 maxHp
export const INVINCIBLE_HP = 10_000_000

// 密度档位：出怪间隔 / 在场上限 / 每批数量。「爆满」= 旧压测级（满屏敌人跑分）
export type LabDensity = 'low' | 'mid' | 'high' | 'max'
export const DENSITY_PARAMS: Record<LabDensity, { intervalMs: number; cap: number; batch: number }> = {
  low: { intervalMs: 1100, cap: 6, batch: 1 },
  mid: { intervalMs: 700, cap: 12, batch: 1 },
  high: { intervalMs: 240, cap: 60, batch: 2 },
  max: { intervalMs: 80, cap: 800, batch: 5 },
}

/** 倍率档位：难度作用于敌人血量、攻速作用于我方冷却（÷倍率） */
export type LabMul = 1 | 3 | 10

/** 刷怪参数的统一出口。基准可临时覆写它把真实刷怪器开到档位之外——
 * 覆写的仍是同一套刷怪管线（spawnStep 读它），不是旁路注入实体 */
export interface SpawnParams {
  readonly intervalMs: number
  readonly cap: number
  readonly batch: number
}
let densityOverride: SpawnParams | undefined

export function setDensityOverride(p: SpawnParams | undefined): void {
  densityOverride = p
}

export function densityParams(): SpawnParams {
  return densityOverride ?? DENSITY_PARAMS[density]
}

let density: LabDensity = 'mid'
let difficulty: LabMul = 1
let fireRate: LabMul = 1
let invincible = true

// ── 敌人 ──────────────────────────────────────────────────
export function labEnemySet(): ReadonlySet<string> {
  return enemies
}

export function isLabEnemyOn(kind: string): boolean {
  return enemies.has(kind)
}

/** 整体设定勾选集（基准页按预设批量设置） */
export function setLabEnemies(kinds: readonly string[]): void {
  enemies.clear()
  for (const k of kinds) enemies.add(k)
}

/** 点选切换某敌人是否出场（arena 每帧实时读取，无需重启） */
export function toggleLabEnemy(kind: string): void {
  if (enemies.has(kind)) enemies.delete(kind)
  else enemies.add(kind)
}

// ── 角色 ──────────────────────────────────────────────────
export function isLabCharacterOn(id: CharacterId): boolean {
  return roster.includes(id)
}

/** 点选切换某角色是否入队（最少 1、最多测试队长编制 8；改动后由调用方 beginRun + 重启应用） */
export function toggleLabCharacter(id: CharacterId): void {
  if (roster.includes(id)) {
    if (roster.length <= 1) return // 最少 1 人
    roster = roster.filter((x) => x !== id)
  } else {
    if (roster.length >= CAPTAINS[TEST_CAPTAIN].teamSize) return // 最多 8 人
    roster = [...roster, id]
  }
}

/** 直接设定试炼场阵容（基准页按队伍规模批量设置）。改动后由调用方 beginRun + 重启应用 */
export function setLabRoster(ids: readonly CharacterId[]): void {
  roster = ids.length > 0 ? [...ids] : [...ROSTER_IDS.slice(0, 1)]
}

/** 角色等级（统一改全部；作用于建队员时的配装档位） */
export function labLevel(): LabLevel {
  return level
}

export function setLabLevel(lv: LabLevel): void {
  level = lv
}

// ── 队长（固定测试专用队长，不可更改） ─────────────────────
export function labCaptain(): CaptainId {
  return TEST_CAPTAIN
}

// ── 旋钮：密度 / 难度 / 攻速 / 无敌（arena 每帧实时读取，改动即时生效不重启）──
export function labDensity(): LabDensity {
  return density
}

export function setLabDensity(d: LabDensity): void {
  density = d
}

export function labDifficulty(): LabMul {
  return difficulty
}

export function setLabDifficulty(m: LabMul): void {
  difficulty = m
}

export function labFireRate(): LabMul {
  return fireRate
}

export function setLabFireRate(m: LabMul): void {
  fireRate = m
}

export function labInvincible(): boolean {
  return invincible
}

export function setLabInvincible(on: boolean): void {
  invincible = on
}

// ── 开局 ──────────────────────────────────────────────────
/** 进入测试模式的开局阵容：勾选角色截到测试队长编制上限（8），至少留 1 人兜底 */
export function labStarters(): CharacterId[] {
  const r = roster.slice(0, CAPTAINS[TEST_CAPTAIN].teamSize)
  return r.length > 0 ? r : [ROSTER_IDS[0]!]
}

// ── 面板开合 / 滚动位置（跨重启保留） ─────────────────────
export function isLabPanelOpen(): boolean {
  return panelOpen
}

export function setLabPanelOpen(on: boolean): void {
  panelOpen = on
}

// 控制面板滚动位置：勾选项常触发场景重启，保留位置才不会每次跳回顶部
let panelScroll = 0

export function labPanelScroll(): number {
  return panelScroll
}

export function setLabPanelScroll(v: number): void {
  panelScroll = v
}
