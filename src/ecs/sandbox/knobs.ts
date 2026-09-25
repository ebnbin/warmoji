import { CAPTAINS, SANDBOX_CAPTAIN } from '../../data/captains'
import { ROSTER_IDS } from '../../data/characters'
import { ENEMY_DEFS } from '../../data/enemies'
import type { CharacterId } from '../../types/characters'
import type { CaptainId } from '../../types/captains'
import type { MapId } from '../../types/maps'
import { beginRun } from '../../run/state'
import type { RunState } from '../../run/state'

// 战斗侧只读 spawnParams / INVINCIBLE_HP / sandboxEnemySet / sandboxDifficulty / sandboxFireRate /
// sandboxInvincible / sandboxLevel，签名是对战斗侧的契约。选择状态为模块级，跨场景重启保留

const enemies = new Set<string>()
// 开局值由文件末尾的默认预设写入
let roster: CharacterId[] = [...ROSTER_IDS.slice(0, 1)]

/** 0 基础 / 1 一阶 / 2 二阶 */
export type SandboxLevel = 0 | 1 | 2
let level: SandboxLevel = 0

export const INVINCIBLE_HP = 10_000_000

export interface SpawnParams {
  readonly intervalMs: number
  readonly cap: number
  readonly batch: number
}

export type SandboxScale = 'low' | 'mid' | 'high' | 'max' | 'k2' | 'k4' | 'k8'

export interface ScaleStep {
  readonly id: SandboxScale
  readonly label: string
  readonly spawn: SpawnParams
}

/** 数值实测调出，不按公式派生：cap 涨十倍时 interval 并非等比缩小 */
export const SCALES: readonly ScaleStep[] = [
  { id: 'low', label: '低', spawn: { intervalMs: 1100, cap: 6, batch: 1 } },
  { id: 'mid', label: '中', spawn: { intervalMs: 700, cap: 12, batch: 1 } },
  { id: 'high', label: '高', spawn: { intervalMs: 240, cap: 60, batch: 2 } },
  { id: 'max', label: '爆满', spawn: { intervalMs: 80, cap: 800, batch: 5 } },
  { id: 'k2', label: '2千', spawn: { intervalMs: 40, cap: 2000, batch: 12 } },
  { id: 'k4', label: '4千', spawn: { intervalMs: 25, cap: 4000, batch: 24 } },
  { id: 'k8', label: '8千', spawn: { intervalMs: 16, cap: 8000, batch: 48 } },
]

/** 难度 × 敌人血量；攻速 ÷ 我方冷却 */
export type SandboxMul = 1 | 3 | 10

let scale: SandboxScale = 'mid'
let difficulty: SandboxMul = 1
let fireRate: SandboxMul = 1
let invincible = true

export function scaleStep(): ScaleStep {
  return SCALES.find((s) => s.id === scale) ?? SCALES[1]!
}

/** 唯一出口；战斗侧每帧现读 */
export function spawnParams(): SpawnParams {
  return scaleStep().spawn
}

// ── 强度预设 ──────────────────────────────────────────────
// 预设只写真实玩法旋钮，不旁路注入实体

export interface SandboxPreset {
  readonly id: string
  readonly label: string
  readonly desc: string
  readonly team: number
  readonly level: SandboxLevel
  readonly scale: SandboxScale
  readonly difficulty: SandboxMul
  readonly fireRate: SandboxMul
  /** 取表前 N 种 */
  readonly kinds: number
}

export const SANDBOX_PRESETS: readonly SandboxPreset[] = [
  { id: 'normal', label: '正常一局', desc: '4 人基础档 · 中规模 —— 真实游戏的量级', team: 4, level: 0, scale: 'mid', difficulty: 1, fireRate: 1, kinds: 6 },
  { id: 'busy', label: '繁忙', desc: '8 人一阶 · 高规模 · 攻速 ×3 —— 后期大混战', team: 8, level: 1, scale: 'high', difficulty: 3, fireRate: 3, kinds: 12 },
  { id: 'heavy', label: '重载', desc: '8 人二阶 · 爆满 · 全种类 —— 数百只同场', team: 8, level: 2, scale: 'max', difficulty: 10, fireRate: 10, kinds: 28 },
  { id: 'k2', label: '2 千', desc: '把真实刷怪器开到 2000 并发', team: 8, level: 2, scale: 'k2', difficulty: 10, fireRate: 10, kinds: 28 },
  { id: 'k4', label: '4 千', desc: '把真实刷怪器开到 4000 并发', team: 8, level: 2, scale: 'k4', difficulty: 10, fireRate: 10, kinds: 28 },
  { id: 'k8', label: '8 千', desc: '把真实刷怪器开到 8000 并发', team: 8, level: 2, scale: 'k8', difficulty: 10, fireRate: 10, kinds: 28 },
]

