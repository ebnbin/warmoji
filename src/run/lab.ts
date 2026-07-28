import { CAPTAINS, TEST_CAPTAIN } from '../data/captains'
import { ROSTER_IDS } from '../data/characters'
import { ENEMY_DEFS } from '../data/enemies'
import type { CharacterId } from '../types/characters'
import type { CaptainId } from '../types/captains'

// 试炼场（地图页进入，run.testMode = true）：免死无时限的沙盒，
// 敌人 / 角色 + 规模 / 难度 / 攻速 / 无敌 都能在场内自由切换。
// 队长固定为测试专用队长（编制 8、无限金币、永远满豆、无增益），不可更改。
// 以下为当前选择状态（模块级，跨场景重启保留）。
//
// 战斗侧（两套实现）只读这里的 7 个符号：densityParams / INVINCIBLE_HP /
// labEnemySet / labDifficulty / labFireRate / labInvincible / labLevel。
// 它们的签名是**对战斗侧的契约**：试炼场的形态怎么变，都不该让任何一套战斗跟着改一行。

const enemies = new Set<string>()
// 最少 1 人、最多 = 测试队长编制（8）；开局值由文件末尾的默认预设写入
let roster: CharacterId[] = [...ROSTER_IDS.slice(0, 1)]

/** 角色等级：统一作用于全部角色的升级档（0 基础 / 1 一阶 / 2 二阶，对应升级卡 u1/u2） */
export type LabLevel = 0 | 1 | 2
let level: LabLevel = 0

// 无敌血量（够高即事实上打不死）
export const INVINCIBLE_HP = 10_000_000

/** 刷怪参数：出怪间隔 / 在场上限 / 每批数量 */
export interface SpawnParams {
  readonly intervalMs: number
  readonly cap: number
  readonly batch: number
}

/** 规模档位 id */
export type LabScale = 'low' | 'mid' | 'high' | 'max' | 'k2' | 'k4' | 'k8'

export interface ScaleStep {
  readonly id: LabScale
  readonly label: string
  readonly spawn: SpawnParams
}

/** 规模阶梯：从「正常一局」一路到「满屏几千只」。
 *
 * 早先这是**两张表**：试炼场自己的 4 档（低/中/高/爆满），与性能基准的 6 个强度档位；
 * 后者够不到 4 档之外，于是加了个 setDensityOverride 旁路把参数直接顶进来。
 * 两张表各写各的，「爆满」与基准的「重载」是同一组数字抄了两遍——两份拷贝必然漂移。
 * 现在合成这一条阶梯：面板直接选得到 8 千，旁路整个删掉，
 * **刷怪参数永远只有 densityParams() 这一个出口**。
 *
 * 数值是实测调出来的，不按公式派生：cap 涨十倍时 interval 并非等比缩小
 *（补到满的爬坡时间要留在同一量级），派生公式会悄悄改掉已经测过的行为。 */
export const SCALES: readonly ScaleStep[] = [
  { id: 'low', label: '低', spawn: { intervalMs: 1100, cap: 6, batch: 1 } },
  { id: 'mid', label: '中', spawn: { intervalMs: 700, cap: 12, batch: 1 } },
  { id: 'high', label: '高', spawn: { intervalMs: 240, cap: 60, batch: 2 } },
  { id: 'max', label: '爆满', spawn: { intervalMs: 80, cap: 800, batch: 5 } },
  { id: 'k2', label: '2千', spawn: { intervalMs: 40, cap: 2000, batch: 12 } },
  { id: 'k4', label: '4千', spawn: { intervalMs: 25, cap: 4000, batch: 24 } },
  { id: 'k8', label: '8千', spawn: { intervalMs: 16, cap: 8000, batch: 48 } },
]

/** 倍率档位：难度作用于敌人血量、攻速作用于我方冷却（÷倍率） */
export type LabMul = 1 | 3 | 10

let scale: LabScale = 'mid'
let difficulty: LabMul = 1
let fireRate: LabMul = 1
let invincible = true

/** 当前规模档位（面板显示明细用） */
export function scaleStep(): ScaleStep {
  return SCALES.find((s) => s.id === scale) ?? SCALES[1]!
}

/** 刷怪参数的统一出口（战斗侧每帧现读，改档即时生效）。
 * 名字保留 density 是对战斗侧的契约，不随面板措辞改动 */
export function densityParams(): SpawnParams {
  return scaleStep().spawn
}

// ── 强度预设 ──────────────────────────────────────────────
//
// 一个预设 = 一组旋钮的具名取值，点一下批量写进去。它**不是**另一套机制：
// 写的就是下面那些 setter，跑的就是同一局试炼场。
//
// 关键前提：**这里跑的是真实战斗，不是往场上倒实体**。旁路注入一批惰性实体
// 测出来的数字没有意义——真实战场里最贵的恰恰是注入绕不过去的东西：索敌与转向、
// 碰撞检测与解算、伤害/击退/暴击结算、状态效果、死亡与掉落、能力冷却与开火。
// 因此预设调的全是**真实玩法旋钮**，实体数量是被观测的结果而非输入。

export interface LabPreset {
  readonly id: string
  readonly label: string
  readonly desc: string
  /** 队伍人数（真实角色，能力自动索敌开火） */
  readonly team: number
  /** 角色等级：换整套能力形态，高阶弹幕更密 */
  readonly level: LabLevel
  /** 规模档位：真实 spawnStep 读它 */
  readonly scale: LabScale
  /** 敌人血量倍率：活得越久堆积越多 */
  readonly difficulty: LabMul
  /** 我方攻速倍率：冷却 ÷ 它，直接决定弹幕密度与命中结算频率 */
  readonly fireRate: LabMul
  /** 参战敌人种类数（取表前 N 种；种类越多分支越杂） */
  readonly kinds: number
}

