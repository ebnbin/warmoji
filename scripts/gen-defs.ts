import { mkdirSync, writeFileSync } from 'node:fs'
import { ABILITIES } from '../defs/abilities.ts'
import { BUDGET } from '../defs/budget.ts'
import { abilityDps } from './dps.ts'
import { CHARACTERS } from '../defs/characters.ts'
import { WEAPONS } from '../defs/weapons.ts'
import { CAPTAINS } from '../defs/captains.ts'
import { ENEMIES } from '../defs/enemies.ts'
import { ITEMS } from '../defs/items.ts'
import { MAPS } from '../defs/maps.ts'
import { PICKUPS } from '../defs/pickups.ts'
import type { ItemDef } from '../src/items/registry'

// 内容管线生成器：执行创作层（defs/）→ 校验 → 产出 src/assets/*.json。
// 校验全部在此完成（形状/数值/交叉引用/可序列化），运行时零校验直读。
// 任何一条失败即退出非零，构建中止。

const errors: string[] = []
function bad(path: string, msg: string): void {
  errors.push(`${path}: ${msg}`)
}
// 软护栏（数值预算）：越界只告警、不计入 errors、不阻断构建（见文末打印）
const warnings: string[] = []
const BUDGETS = BUDGET as Record<string, { role: string; dps: readonly [number, number] }>
/** 战斗能力生效 DPS 落在设计带宽外即提示（描述式，当前应零告警） */
function checkBudget(id: string, a: Record<string, unknown>): void {
  const b = BUDGETS[String(a.kind)]
  if (!b) return
  const d = abilityDps(a)
  if (d < b.dps[0] || d > b.dps[1]) {
    warnings.push(`abilities.${id}（${String(a.kind)}）生效 DPS ${d.toFixed(1)} 越界 [${b.dps[0]},${b.dps[1]}]：${b.role}`)
  }
}
function num(path: string, v: unknown, min = 0): void {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min) bad(path, `需为 ≥${min} 的有限数，得到 ${String(v)}`)
}
function str(path: string, v: unknown): void {
  if (typeof v !== 'string' || v.length === 0) bad(path, '需为非空字符串')
}

/** 纯静态性：JSON 往返后深度相等（函数/undefined/类实例在此现形） */
function pure(path: string, v: unknown): void {
  const roundtrip: unknown = JSON.parse(JSON.stringify(v))
  if (JSON.stringify(roundtrip) !== JSON.stringify(v)) bad(path, '含不可序列化内容')
}

const ABILITY_KINDS = new Set([
  'projectile', 'thrust', 'sweep', 'areaBlast', 'boomerang', 'laser',
  'slowAura', 'assassinate', 'turret', 'summon', 'heal', 'chainArc',
  'rally', 'strike', 'dance', 'buff', 'nuke', 'timeStop',
])

/** 实现了 castNow（手动单发）的 kind——队长主动技能载荷只能用这些（与
 * src/abilities 各运行时类同步维护） */
const CASTABLE_KINDS = new Set(['rally', 'strike', 'dance', 'buff', 'nuke', 'timeStop'])

/** onHit 命中效果的合法 kind（与 src/abilities/effects.ts 的 applyEffects 分支同步） */
const EFFECT_KINDS = new Set(['blast', 'slow', 'ground', 'morph'])

