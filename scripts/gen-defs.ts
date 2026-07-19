import { mkdirSync, writeFileSync } from 'node:fs'
import { ABILITIES } from '../defs/abilities.ts'
import { CHARACTERS } from '../defs/characters.ts'
import { CAPTAINS } from '../defs/captains.ts'
import { ENEMIES, BOSS, ENEMY_MIX } from '../defs/enemies.ts'
import { ITEMS } from '../defs/items.ts'
import { MAPS } from '../defs/maps.ts'
import { PICKUPS } from '../defs/pickups.ts'
import type { ItemDef } from '../src/items/registry'
import type { CharacterSource } from '../src/characters/registry'

// 内容管线生成器：执行创作层（defs/）→ 校验 → 产出 src/assets/*.json。
// 校验全部在此完成（形状/数值/交叉引用/可序列化），运行时零校验直读。
// 任何一条失败即退出非零，构建中止。

const errors: string[] = []
function bad(path: string, msg: string): void {
  errors.push(`${path}: ${msg}`)
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
  'rally', 'strike', 'dance', 'buff', 'nuke',
])

/** 实现了 castNow（手动单发）的 kind——队长主动技能载荷只能用这些（与
 * src/abilities 各运行时类同步维护） */
const CASTABLE_KINDS = new Set(['rally', 'strike', 'dance', 'buff', 'nuke'])

function checkAbility(path: string, a: Record<string, unknown>): void {
  if (!ABILITY_KINDS.has(a.kind as string)) bad(path, `未知 kind：${String(a.kind)}`)
  str(`${path}.name`, a.name)
  str(`${path}.icon`, a.icon)
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
  pure(`abilities.${id}`, a)
}

// ── characters + captains ──
for (const [id, c] of Object.entries<CharacterSource>(CHARACTERS as Record<string, CharacterSource>)) {
  const p = `characters.${id}`
  str(`${p}.emoji`, c.emoji)
  str(`${p}.name`, c.name)
  if (c.abilities.length === 0) bad(p, '基础配装为空')
  if (c.upgrades.length !== 2) bad(p, '升级档位必须恰为 2')
  for (const [ti, u] of c.upgrades.entries()) {
    str(`${p}.upgrades[${ti}].name`, u.name)
    if (u.abilities.length !== c.abilities.length) bad(`${p}.upgrades[${ti}]`, '换持不得增减能力数量')
    for (const [ai, a] of u.abilities.entries()) checkRef(`${p}.upgrades[${ti}].abilities[${ai}]`, a)
  }
  for (const [ai, a] of c.abilities.entries()) checkRef(`${p}.abilities[${ai}]`, a)
  pure(p, c)
}
for (const [id, c] of Object.entries(CAPTAINS)) {
  const p = `captains.${id}`
  str(`${p}.emoji`, c.emoji)
  num(`${p}.teamSize`, c.teamSize, 1)
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
  for (const [i, fx] of (e.onDeath ?? []).entries()) {
    if (fx.kind === 'split') checkEnemy(`${path}.onDeath[${i}].into`, fx.into)
    if (fx.kind === 'poison') num(`${path}.onDeath[${i}].damage`, fx.damage, 1)
  }
}
for (const [kind, e] of Object.entries(ENEMIES)) {
  if (e.kind !== kind) bad(`enemies.${kind}`, `kind 与键不一致：${e.kind}`)
  checkEnemy(`enemies.${kind}`, e)
  pure(`enemies.${kind}`, e)
}
checkEnemy('boss', BOSS)
pure('boss', BOSS)
for (const m of ENEMY_MIX) {
  if (!(m.kind in ENEMIES)) bad(`mix.${m.kind}`, '引用了不存在的敌人 kind')
}

// ── items ──
const characterIds = new Set(Object.keys(CHARACTERS))
for (const [id, it] of Object.entries<ItemDef>(ITEMS as Record<string, ItemDef>)) {
  const p = `items.${id}`
  str(`${p}.emoji`, it.emoji)
  str(`${p}.name`, it.name)
  num(`${p}.price`, it.price, 1)
  if (it.forCharacter !== undefined && !characterIds.has(it.forCharacter)) {
    bad(p, `forCharacter 引用了不存在的角色：${it.forCharacter}`)
  }
  pure(p, it)
}

// ── maps ──
for (const [id, m] of Object.entries(MAPS)) {
  const p = `maps.${id}`
  str(`${p}.emoji`, m.emoji)
  if (!['bounded', 'infinite', 'river', 'void'].includes(m.kind)) bad(p, `未知 kind：${m.kind}`)
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

if (errors.length > 0) {
  console.error(`gen-defs 校验失败（${errors.length} 条）：`)
  for (const e of errors) console.error('  ' + e)
  process.exit(1)
}

mkdirSync('src/assets', { recursive: true })
const write = (name: string, data: unknown): void =>
  writeFileSync(`src/assets/${name}.json`, JSON.stringify(data, null, 1) + '\n')
write('abilities', ABILITIES)
write('characters', CHARACTERS)
write('captains', CAPTAINS)
write('enemies', { enemies: ENEMIES, boss: BOSS, mix: ENEMY_MIX })
write('items', ITEMS)
write('maps', MAPS)
write('pickups', PICKUPS)
console.log('gen-defs：7 张表校验通过，已生成 src/assets/*.json')
