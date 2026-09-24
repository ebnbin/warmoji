import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { ABILITIES } from '../defs/abilities.ts'
import { BUDGET } from '../defs/budget.ts'
import { abilityDps } from './dps.ts'
import { CHARACTERS } from '../defs/characters.ts'
import { WEAPONS } from '../defs/weapons.ts'
import { CAPTAINS } from '../defs/captains.ts'
import { ENEMIES } from '../defs/enemies.ts'
import { ITEMS } from '../defs/items.ts'
import { CARDS } from '../defs/cards.ts'
import { BATTLEFIELD } from '../defs/battlefield.ts'
import { SFX } from '../defs/sfx.ts'
import { TIMESTOP } from '../defs/timestop.ts'
import { MAP_DEFAULTS } from '../defs/mapdefaults.ts'
import { LEVEL_STATS } from '../defs/levels.ts'
import { MAPS } from '../defs/maps.ts'
import { PICKUPS } from '../defs/pickups.ts'
import { PROGRESSION } from '../defs/progression.ts'
import { DIFFICULTY } from '../defs/difficulty.ts'
import { AI } from '../defs/ai.ts'
import { TEAM_BASELINE } from '../defs/team.ts'
import { COMBAT } from '../defs/combat.ts'
import { FEEL } from '../defs/feel.ts'
import { ECONOMY } from '../defs/economy.ts'
import type { ItemDef } from '../src/types/items'
import type { Economy } from '../src/types/items'
import type { CardDef } from '../src/types/cards'
import type { BattlefieldTuning } from '../src/types/battlefield'
import type { SfxDef } from '../src/types/sfx'
import type { TimeStopTuning } from '../src/types/timeStop'
import type { MapDefaults } from '../src/types/maps'
import type { Progression } from '../src/types/waves'
import type { Difficulty } from '../src/types/enemies'
import type { TeamBaseline } from '../src/types/characters'
import type { CombatTuning } from '../src/types/abilities'
import type { FeelTuning } from '../src/types/feel'
import type { AiTuning } from '../src/types/enemies'
import type { MapDef } from '../src/types/maps'

// 校验全部在此完成，运行时零校验直读；任一失败即退出非零

const errors: string[] = []
function bad(path: string, msg: string): void {
  errors.push(`${path}: ${msg}`)
}
// 越界只告警，不阻断构建
const warnings: string[] = []
const BUDGETS = BUDGET as Record<string, { role: string; dps: readonly [number, number] }>
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

function pure(path: string, v: unknown): void {
  const roundtrip: unknown = JSON.parse(JSON.stringify(v))
  if (JSON.stringify(roundtrip) !== JSON.stringify(v)) bad(path, '含不可序列化内容')
}

const ABILITY_KINDS = new Set([
  'projectile', 'thrust', 'sweep', 'areaBlast', 'boomerang', 'laser',
  'slowAura', 'assassinate', 'turret', 'summon', 'heal', 'chainArc',
  'rally', 'strike', 'dance', 'buff', 'nuke', 'timeStop',
])

/** 队长主动技能可用的 kind，须被 src/ecs/systems/pipeline/abilities.ts 的 MANUAL_CASTS 覆盖 */
const CASTABLE_KINDS = new Set(['rally', 'strike', 'dance', 'buff', 'nuke', 'timeStop'])

/** 须与 CardTag 同步 */
const CARD_TAGS = new Set([
  'economy', 'tempo', 'offense', 'defense', 'meta', 'skill', 'loot', 'trade', 'curse',
])

/** 须与 BattleEffects 的键同步 */
const BATTLE_EFFECT_KEYS = new Set([
  'moveSpeedMul', 'teamDamageMul', 'teamCooldownMul', 'critAdd', 'enemySlowMul',
])

/** 须与 CharacterEffects 的键同步 */
const CHARACTER_EFFECT_KEYS = new Set([
  'hpAdd', 'damageMul', 'cooldownMul', 'rangeMul', 'projSpeedMul', 'iframesAddMs',
  'reviveAddMs', 'regenPerSec', 'thorns', 'killHeal', 'critChance', 'knockbackMul',
])

/** 须与 TeamEffects 的键同步 */
const TEAM_EFFECT_KEYS = new Set([
  'moveSpeedMul', 'magnetMul', 'doubleCoinChance', 'teamDamageMul', 'xpGainMul',
  'enemySlowMul', 'waveHealRatio', 'waveCoins', 'teamCooldownMul', 'critAdd',
  'teamHpMul', 'reviveMul', 'skillCdMul', 'shopDiscountMul', 'freeRerolls', 'draftSize',
])