/** 命中效果链校验：kind 合法 + 数值字段成形 */
function checkEffects(path: string, effects: unknown): void {
  if (!Array.isArray(effects)) {
    bad(`${path}.onHit`, '需为数组')
    return
  }
  for (const [i, raw] of (effects as unknown[]).entries()) {
    const ep = `${path}.onHit[${i}]`
    const e = raw as Record<string, unknown>
    if (!EFFECT_KINDS.has(e.kind as string)) {
      bad(ep, `未知 effect kind：${String(e.kind)}`)
      continue
    }
    if (e.kind === 'blast') {
      num(`${ep}.radius`, e.radius, 0.01)
      num(`${ep}.ratio`, e.ratio, 0)
      num(`${ep}.knockback`, e.knockback)
    } else if (e.kind === 'slow') {
      num(`${ep}.factor`, e.factor, 0)
      num(`${ep}.durationMs`, e.durationMs, 0)
    } else if (e.kind === 'ground') {
      const g = e.def as Record<string, unknown> | undefined
      num(`${ep}.def.radius`, g?.radius, 0.01)
      num(`${ep}.def.damage`, g?.damage, 1)
      num(`${ep}.def.durationMs`, g?.durationMs, 1)
      num(`${ep}.def.tickMs`, g?.tickMs, 1)
    } else if (e.kind === 'morph') {
      num(`${ep}.durationMs`, e.durationMs, 1)
      str(`${ep}.morphEmoji`, e.morphEmoji)
    }
  }
}

function checkAbility(path: string, a: Record<string, unknown>): void {
  if (!ABILITY_KINDS.has(a.kind as string)) bad(path, `未知 kind：${String(a.kind)}`)
  if (a.onHit !== undefined) checkEffects(path, a.onHit)
}

const abilityIds = new Set(Object.keys(ABILITIES))
/** 能力 id 引用校验：持有方（角色配装/升级/队长技能）引的 id 必须在能力表中 */
function checkRef(path: string, id: unknown): boolean {
  if (typeof id !== 'string' || !abilityIds.has(id)) {
    bad(path, `引用了不存在的能力：${String(id)}`)
    return false
  }
  return true
}

// ── abilities ──
for (const [id, a] of Object.entries(ABILITIES)) {
  checkAbility(`abilities.${id}`, a as unknown as Record<string, unknown>)
  checkBudget(id, a as unknown as Record<string, unknown>)
  pure(`abilities.${id}`, a)
}

// ── weapons（实体载体：base + 各升级档，能力以 id 引用）──
function checkTier(path: string, t: { ability: unknown; card: { icon: unknown; name: unknown; desc: unknown } }): void {
  checkRef(`${path}.ability`, t.ability)
  str(`${path}.card.icon`, t.card.icon)
  str(`${path}.card.name`, t.card.name)
  str(`${path}.card.desc`, t.card.desc)
}
for (const [id, w] of Object.entries(WEAPONS)) {
  const p = `weapons.${id}`
  str(`${p}.name`, w.name)
  str(`${p}.emoji`, w.emoji)
  checkRef(`${p}.base`, w.base)
  for (const [ti, t] of w.upgrades.entries()) checkTier(`${p}.upgrades[${ti}]`, t)
  pure(p, w)
}

