import { CAPTAINS } from '../captains/registry'
import { ROSTER_IDS } from '../characters/registry'
import type { CharacterId } from '../characters/registry'
import type { CaptainId } from '../captains/registry'

// 试炼场 = 一张特殊地图（mapId === 'lab'）：选图即直接进入，免死无时限的沙盒，
// 敌人 / 角色 / 队长都能在场内自由切换。以下为当前勾选状态（模块级，跨场景重启保留）。

const enemies = new Set<string>()
let roster: CharacterId[] = [...ROSTER_IDS.slice(0, 3)]
let captain: CaptainId = 'angel'
let panelOpen = true

// 低速补场、维持一个小在场池——用真实冷却看敌人真实表现（区别于压测的 10× 攻速）
export const LAB = {
  spawnIntervalMs: 700,
  targetAlive: 10,
} as const

// ── 敌人 ──────────────────────────────────────────────────
export function labEnemySet(): ReadonlySet<string> {
  return enemies
}

export function isLabEnemyOn(kind: string): boolean {
  return enemies.has(kind)
}

/** 点选切换某敌人是否出场（arena 每帧实时读取，无需重启） */
export function toggleLabEnemy(kind: string): void {
  if (enemies.has(kind)) enemies.delete(kind)
  else enemies.add(kind)
}

/** 整体设定勾选集（窗口调试 API / e2e 用） */
export function setLabEnemies(kinds: readonly string[]): void {
  enemies.clear()
  for (const k of kinds) enemies.add(k)
}

// ── 角色 ──────────────────────────────────────────────────
export function isLabCharacterOn(id: CharacterId): boolean {
  return roster.includes(id)
}

/** 点选切换某角色是否入队（改动后由调用方 beginRun + 重启应用） */
export function toggleLabCharacter(id: CharacterId): void {
  roster = roster.includes(id) ? roster.filter((x) => x !== id) : [...roster, id]
}

// ── 队长 ──────────────────────────────────────────────────
export function labCaptain(): CaptainId {
  return captain
}

export function setLabCaptain(id: CaptainId): void {
  captain = id
}

// ── 开局 ──────────────────────────────────────────────────
/** 进入试炼场的开局阵容：勾选角色截到队长队伍上限，至少留 1 人兜底 */
export function labStarters(): CharacterId[] {
  const r = roster.slice(0, CAPTAINS[captain].teamSize)
  return r.length > 0 ? r : [ROSTER_IDS[0]!]
}

// ── 面板开合（跨重启保留） ─────────────────────────────────
export function isLabPanelOpen(): boolean {
  return panelOpen
}

export function setLabPanelOpen(on: boolean): void {
  panelOpen = on
}