/** 须被 src/ecs/systems/shared/effects.ts 的 EFFECT_KINDS 覆盖 */
const EFFECT_KINDS = new Set(['blast', 'slow', 'poison', 'ground', 'morph'])

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
    } else if (e.kind === 'poison') {
      num(`${ep}.damage`, e.damage, 1)
      num(`${ep}.tickMs`, e.tickMs, 1)
      num(`${ep}.durationMs`, e.durationMs, 1)
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
  if (a.kind === 'projectile' || a.kind === 'turret') num(`${path}.lifeMs`, a.lifeMs, 1)
  if (a.onHit !== undefined) checkEffects(path, a.onHit)
}

const abilityIds = new Set(Object.keys(ABILITIES))
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

// ── weapons ──
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

// ── characters + captains ──
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
      if (!CASTABLE_KINDS.has(kind)) bad(ap, `kind ${kind} 不能手动施放，不能作主动技能载荷`)
    }
  }
  pure(p, c)
}

// ── levels ──
{
  const ls = LEVEL_STATS as Record<string, readonly Partial<Record<string, unknown>>[]>
  const charIds = new Set(Object.keys(CHARACTERS))
  for (const id of Object.keys(ls)) {
    if (!charIds.has(id)) bad(`levels.${id}`, `未知角色：${id}`)
  }
  for (const id of charIds) {
    const p = `levels.${id}`
    const tiers = ls[id]
    if (!Array.isArray(tiers) || tiers.length !== 2) {
      bad(p, '需为恰好 2 档（2/3 级形态）')
      continue
    }
    tiers.forEach((tier, k) => {
      const tp = `${p}[${k}]`
      const keys = Object.keys(tier)
      if (keys.length === 0) bad(tp, '等级形态片段不能为空')
      for (const key of keys) {
        if (!CHARACTER_EFFECT_KEYS.has(key)) bad(tp, `未知效果轴：${key}`)
        else num(`${tp}.${key}`, tier[key], Number.NEGATIVE_INFINITY)
      }
    })
    pure(p, tiers)
  }
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
    } else {
      bad(cp, `未知 onContact kind：${String((fx as { kind?: unknown }).kind)}（伤害写在 damage 字段，不写进 onContact）`)
    }
  }
  if (e.spawner) {
    checkEnemy(`${path}.spawner.into`, e.spawner.into)
    num(`${path}.spawner.intervalMs`, e.spawner.intervalMs, 1)
    num(`${path}.spawner.count`, e.spawner.count, 1)
    num(`${path}.spawner.maxAlive`, e.spawner.maxAlive, 1)
  }
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

// ── cards ──
for (const [id, c] of Object.entries<CardDef>(CARDS as Record<string, CardDef>)) {
  const p = `cards.${id}`
  str(`${p}.emoji`, c.emoji)
  str(`${p}.name`, c.name)
  str(`${p}.desc`, c.desc)
  if (!['common', 'rare', 'epic'].includes(c.rarity)) bad(`${p}.rarity`, `未知稀有度：${c.rarity}`)
  num(`${p}.maxLevel`, c.maxLevel, 1)
  if (!Array.isArray(c.tags) || c.tags.length === 0) bad(`${p}.tags`, '需为非空数组')
  else for (const t of c.tags) if (!CARD_TAGS.has(t)) bad(`${p}.tags`, `未知标签：${t}`)
  const eff = c.effects as Record<string, unknown>
  const keys = Object.keys(eff)
  if (keys.length === 0) bad(`${p}.effects`, '至少要有一个效果轴')
  for (const k of keys) {
    if (!TEAM_EFFECT_KEYS.has(k)) bad(`${p}.effects`, `未知效果轴：${k}`)
    else num(`${p}.effects.${k}`, eff[k], Number.NEGATIVE_INFINITY)
  }
  pure(p, c)
}