// ── characters（载体形态；gen 展平回 abilities/upgrades 写 characters.json）+ captains ──
const weaponReg = WEAPONS as Record<string, { upgrades: readonly { card: { name: string } }[] }>
function cardsAtTier(c: { weapons: readonly string[]; innate: readonly { upgrades: readonly { card: { name: string } }[] }[] }, k: number): { name: string }[] {
  const cards: { name: string }[] = []
  for (const wid of c.weapons) {
    const u = weaponReg[wid]?.upgrades[k]
    if (u) cards.push(u.card)
  }
  for (const inn of c.innate) {
    const u = inn.upgrades[k]
    if (u) cards.push(u.card)
  }
  return cards
}
for (const [id, c] of Object.entries(CHARACTERS)) {
  const p = `characters.${id}`
  str(`${p}.emoji`, c.emoji)
  str(`${p}.name`, c.name)
  str(`${p}.desc`, c.desc)
  if (c.weapons.length + c.innate.length === 0) bad(p, '无任何攻击来源（weapons/innate 皆空）')
  for (const [wi, wid] of c.weapons.entries()) {
    if (!(wid in WEAPONS)) bad(`${p}.weapons[${wi}]`, `引用了不存在的武器：${String(wid)}`)
  }
  for (const [ii, inn] of c.innate.entries()) {
    const ip = `${p}.innate[${ii}]`
    str(`${ip}.name`, inn.name)
    str(`${ip}.icon`, inn.icon)
    checkRef(`${ip}.base`, inn.base)
    for (const [ti, t] of inn.upgrades.entries()) checkTier(`${ip}.upgrades[${ti}]`, t)
  }
  // 每档必须可达（至少一个载体在该档有升级）且多载体同档卡文案一致（展平去重要求）
  for (const k of [0, 1]) {
    const cards = cardsAtTier(c, k)
    if (cards.length === 0) bad(p, `缺第 ${k + 1} 档升级卡`)
    else if (new Set(cards.map((cd) => cd.name)).size > 1) bad(p, `第 ${k + 1} 档多载体升级卡文案不一致`)
  }
  pure(p, c)
}
for (const [id, c] of Object.entries(CAPTAINS)) {
  const p = `captains.${id}`
  str(`${p}.emoji`, c.emoji)
  num(`${p}.teamSize`, c.teamSize, 1)
  num(`${p}.moveSpeed`, c.moveSpeed, 0.01)
  num(`${p}.coinMagnet`, c.coinMagnet, 0.01)
  num(`${p}.hpMul`, c.hpMul, 0.01)
  num(`${p}.reviveMul`, c.reviveMul, 0.01)
  num(`${p}.skill.cdMs`, c.skill.cdMs, 1)
  if ((c.skill.abilities as readonly unknown[]).length === 0) bad(`${p}.skill`, '主动技能缺效果载荷行')
  for (const [ai, a] of c.skill.abilities.entries()) {
    const ap = `${p}.skill.abilities[${ai}]`
    if (checkRef(ap, a)) {
      const kind = (ABILITIES as Record<string, { kind: string }>)[a]!.kind
      if (!CASTABLE_KINDS.has(kind)) bad(ap, `kind ${kind} 未实现 castNow，不能作主动技能载荷`)
    }
  }
  pure(p, c)
}

// ── enemies ──
function checkEnemy(path: string, e: (typeof ENEMIES)[string]): void {
  str(`${path}.emoji`, e.emoji)
  str(`${path}.name`, e.name)
  num(`${path}.hp`, e.hp, 1)
  num(`${path}.speed`, e.speed)
  num(`${path}.radius`, e.radius)
  for (const [i, a] of (e.abilities ?? []).entries()) checkAbility(`${path}.abilities[${i}]`, a as unknown as Record<string, unknown>)
  for (const [i, fx] of (e.onContact ?? []).entries()) {
    const cp = `${path}.onContact[${i}]`
    if (fx.kind === 'attackSlow') {
      num(`${cp}.mul`, fx.mul, 0.01)
      num(`${cp}.durationMs`, fx.durationMs, 1)
    } else if (fx.kind !== 'damage') {
      bad(cp, `未知 onContact kind：${String((fx as { kind?: unknown }).kind)}`)
    }
  }
  if (e.spawner) {
    checkEnemy(`${path}.spawner.into`, e.spawner.into)
    num(`${path}.spawner.intervalMs`, e.spawner.intervalMs, 1)
    num(`${path}.spawner.count`, e.spawner.count, 1)
    num(`${path}.spawner.maxAlive`, e.spawner.maxAlive, 1)
  }
  // 亡语（onDeath）：组合式 Effect（ground/heal/spawnProjectile）+ 生成实体类（split/decoy）。
  // 命中专属的 blast/slow/morph 不允许作亡语（无 baseDamage/targets），落到 else 报错。
  for (const [i, fx] of (e.onDeath ?? []).entries()) {
    const dp = `${path}.onDeath[${i}]`
    if (fx.kind === 'split') {
      checkEnemy(`${dp}.into`, fx.into)
      num(`${dp}.count`, fx.count, 1)
    } else if (fx.kind === 'decoy') {
      num(`${dp}.hp`, fx.hp, 1)
      num(`${dp}.durationMs`, fx.durationMs, 1)
      num(`${dp}.alpha`, fx.alpha, 0)
    } else if (fx.kind === 'ground') {
      num(`${dp}.def.radius`, fx.def.radius, 0.01)
      num(`${dp}.def.damage`, fx.def.damage, 1)
      num(`${dp}.def.durationMs`, fx.def.durationMs, 1)
      num(`${dp}.def.tickMs`, fx.def.tickMs, 1)
    } else if (fx.kind === 'heal') {
      num(`${dp}.range`, fx.range, 0.01)
      num(`${dp}.amount`, fx.amount, 1)
    } else if (fx.kind === 'spawnProjectile') {
      str(`${dp}.projectile.emoji`, fx.projectile.emoji)
      num(`${dp}.projectile.size`, fx.projectile.size, 0.01)
      num(`${dp}.projectile.radius`, fx.projectile.radius, 0.01)
      num(`${dp}.projectile.speed`, fx.projectile.speed, 0.01)
      num(`${dp}.damage`, fx.damage, 1)
      num(`${dp}.lifeMs`, fx.lifeMs, 1)
    } else {
      bad(dp, `不允许作亡语的 effect kind：${String(fx.kind)}`)
    }
  }
}
for (const [kind, e] of Object.entries(ENEMIES)) {
  if (e.kind !== kind) bad(`enemies.${kind}`, `kind 与键不一致：${e.kind}`)
  checkEnemy(`enemies.${kind}`, e)
  pure(`enemies.${kind}`, e)
}
// ── items ──
for (const [id, it] of Object.entries<ItemDef>(ITEMS as Record<string, ItemDef>)) {
  const p = `items.${id}`
  str(`${p}.emoji`, it.emoji)
  str(`${p}.name`, it.name)
  num(`${p}.price`, it.price, 1)
  num(`${p}.upgradeXp`, it.upgradeXp, 1)
  pure(p, it)
}

