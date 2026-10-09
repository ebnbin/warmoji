import { MAP_ROSTER, ROSTER_IDS, TEAM } from '../../data/characters'
import { MAP_IDS, MAPS } from '../../data/maps'
import type { CharacterId } from '../../types/characters'
import type { EnemyKind } from '../../types/enemies'
import type { MapId } from '../../types/maps'
import type { StatMods } from '../../types/stats'

const enemies = new Set<EnemyKind>()
let roster: CharacterId[] = [...ROSTER_IDS.slice(0, 1)]

export type SandboxLevel = 0 | 1 | 2
let level: SandboxLevel = 0

interface SpawnParams {
  readonly intervalMs: number
  readonly cap: number
  readonly batch: number
}

type SandboxScale = 'low' | 'mid' | 'high' | 'max' | 'k2' | 'k4' | 'k8'

interface ScaleStep {
  readonly id: SandboxScale
  readonly label: string
  readonly spawn: SpawnParams
}

export const SCALES: readonly ScaleStep[] = [
  { id: 'low', label: '低', spawn: { intervalMs: 1100, cap: 6, batch: 1 } },
  { id: 'mid', label: '中', spawn: { intervalMs: 700, cap: 12, batch: 1 } },
  { id: 'high', label: '高', spawn: { intervalMs: 240, cap: 60, batch: 2 } },
  { id: 'max', label: '爆满', spawn: { intervalMs: 80, cap: 800, batch: 5 } },
  { id: 'k2', label: '2千', spawn: { intervalMs: 40, cap: 2000, batch: 12 } },
  { id: 'k4', label: '4千', spawn: { intervalMs: 25, cap: 4000, batch: 24 } },
  { id: 'k8', label: '8千', spawn: { intervalMs: 16, cap: 8000, batch: 48 } },
]

export type SandboxMul = 1 | 3 | 10

let scale: SandboxScale = 'mid'
let difficulty: SandboxMul = 1
let fireRate: SandboxMul = 1
let invincible = true

export function scaleStep(): ScaleStep {
  return SCALES.find((s) => s.id === scale) ?? SCALES[1]!
}

export function spawnParams(): SpawnParams {
  return scaleStep().spawn
}

type SandboxPresetId = 'normal' | 'busy' | 'heavy' | 'k2' | 'k4' | 'k8'

interface SandboxPreset {
  readonly id: SandboxPresetId
  readonly label: string
  readonly desc: string
  readonly team: number
  readonly level: SandboxLevel
  readonly scale: SandboxScale
  readonly difficulty: SandboxMul
  readonly fireRate: SandboxMul
}

export const SANDBOX_PRESETS: readonly SandboxPreset[] = [
  { id: 'normal', label: '正常一局', desc: '4 人基础档 · 中规模 —— 真实游戏的量级', team: 4, level: 0, scale: 'mid', difficulty: 1, fireRate: 1 },
  { id: 'busy', label: '繁忙', desc: '8 人一阶 · 高规模 · 攻速 ×3 —— 后期大混战', team: 8, level: 1, scale: 'high', difficulty: 3, fireRate: 3 },
  { id: 'heavy', label: '重载', desc: '8 人二阶 · 爆满 · 全种类 —— 数百只同场', team: 8, level: 2, scale: 'max', difficulty: 10, fireRate: 10 },
  { id: 'k2', label: '2 千', desc: '把真实刷怪器开到 2000 并发', team: 8, level: 2, scale: 'k2', difficulty: 10, fireRate: 10 },
  { id: 'k4', label: '4 千', desc: '把真实刷怪器开到 4000 并发', team: 8, level: 2, scale: 'k4', difficulty: 10, fireRate: 10 },
  { id: 'k8', label: '8 千', desc: '把真实刷怪器开到 8000 并发', team: 8, level: 2, scale: 'k8', difficulty: 10, fireRate: 10 },
]

let presetId: SandboxPresetId | undefined
let version = 0

/** 手动改了旋钮：不再算某个预设 */
function touched(): void {
  presetId = undefined
  version++
}

export function sandboxPresetId(): SandboxPresetId | undefined {
  return presetId
}