// ── battlefield ──
{
  const bf: BattlefieldTuning = BATTLEFIELD
  const seenIds = new Set<string>()
  for (const mapId of Object.keys(MAPS)) {
    const pool = bf.pools[mapId as keyof typeof bf.pools]
    const pp = `battlefield.pools.${mapId}`
    if (!Array.isArray(pool) || pool.length === 0) {
      bad(pp, '每图需有非空拾取池')
      continue
    }
    let buffs = 0
    let debuffs = 0
    for (const d of pool) {
      const dp = `${pp}.${d.id}`
      if (seenIds.has(d.id)) bad(dp, `拾取 id 重复：${d.id}`)
      seenIds.add(d.id)
      str(`${dp}.emoji`, d.emoji)
      str(`${dp}.name`, d.name)
      str(`${dp}.desc`, d.desc)
      if (d.polarity !== 'buff' && d.polarity !== 'debuff') bad(`${dp}.polarity`, `未知极性：${d.polarity}`)
      else if (d.polarity === 'buff') buffs++
      else debuffs++
      num(`${dp}.durationMs`, d.durationMs, 1)
      const fx = d.fx as Record<string, unknown>
      const keys = Object.keys(fx)
      if (keys.length === 0) bad(`${dp}.fx`, '至少要有一个效果轴')
      for (const k of keys) {
        if (!BATTLE_EFFECT_KEYS.has(k)) bad(`${dp}.fx`, `未知效果轴：${k}`)
        else num(`${dp}.fx.${k}`, fx[k], Number.NEGATIVE_INFINITY)
      }
    }
    if (buffs === 0 || debuffs === 0) bad(pp, `每图至少 1 增益 + 1 减益（现 ${buffs} 增 ${debuffs} 减）`)
  }
  num('battlefield.field.grabRadiusU', bf.field.grabRadiusU, 0.01)
  num('battlefield.field.groundMs', bf.field.groundMs, 1)
  num('battlefield.field.auraRadiusU', bf.field.auraRadiusU, 0.01)
  const cb = bf.carrierBudget
  num('battlefield.carrierBudget.boss.buff', cb.boss.buff, 0)
  num('battlefield.carrierBudget.boss.debuff', cb.boss.debuff, 0)
  num('battlefield.carrierBudget.fallback.buff', cb.fallback.buff, 0)
  num('battlefield.carrierBudget.fallback.debuff', cb.fallback.debuff, 0)
  if (!Array.isArray(cb.waveTiers) || cb.waveTiers.length === 0) {
    bad('battlefield.carrierBudget.waveTiers', '需为非空数组')
  } else {
    let prev = 0
    cb.waveTiers.forEach((t, i) => {
      const tp = `battlefield.carrierBudget.waveTiers[${i}]`
      num(`${tp}.upToWave`, t.upToWave, 1)
      if (t.upToWave <= prev) bad(`${tp}.upToWave`, `分档需按波次严格递增（前档 ${prev}）`)
      prev = t.upToWave
      num(`${tp}.buff`, t.buff, 0)
      num(`${tp}.debuff`, t.debuff, 0)
    })
  }
  pure('battlefield', bf)
}

// ── sfx ──
{
  const waves = new Set(['square', 'sawtooth', 'triangle', 'sine', 'noise'])
  for (const [id, s] of Object.entries<SfxDef>(SFX as Record<string, SfxDef>)) {
    const p = `sfx.${id}`
    if (!waves.has(s.wave)) bad(`${p}.wave`, `未知波形：${s.wave}`)
    num(`${p}.freq`, s.freq, 1)
    if (s.freqEnd !== undefined) num(`${p}.freqEnd`, s.freqEnd, 1)
    num(`${p}.duration`, s.duration, 0.001)
    num(`${p}.volume`, s.volume, 0)
    if (s.volume > 1) bad(`${p}.volume`, '峰值音量需 ≤1')
    if (s.attack !== undefined) num(`${p}.attack`, s.attack, 0)
    if (s.decayPow !== undefined) num(`${p}.decayPow`, s.decayPow, 0.01)
    if (s.throttleMs !== undefined) num(`${p}.throttleMs`, s.throttleMs, 0)
    if (s.jitter !== undefined) num(`${p}.jitter`, s.jitter, 0)
    if (s.steps !== undefined) {
      if (!Array.isArray(s.steps) || s.steps.length === 0) bad(`${p}.steps`, '需为非空数组')
      else s.steps.forEach((v, i) => num(`${p}.steps[${i}]`, v, 0.001))
    }
    pure(p, s)
  }
}

// ── mapdefaults ──
{
  const p = 'mapdefaults'
  const d: MapDefaults = MAP_DEFAULTS
  num(`${p}.width`, d.width, 1)
  num(`${p}.height`, d.height, 1)
  num(`${p}.cameraMargin`, d.cameraMargin, 0)
  pure(p, d)
}