/** 只是标签，不参与判定；任一旋钮手动改过即 undefined */
let presetId: string | undefined

export function sandboxPresetId(): string | undefined {
  return presetId
}

/** 调用方随后须 beginSandboxRun + 重启战斗 */
export function applySandboxPreset(id: string): void {
  const p = SANDBOX_PRESETS.find((x) => x.id === id)
  if (!p) return
  setSandboxRoster(ROSTER_IDS.slice(0, Math.min(p.team, ROSTER_IDS.length)))
  setSandboxLevel(p.level)
  setSandboxEnemies(ENEMY_DEFS.slice(0, p.kinds).map((e) => e.kind))
  setSandboxScale(p.scale)
  setSandboxDifficulty(p.difficulty)
  setSandboxFireRate(p.fireRate)
  setSandboxInvincible(true)
  // 各 setter 会清掉 presetId，须最后写
  presetId = p.id
}

// ── 敌人 ──────────────────────────────────────────────────
export function sandboxEnemySet(): ReadonlySet<string> {
  return enemies
}

export function isSandboxEnemyOn(kind: string): boolean {
  return enemies.has(kind)
}

function setSandboxEnemies(kinds: readonly string[]): void {
  enemies.clear()
  for (const k of kinds) enemies.add(k)
  presetId = undefined
}

/** 即时生效，无需重启 */
export function toggleSandboxEnemy(kind: string): void {
  if (enemies.has(kind)) enemies.delete(kind)
  else enemies.add(kind)
  presetId = undefined
}

// ── 角色 ──────────────────────────────────────────────────
export function isSandboxCharacterOn(id: CharacterId): boolean {
  return roster.includes(id)
}

/** 改动后由调用方 beginSandboxRun + 重启应用 */
export function toggleSandboxCharacter(id: CharacterId): void {
  if (roster.includes(id)) {
    if (roster.length <= 1) return
    roster = roster.filter((x) => x !== id)
  } else {
    if (roster.length >= CAPTAINS[SANDBOX_CAPTAIN].teamSize) return
    roster = [...roster, id]
  }
  presetId = undefined
}

/** 改动后由调用方 beginSandboxRun + 重启应用 */
function setSandboxRoster(ids: readonly CharacterId[]): void {
  roster = ids.length > 0 ? [...ids] : [...ROSTER_IDS.slice(0, 1)]
  presetId = undefined
}

export function sandboxLevel(): SandboxLevel {
  return level
}

export function setSandboxLevel(lv: SandboxLevel): void {
  level = lv
  presetId = undefined
}

// ── 队长（固定沙盒专用队长，不可更改） ─────────────────────
function sandboxCaptain(): CaptainId {
  return SANDBOX_CAPTAIN
}

// ── 旋钮：规模 / 难度 / 攻速 / 无敌（战斗侧每帧实时读取，改动即时生效不重启）──
export function sandboxScale(): SandboxScale {
  return scale
}

export function setSandboxScale(s: SandboxScale): void {
  scale = s
  presetId = undefined
}

export function sandboxDifficulty(): SandboxMul {
  return difficulty
}

export function setSandboxDifficulty(m: SandboxMul): void {
  difficulty = m
  presetId = undefined
}

export function sandboxFireRate(): SandboxMul {
  return fireRate
}

export function setSandboxFireRate(m: SandboxMul): void {
  fireRate = m
  presetId = undefined
}

export function sandboxInvincible(): boolean {
  return invincible
}

export function setSandboxInvincible(on: boolean): void {
  invincible = on
  presetId = undefined
}

// ── 开局 ──────────────────────────────────────────────────
export function sandboxStarters(): CharacterId[] {
  const r = roster.slice(0, CAPTAINS[SANDBOX_CAPTAIN].teamSize)
  return r.length > 0 ? r : [ROSTER_IDS[0]!]
}

export function beginSandboxRun(mapId: MapId): RunState {
  return beginRun(sandboxCaptain(), sandboxStarters(), mapId, true)
}

// 开局默认预设
applySandboxPreset(SANDBOX_PRESETS[0]!.id)