// ── maps ──
for (const [id, m] of Object.entries(MAPS)) {
  const p = `maps.${id}`
  str(`${p}.emoji`, m.emoji)
  if (!['bounded', 'infinite', 'river', 'void', 'ruins'].includes(m.kind)) bad(p, `未知 kind：${m.kind}`)
  for (const mx of m.mix) {
    if (!(mx.kind in ENEMIES)) bad(`${p}.mix`, `引用了不存在的敌人 kind：${mx.kind}`)
    else if (ENEMIES[mx.kind]?.role === 'boss') bad(`${p}.mix`, `mix 里不能出现 Boss：${mx.kind}`)
  }
  if (!(m.boss in ENEMIES)) bad(`${p}.boss`, `引用了不存在的敌人 kind：${m.boss}`)
  else if (ENEMIES[m.boss]?.role !== 'boss') bad(`${p}.boss`, `boss 必须指向 role:'boss' 的条目：${m.boss}`)
  pure(p, m)
}

// ── pickups ──
for (const [id, pk] of Object.entries(PICKUPS)) {
  const p = `pickups.${id}`
  str(`${p}.emoji`, pk.emoji)
  num(`${p}.size`, pk.size, 0.01)
  num(`${p}.radius`, pk.radius, 0.01)
  pure(p, pk)
}

if (warnings.length > 0) {
  console.warn(`数值软护栏：${warnings.length} 条能力生效 DPS 越界（仅提示，不阻断）：`)
  for (const wn of warnings) console.warn('  ⚠ ' + wn)
}

if (errors.length > 0) {
  console.error(`gen-defs 校验失败（${errors.length} 条）：`)
  for (const e of errors) console.error('  ' + e)
  process.exit(1)
}

mkdirSync('src/assets', { recursive: true })
const write = (name: string, data: unknown): void =>
  writeFileSync(`src/assets/${name}.json`, JSON.stringify(data, null, 1) + '\n')
write('abilities', ABILITIES)
write('weapons', WEAPONS)
write('characters', CHARACTERS)
write('captains', CAPTAINS)
write('enemies', { enemies: ENEMIES })
write('items', ITEMS)
write('maps', MAPS)
write('pickups', PICKUPS)
console.log('gen-defs：8 张表校验通过，已生成 src/assets/*.json')