// ── timestop ──
{
  const p = 'timestop'
  const t: TimeStopTuning = TIMESTOP
  num(`${p}.floor`, t.floor, 0)
  if (t.floor > 1) bad(`${p}.floor`, '时间流速下限需 ≤1')
  num(`${p}.easeMs`, t.easeMs, 0)
  num(`${p}.chillMaxAlpha`, t.chillMaxAlpha, 0)
  if (t.chillMaxAlpha > 1) bad(`${p}.chillMaxAlpha`, '不透明度需 ≤1')
  num(`${p}.chillColor`, t.chillColor, 0)
  num(`${p}.fadeMs`, t.fadeMs, 0.01)
  pure(p, t)
}

// ── maps ──
for (const [id, m] of Object.entries(MAPS)) {
  const p = `maps.${id}`
  str(`${p}.emoji`, m.emoji)
  if (!['bounded', 'infinite', 'river', 'void', 'ruins', 'daynight', 'space', 'ice'].includes(m.kind)) bad(p, `未知 kind：${m.kind}`)
  for (const mx of m.mix) {
    if (!(mx.kind in ENEMIES)) bad(`${p}.mix`, `引用了不存在的敌人 kind：${mx.kind}`)
    else if (ENEMIES[mx.kind]?.role === 'boss') bad(`${p}.mix`, `mix 里不能出现 Boss：${mx.kind}`)
  }
  if (!(m.boss in ENEMIES)) bad(`${p}.boss`, `引用了不存在的敌人 kind：${m.boss}`)
  else if (ENEMIES[m.boss]?.role !== 'boss') bad(`${p}.boss`, `boss 必须指向 role:'boss' 的条目：${m.boss}`)
  const w = (m as MapDef).walls
  if (w) {
    num(`${p}.walls.blocks`, w.blocks, 1)
    num(`${p}.walls.maxLen`, w.maxLen, 1)
    num(`${p}.walls.centerClearU`, w.centerClearU, 0)
    num(`${p}.walls.spawnMinCellDist`, w.spawnMinCellDist, 0)
    num(`${p}.walls.reflowMs`, w.reflowMs, 0)
  }
  if ((m as MapDef).finalWaveSub !== undefined) str(`${p}.finalWaveSub`, (m as MapDef).finalWaveSub)
  const dn = (m as MapDef).dayNight
  if (dn) {
    num(`${p}.dayNight.cycleSec`, dn.cycleSec, 1)
    num(`${p}.dayNight.startHour`, dn.startHour, 0)
    num(`${p}.dayNight.visionMax`, dn.visionMax, 1)
    num(`${p}.dayNight.visionMid`, dn.visionMid, 1)
    num(`${p}.dayNight.visionMin`, dn.visionMin, 1)
    num(`${p}.dayNight.fogRadiusDusk`, dn.fogRadiusDusk, 0)
    num(`${p}.dayNight.fogRadiusMidnight`, dn.fogRadiusMidnight, 0)
    num(`${p}.dayNight.fogAlphaMax`, dn.fogAlphaMax, 0)
    num(`${p}.dayNight.daySpawnScale`, dn.daySpawnScale, 0.01)
    num(`${p}.dayNight.nightSpawnScale`, dn.nightSpawnScale, 0.01)
  }
  const ic = (m as MapDef).ice
  if (ic) {
    num(`${p}.ice.floeU`, ic.floeU, 1)
    num(`${p}.ice.teamTauIce`, ic.teamTauIce, 0)
    num(`${p}.ice.teamTauWater`, ic.teamTauWater, 0)
    num(`${p}.ice.enemyTauIce`, ic.enemyTauIce, 0)
    num(`${p}.ice.knockbackTauMul`, ic.knockbackTauMul, 0.01)
    num(`${p}.ice.waterSpeedMul`, ic.waterSpeedMul, 0)
    num(`${p}.ice.waterTeamDps`, ic.waterTeamDps, 0)
    num(`${p}.ice.waterEnemyDps`, ic.waterEnemyDps, 0)
    num(`${p}.ice.waterTickMs`, ic.waterTickMs, 1)
  }
  const sp = (m as MapDef).space
  if (sp) {
    num(`${p}.space.blackholeRadiusU`, sp.blackholeRadiusU, 0.01)
    const mt = sp.meteor
    num(`${p}.space.meteor.intervalMs`, mt.intervalMs, 1)
    num(`${p}.space.meteor.intervalJitterMs`, mt.intervalJitterMs, 0)
    num(`${p}.space.meteor.warnMs`, mt.warnMs, 0)
    num(`${p}.space.meteor.radiusU`, mt.radiusU, 0.01)
    num(`${p}.space.meteor.speedU`, mt.speedU, 0.01)
    num(`${p}.space.meteor.travelU`, mt.travelU, 0.01)
    num(`${p}.space.meteor.offsetU`, mt.offsetU, 0)
    num(`${p}.space.meteor.damage`, mt.damage, 0)
  }
  const rv = (m as MapDef).river
  if (rv) {
    num(`${p}.river.viewScale`, rv.viewScale, 0.01)
    num(`${p}.river.width`, rv.width, 0.01)
    num(`${p}.river.flow`, rv.flow, 0)
    num(`${p}.river.coinCullPad`, rv.coinCullPad, 0)
    num(`${p}.river.driftCount`, rv.driftCount, 0)
    if (!Array.isArray(rv.driftSpeedMul) || rv.driftSpeedMul.length !== 2) bad(`${p}.river.driftSpeedMul`, '需为 [min,max]')
    else rv.driftSpeedMul.forEach((v, i) => num(`${p}.river.driftSpeedMul[${i}]`, v, 0))
    num(`${p}.river.waveSlow`, rv.waveSlow, 0)
    num(`${p}.river.waveFast`, rv.waveFast, 0)
  }
  const to = (m as MapDef).torus
  if (to) {
    num(`${p}.torus.arenaLong`, to.arenaLong, 1)
    num(`${p}.torus.arenaShort`, to.arenaShort, 1)
    num(`${p}.torus.projectileLifeMs`, to.projectileLifeMs, 1)
    num(`${p}.torus.frame`, to.frame, 0)
  }
  const inf = (m as MapDef).infinite
  if (inf) {
    num(`${p}.infinite.activeHalf`, inf.activeHalf, 1)
    num(`${p}.infinite.spawnRingMin`, inf.spawnRingMin, 0)
    num(`${p}.infinite.spawnRingMax`, inf.spawnRingMax, 0)
    if (inf.spawnRingMin > inf.spawnRingMax) bad(`${p}.infinite.spawnRingMin`, '不能大于 spawnRingMax')
    num(`${p}.infinite.chunkCells`, inf.chunkCells, 1)
    num(`${p}.infinite.chunkPad`, inf.chunkPad, 0)
  }
  const sr = (m as MapDef).shrinkRing
  if (sr) {
    num(`${p}.shrinkRing.r0`, sr.r0, 0.01)
    num(`${p}.shrinkRing.rMin`, sr.rMin, 0.01)
    if (sr.rMin > sr.r0) bad(`${p}.shrinkRing.rMin`, '不能大于 r0')
    num(`${p}.shrinkRing.holdMs`, sr.holdMs, 0)
    num(`${p}.shrinkRing.shrinkEndMs`, sr.shrinkEndMs, 0)
    if (sr.shrinkEndMs < sr.holdMs) bad(`${p}.shrinkRing.shrinkEndMs`, '不能早于 holdMs')
    num(`${p}.shrinkRing.tickMs`, sr.tickMs, 1)
    num(`${p}.shrinkRing.tickDamage`, sr.tickDamage, 0)
  }
  pure(p, m)
}