/** 预设的队伍取这张图对应的角色的前几名、敌人是这张图的全部小怪，其余旋钮照预设 */
export function applySandboxPreset(id: SandboxPresetId, map: MapId): void {
  const p = SANDBOX_PRESETS.find((x) => x.id === id)!
  setSandboxRoster(MAP_ROSTER[map].slice(0, Math.min(p.team, TEAM.maxSize)))
  setSandboxLevel(p.level)
  setSandboxEnemies(MAPS[map].foes)
  setSandboxScale(p.scale)
  setSandboxDifficulty(p.difficulty)
  setSandboxFireRate(p.fireRate)
  setSandboxInvincible(true)
  presetId = p.id
}

/** 换一套队伍与敌人：进图时抽好的结果从这里放进来 */
export function pickSandbox(ids: readonly CharacterId[], kinds: readonly EnemyKind[]): void {
  setSandboxRoster(ids)
  setSandboxEnemies(kinds)
}

export function sandboxEnemySet(): ReadonlySet<EnemyKind> {
  return enemies
}

export function isSandboxEnemyOn(kind: EnemyKind): boolean {
  return enemies.has(kind)
}

function setSandboxEnemies(kinds: readonly EnemyKind[]): void {
  enemies.clear()
  for (const k of kinds) enemies.add(k)
  touched()
}

export function toggleSandboxEnemy(kind: EnemyKind): void {
  if (enemies.has(kind)) enemies.delete(kind)
  else enemies.add(kind)
  touched()
}

export function isSandboxCharacterOn(id: CharacterId): boolean {
  return roster.includes(id)
}

export function toggleSandboxCharacter(id: CharacterId): void {
  if (roster.includes(id)) {
    if (roster.length <= 1) return
    roster = roster.filter((x) => x !== id)
  } else {
    if (roster.length >= TEAM.maxSize) return
    roster = [...roster, id]
  }
  touched()
}

function setSandboxRoster(ids: readonly CharacterId[]): void {
  roster = ids.length > 0 ? [...ids] : [...ROSTER_IDS.slice(0, 1)]
  touched()
}

export function sandboxLevel(): SandboxLevel {
  return level
}

export function setSandboxLevel(lv: SandboxLevel): void {
  level = lv
  touched()
}

export function sandboxScale(): SandboxScale {
  return scale
}

export function setSandboxScale(s: SandboxScale): void {
  scale = s
  touched()
}

export function sandboxDifficulty(): SandboxMul {
  return difficulty
}

export function setSandboxDifficulty(m: SandboxMul): void {
  difficulty = m
  touched()
}

export function sandboxFireRate(): SandboxMul {
  return fireRate
}

export function setSandboxFireRate(m: SandboxMul): void {
  fireRate = m
  touched()
}

export function sandboxInvincible(): boolean {
  return invincible
}

export function setSandboxInvincible(on: boolean): void {
  invincible = on
  touched()
}

export function sandboxStarters(): CharacterId[] {
  const r = roster.slice(0, TEAM.maxSize)
  return r.length > 0 ? r : [ROSTER_IDS[0]!]
}

/** 沙盒开局的队伍：名单、等级与无敌都看旋钮 */
export function sandboxTeam(): { readonly ids: readonly CharacterId[]; readonly level: number; readonly invincible: boolean } {
  return { ids: sandboxStarters(), level: level + 1, invincible }
}

/** 攻速旋钮给队伍的常驻修正：冷却与技能冷却都除以它 */
export function sandboxTeamMods(): StatMods[] {
  return fireRate === 1 ? [] : [{ mul: { cooldown: 1 / fireRate, skillCooldown: 1 / fireRate } }]
}

/** 旋钮的全部取值：录像开场时记下，回放时照样摆回去 */
export interface SandboxState {
  readonly enemies: readonly EnemyKind[]
  readonly roster: readonly CharacterId[]
  readonly level: SandboxLevel
  readonly scale: SandboxScale
  readonly difficulty: SandboxMul
  readonly fireRate: SandboxMul
  readonly invincible: boolean
  readonly preset: SandboxPresetId | null
}

export function sandboxState(): SandboxState {
  return { enemies: [...enemies], roster: [...roster], level, scale, difficulty, fireRate, invincible, preset: presetId ?? null }
}

export function restoreSandbox(s: SandboxState): void {
  enemies.clear()
  for (const k of s.enemies) enemies.add(k)
  roster = [...s.roster]
  level = s.level
  scale = s.scale
  difficulty = s.difficulty
  fireRate = s.fireRate
  invincible = s.invincible
  presetId = s.preset ?? undefined
  version++
}

/** 旋钮每改一次就变一次 */
export function sandboxVersion(): number {
  return version
}

applySandboxPreset(SANDBOX_PRESETS[0]!.id, MAP_IDS[0]!)