export const LAB_PRESETS: readonly LabPreset[] = [
  { id: 'normal', label: '正常一局', desc: '4 人基础档 · 中规模 —— 真实游戏的量级', team: 4, level: 0, scale: 'mid', difficulty: 1, fireRate: 1, kinds: 6 },
  { id: 'busy', label: '繁忙', desc: '8 人一阶 · 高规模 · 攻速 ×3 —— 后期大混战', team: 8, level: 1, scale: 'high', difficulty: 3, fireRate: 3, kinds: 12 },
  { id: 'heavy', label: '重载', desc: '8 人二阶 · 爆满 · 全种类 —— 数百只同场', team: 8, level: 2, scale: 'max', difficulty: 10, fireRate: 10, kinds: 28 },
  { id: 'k2', label: '2 千', desc: '把真实刷怪器开到 2000 并发', team: 8, level: 2, scale: 'k2', difficulty: 10, fireRate: 10, kinds: 28 },
  { id: 'k4', label: '4 千', desc: '4000 并发 —— 预期两侧都开始跪', team: 8, level: 2, scale: 'k4', difficulty: 10, fireRate: 10, kinds: 28 },
  { id: 'k8', label: '8 千', desc: '8000 并发 —— 看谁跪得晚', team: 8, level: 2, scale: 'k8', difficulty: 10, fireRate: 10, kinds: 28 },
]

/** 当前预设 id；任一旋钮被手动改过即为 undefined（面板显示「自定义」）。
 * 只是个标签，不参与任何判定——真相永远是各个旋钮自己的值 */
let presetId: string | undefined

export function labPresetId(): string | undefined {
  return presetId
}

/** 套用预设：批量写旋钮。调用方随后 beginRun + 重启战斗即跑在这个强度上 */
export function applyLabPreset(id: string): void {
  const p = LAB_PRESETS.find((x) => x.id === id)
  if (!p) return
  setLabRoster(ROSTER_IDS.slice(0, Math.min(p.team, ROSTER_IDS.length)))
  setLabLevel(p.level)
  setLabEnemies(ENEMY_DEFS.slice(0, p.kinds).map((e) => e.kind))
  setLabScale(p.scale)
  setLabDifficulty(p.difficulty)
  setLabFireRate(p.fireRate)
  setLabInvincible(true) // 免死：否则重载下队伍几秒就没，测不到稳态
  // 各 setter 会把标签清成「自定义」，故最后才盖上 id
  presetId = p.id
}

// ── 敌人 ──────────────────────────────────────────────────
export function labEnemySet(): ReadonlySet<string> {
  return enemies
}

export function isLabEnemyOn(kind: string): boolean {
  return enemies.has(kind)
}

/** 整体设定勾选集（预设批量设置） */
export function setLabEnemies(kinds: readonly string[]): void {
  enemies.clear()
  for (const k of kinds) enemies.add(k)
  presetId = undefined
}

/** 点选切换某敌人是否出场（战斗侧每帧实时读取，无需重启） */
export function toggleLabEnemy(kind: string): void {
  if (enemies.has(kind)) enemies.delete(kind)
  else enemies.add(kind)
  presetId = undefined
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
  presetId = undefined
}

/** 直接设定试炼场阵容（预设按队伍规模批量设置）。改动后由调用方 beginRun + 重启应用 */
export function setLabRoster(ids: readonly CharacterId[]): void {
  roster = ids.length > 0 ? [...ids] : [...ROSTER_IDS.slice(0, 1)]
  presetId = undefined
}

/** 角色等级（统一改全部；作用于建队员时的配装档位） */
export function labLevel(): LabLevel {
  return level
}

export function setLabLevel(lv: LabLevel): void {
  level = lv
  presetId = undefined
}

// ── 队长（固定测试专用队长，不可更改） ─────────────────────
export function labCaptain(): CaptainId {
  return TEST_CAPTAIN
}

// ── 旋钮：规模 / 难度 / 攻速 / 无敌（战斗侧每帧实时读取，改动即时生效不重启）──
export function labScale(): LabScale {
  return scale
}

export function setLabScale(s: LabScale): void {
  scale = s
  presetId = undefined
}

export function labDifficulty(): LabMul {
  return difficulty
}

export function setLabDifficulty(m: LabMul): void {
  difficulty = m
  presetId = undefined
}

export function labFireRate(): LabMul {
  return fireRate
}

export function setLabFireRate(m: LabMul): void {
  fireRate = m
  presetId = undefined
}

export function labInvincible(): boolean {
  return invincible
}

export function setLabInvincible(on: boolean): void {
  invincible = on
  presetId = undefined
}

// ── 开局 ──────────────────────────────────────────────────
/** 进入试炼场的开局阵容：勾选角色截到测试队长编制上限（8），至少留 1 人兜底 */
export function labStarters(): CharacterId[] {
  const r = roster.slice(0, CAPTAINS[TEST_CAPTAIN].teamSize)
  return r.length > 0 ? r : [ROSTER_IDS[0]!]
}

// 开局默认套一档预设：敌人勾选集若为空，进了沙盒一只怪都不会出——
// 「打开就是一片死寂」不是一个合理的初始状态
applyLabPreset(LAB_PRESETS[0]!.id)