// ── pickups ──
for (const [id, pk] of Object.entries(PICKUPS.defs)) {
  const p = `pickups.defs.${id}`
  str(`${p}.emoji`, pk.emoji)
  num(`${p}.size`, pk.size, 0.01)
  num(`${p}.radius`, pk.radius, 0.01)
  pure(p, pk)
}
num('pickups.pipeline.magnetSpeed', PICKUPS.pipeline.magnetSpeed, 0.01)
num('pickups.pipeline.collectRadius', PICKUPS.pipeline.collectRadius, 0.01)
pure('pickups.pipeline', PICKUPS.pipeline)

// ── progression ──
{
  const p = 'progression'
  const g: Progression = PROGRESSION
  if (!Array.isArray(g.waveDurationsSec) || g.waveDurationsSec.length === 0) {
    bad(`${p}.waveDurationsSec`, '需为非空数组')
  } else {
    g.waveDurationsSec.forEach((v, i) => num(`${p}.waveDurationsSec[${i}]`, v, 1))
  }
  g.eliteWaves.forEach((v, i) => num(`${p}.eliteWaves[${i}]`, v, 1))
  num(`${p}.loopFrom`, g.loopFrom, 1)
  if (g.loopFrom > g.waveDurationsSec.length) bad(`${p}.loopFrom`, `不能超过总波数 ${g.waveDurationsSec.length}`)
  num(`${p}.reviveHpRatio`, g.reviveHpRatio, 0)
  num(`${p}.summaryMs`, g.summaryMs, 0)
  num(`${p}.coinDropChanceMin`, g.coinDropChanceMin, 0)
  num(`${p}.coinDropChanceHalfLifeSec`, g.coinDropChanceHalfLifeSec, 0.01)
  num(`${p}.xp.base`, g.xp.base, 1)
  num(`${p}.xp.growth`, g.xp.growth, 1)
  num(`${p}.xp.waveBonusBase`, g.xp.waveBonusBase, 0)
  num(`${p}.xp.waveBonusPerWave`, g.xp.waveBonusPerWave, 0)
  num(`${p}.recruit.poolSize`, g.recruit.poolSize, 1)
  if (!Array.isArray(g.recruit.unlocks) || g.recruit.unlocks.length === 0) {
    bad(`${p}.recruit.unlocks`, '需为非空数组')
  } else {
    g.recruit.unlocks.forEach((v, i) => num(`${p}.recruit.unlocks[${i}]`, v, 1))
  }
  pure(p, g)
}

// ── difficulty ──
{
  const p = 'difficulty'
  const d: Difficulty = DIFFICULTY
  const s = d.spawn
  num(`${p}.spawn.startIntervalMs`, s.startIntervalMs, 1)
  num(`${p}.spawn.minIntervalMs`, s.minIntervalMs, 1)
  if (s.minIntervalMs > s.startIntervalMs) bad(`${p}.spawn.minIntervalMs`, '不能大于 startIntervalMs')
  num(`${p}.spawn.rampSeconds`, s.rampSeconds, 0.01)
  num(`${p}.spawn.hpGrowthPerMin`, s.hpGrowthPerMin, 0)
  num(`${p}.spawn.maxAlive`, s.maxAlive, 1)
  num(`${p}.spawn.teamFactorBase`, s.teamFactorBase, 0)
  num(`${p}.spawn.teamFactorPerMember`, s.teamFactorPerMember, 0)
  num(`${p}.spawn.telegraphMs`, s.telegraphMs, 0)
  str(`${p}.spawn.markEmoji`, s.markEmoji)
  num(`${p}.spawn.markSize`, s.markSize, 0.01)
  num(`${p}.spawn.minPlayerDist`, s.minPlayerDist, 0)
  num(`${p}.spawn.edgeInset`, s.edgeInset, 0)
  const e = d.elite
  num(`${p}.elite.fromWave`, e.fromWave, 1)
  num(`${p}.elite.chance`, e.chance, 0)
  if (e.chance > 1) bad(`${p}.elite.chance`, '需为 0..1 的概率')
  for (const k of ['hpMul', 'speedMul', 'damageMul', 'sizeMul', 'xpMul', 'coinsMul'] as const) {
    num(`${p}.elite.${k}`, e[k], 0.01)
  }
  num(`${p}.surge.count`, d.surge.count, 1)
  num(`${p}.surge.elites`, d.surge.elites, 0)
  if (d.surge.elites > d.surge.count) bad(`${p}.surge.elites`, '不能多于 surge.count')
  num(`${p}.surge.spreadMs`, d.surge.spreadMs, 0)
  num(`${p}.bossSpawnRelief`, d.bossSpawnRelief, 0.01)
  pure(p, d)
}

// ── team ──
{
  const p = 'team'
  const t: TeamBaseline = TEAM_BASELINE
  num(`${p}.team.ringRadius`, t.team.ringRadius, 0.01)
  num(`${p}.team.smallRingRadius`, t.team.smallRingRadius, 0.01)
  num(`${p}.team.pairGap`, t.team.pairGap, 0.01)
  num(`${p}.team.reviveMs`, t.team.reviveMs, 0)
  num(`${p}.team.guardCenterHurtboxMul`, t.team.guardCenterHurtboxMul, 0)
  num(`${p}.member.size`, t.member.size, 0.01)
  num(`${p}.member.radius`, t.member.radius, 0.01)
  num(`${p}.member.maxHp`, t.member.maxHp, 1)
  num(`${p}.member.iframesMs`, t.member.iframesMs, 0)
  pure(p, t)
}

// ── combat ──
{
  const p = 'combat'
  const c: CombatTuning = COMBAT
  num(`${p}.knockback.tauMs`, c.knockback.tauMs, 0.01)
  num(`${p}.knockback.maxSpeed`, c.knockback.maxSpeed, 1)
  num(`${p}.knockback.deathSlideMs`, c.knockback.deathSlideMs, 0)
  num(`${p}.acquire.range`, c.acquire.range, 0.01)
  pure(p, c)
}

// ── ai ──
{
  const p = 'ai'
  const g: AiTuning = AI
  num(`${p}.wander.turnMinMs`, g.wander.turnMinMs, 0)
  num(`${p}.wander.turnJitterMs`, g.wander.turnJitterMs, 0)
  num(`${p}.wander.spawnTurnMinMs`, g.wander.spawnTurnMinMs, 0)
  num(`${p}.wander.spawnTurnJitterMs`, g.wander.spawnTurnJitterMs, 0)
  num(`${p}.standoffBandU`, g.standoffBandU, 0)
  num(`${p}.coinThiefEatCdMs`, g.coinThiefEatCdMs, 0)
  num(`${p}.fleeIdleSpeedMul`, g.fleeIdleSpeedMul, 0)
  pure(p, g)
}

// ── feel ──
{
  const p = 'feel'
  const f: FeelTuning = FEEL
  num(`${p}.follow.kBase`, f.follow.kBase, 0.01)
  num(`${p}.follow.kJitter`, f.follow.kJitter, 0)
  num(`${p}.follow.zeta`, f.follow.zeta, 0.01)
  num(`${p}.follow.maxLag`, f.follow.maxLag, 0)
  num(`${p}.wander.radius`, f.wander.radius, 0)
  num(`${p}.wander.freqX`, f.wander.freqX, 0)
  num(`${p}.wander.freqY`, f.wander.freqY, 0)
  num(`${p}.wander.rampMs`, f.wander.rampMs, 0.01)
  num(`${p}.hitShake.durationMs`, f.hitShake.durationMs, 0)
  num(`${p}.hitShake.intensity`, f.hitShake.intensity, 0)
  num(`${p}.orbit.detectRange`, f.orbit.detectRange, 0.01)
  num(`${p}.orbit.maxSpeed`, f.orbit.maxSpeed, 0.01)
  num(`${p}.orbit.avoidGain`, f.orbit.avoidGain, 0)
  num(`${p}.orbit.seekGain`, f.orbit.seekGain, 0)
  pure(p, f)
}

// ── economy ──
{
  const p = 'economy'
  const ec: Economy = ECONOMY
  num(`${p}.critMul`, ec.critMul, 0.01)
  num(`${p}.price.perWave`, ec.price.perWave, 0)
  num(`${p}.price.earlyDiscount`, ec.price.earlyDiscount, 0)
  if (ec.price.earlyDiscount > 1) bad(`${p}.price.earlyDiscount`, '需为 0..1 的折扣')
  num(`${p}.price.earlyFadeWaves`, ec.price.earlyFadeWaves, 0.01)
  num(`${p}.shop.refreshPrice`, ec.shop.refreshPrice, 0)
  pure(p, ec)
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
write('levels', LEVEL_STATS)
write('captains', CAPTAINS)
write('enemies', { enemies: ENEMIES })
write('items', ITEMS)
write('cards', CARDS)
write('battlefield', BATTLEFIELD)
write('sfx', SFX)
write('timestop', TIMESTOP)
write('mapdefaults', MAP_DEFAULTS)
write('maps', MAPS)
write('pickups', PICKUPS)
write('progression', PROGRESSION)
write('difficulty', DIFFICULTY)
write('ai', AI)
write('team', TEAM_BASELINE)
write('combat', COMBAT)
write('feel', FEEL)
write('economy', ECONOMY)

// ordering.txt 与 twemoji.txt 逐行对应，只拷贝不改写
mkdirSync('src/assets/emoji', { recursive: true })
for (const name of ['ordering.txt', 'twemoji.txt']) {
  copyFileSync(`scripts/emoji/${name}`, `src/assets/emoji/${name}`)
}

console.log('gen-defs：21 张表校验通过，已生成 src/assets/（21 张 json + emoji 原始资源）')
