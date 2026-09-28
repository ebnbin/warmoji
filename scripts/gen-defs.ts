import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { ABILITIES } from '../defs/abilities.ts'
import { AI } from '../defs/ai.ts'
import { ANIMATIONS } from '../defs/animations.ts'
import { BATTLEFIELD } from '../defs/battlefield.ts'
import { CHARACTERS } from '../defs/characters.ts'
import { COMBAT } from '../defs/combat.ts'
import { DIFFICULTY } from '../defs/difficulty.ts'
import { ECONOMY } from '../defs/economy.ts'
import { EDITOR_DRAFT } from '../defs/editor.ts'
import { ENEMIES } from '../defs/enemies.ts'
import { FEEL } from '../defs/feel.ts'
import { ITEMS } from '../defs/items.ts'
import { LEVEL_STATS } from '../defs/levels.ts'
import { MAP_DEFAULTS } from '../defs/mapdefaults.ts'
import { MAPS } from '../defs/maps.ts'
import { MUTATORS } from '../defs/mutators.ts'
import { PICKUPS } from '../defs/pickups.ts'
import { PROGRESSION } from '../defs/progression.ts'
import { ROLES } from '../defs/roles.ts'
import { RUNS } from '../defs/runs.ts'
import { SFX } from '../defs/sfx.ts'
import { STAMINA } from '../defs/stamina.ts'
import { STATS } from '../defs/stats.ts'
import { TEAM_BASELINE } from '../defs/team.ts'
import { TIMESTOP } from '../defs/timestop.ts'
import { WEAPONS } from '../defs/weapons.ts'
import { MAX_CHAR_LEVEL } from '../src/data/charLevel.ts'
import { shellPull } from '../src/data/nebula.ts'
import { pathText, runChecks, withNested } from '../src/data/runCheck.ts'
import type { Issue } from '../src/data/runCheck.ts'
import type { CharacterAuthoring } from '../src/types/characters'
import type { EnemyDef } from '../src/types/enemies'
import type { ItemDef } from '../src/types/items'
import type { MapDef, NebulaConfig } from '../src/types/maps'
import type { MutatorDef, RunDef } from '../src/types/runs'

const errors: string[] = []
const need = (ok: boolean, msg: string): void => {
  if (!ok) errors.push(msg)
}

for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  for (const row of [...m.mix, ...(m.dayMix ?? []), ...(m.nightMix ?? [])]) {
    const e = ENEMIES[row.kind]
    need(e !== undefined && e.role !== 'boss', `maps.${id} 的出怪配比须引用非 Boss 的敌人：${row.kind}`)
  }
  need(ENEMIES[m.boss]?.role === 'boss', `maps.${id}.boss 须引用 Boss：${m.boss}`)
}

/** 地面费力、场内费力和身体的赶路耗体力，出现在哪都不能为负；属性修正的加值可以为负，由属性表的下限兜住 */
const noNegativeExertion = (v: unknown, path: string): void => {
  if (typeof v !== 'object' || v === null) return
  for (const [k, x] of Object.entries(v)) {
    if (k === 'add') continue
    if (k === 'exertion') need(typeof x === 'number' && x >= 0, `${path}.${k} 不能为负`)
    else noNegativeExertion(x, `${path}.${k}`)
  }
}
noNegativeExertion({ maps: MAPS, enemies: ENEMIES, abilities: ABILITIES, weapons: WEAPONS, characters: CHARACTERS, items: ITEMS }, 'defs')

need(STAMINA.slowFrom > 0 && STAMINA.slowFrom <= 1, 'stamina.slowFrom 须在 (0, 1] 内')
need(STAMINA.floor > 0 && STAMINA.floor < 1, 'stamina.floor 须在 (0, 1) 内')
need(STAMINA.warnAt > 0 && STAMINA.warnAt < STAMINA.slowFrom, 'stamina.warnAt 须在 0 与 slowFrom 之间')
need(STAMINA.restDelayMs >= 0 && STAMINA.rampMs > 0, 'stamina 的恢复节奏须为正')
need(STAMINA.draft > 0 && STAMINA.draft <= 1, 'stamina.draft 须在 (0, 1] 内')

/** 每张图赶路都耗体力、歇着都能回；逆流比平地累，顺流比平地省 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  need(m.stamina.exertion > 0 && m.stamina.regen > 0, `maps.${id}.stamina 的费力与回复倍率须为正`)
  if (m.river) need(m.river.upstream >= 1 && m.river.downstream >= 0 && m.river.downstream <= 1, `maps.${id}.river 的逆流倍率须不小于 1，顺流倍率须在 [0, 1] 内`)
  if (m.ice) need(m.ice.waterExertion > 0 && m.ice.waterRegen >= 0, `maps.${id}.ice 的水里费力须为正、回复倍率不为负`)
}

/** 星云：壳层包着空腔，黑洞整个落在空腔里，视界外还有能站的地方；流星的积分步长能在时限里走完 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  need((m.kind === 'nebula') === (m.nebula !== undefined), `maps.${id} 是星云当且仅当写了 nebula`)
  const n = m.nebula
  if (!n) continue
  const [near, far] = n.hole.fromCenterU
  need(n.shell.innerU > 0 && n.shell.outerU > n.shell.innerU && n.shell.gm > 0, `maps.${id}.nebula.shell 须内径为正、外径大于内径、引力为正`)
  need(n.contain.speedMul >= 1 && n.contain.leapU >= 0, `maps.${id}.nebula.contain 的速度余量不小于 1、瞬移余量不为负`)
  need(n.hole.gm > 0 && n.hole.softeningU > 0, `maps.${id}.nebula.hole 的引力与软化长度须为正`)
  need(n.hole.horizonU > n.hole.softeningU / Math.SQRT2, `maps.${id}.nebula.hole.horizonU 须大于软化长度的 1/√2，视界外的引力才随距离单调减小`)
  need(near >= 0 && near <= far && far + n.hole.horizonU < n.shell.innerU, `maps.${id}.nebula.hole 的位置范围须落在空腔里`)
  need(n.hole.clearU > n.hole.horizonU, `maps.${id}.nebula.hole.clearU 须大于视界`)
  need(n.meteor.stepMs > 0 && n.meteor.maxFlightMs >= n.meteor.stepMs, `maps.${id}.nebula.meteor 的积分步长须为正且不超过最长飞行时间`)
  need(n.meteor.speedU > 0 && n.meteor.radiusU > 0 && n.meteor.warnMs >= 0 && n.meteor.offsetU >= 0, `maps.${id}.nebula.meteor 的速度与半径须为正`)
  need(n.meteor.radiusU < n.shell.innerU, `maps.${id}.nebula.meteor.radiusU 须小于空腔半径，瞄准点才收得进空腔`)
}

/** 身体的体力上限须为正、体力回复不为负 */
const checkStamina = (st: { readonly maxStamina?: number; readonly staminaRegen?: number } | undefined, path: string): void => {
  need((st?.maxStamina ?? 1) > 0 && (st?.staminaRegen ?? 0) >= 0, `${path} 的体力上限须为正、体力回复不为负`)
}
for (const [id, c] of Object.entries<CharacterAuthoring>(CHARACTERS)) checkStamina(c.stats, `characters.${id}`)
for (const [id, e] of Object.entries<EnemyDef>(ENEMIES)) checkStamina(e.stats, `enemies.${id}`)

for (const [id, c] of Object.entries<CharacterAuthoring>(CHARACTERS)) {
  need(new Set(c.tags).size === c.tags.length, `characters.${id}.tags 不能重复`)
  for (const k of [0, 1]) {
    const tiers = [...c.weapons.map((w) => WEAPONS[w].upgrades[k]), ...c.innate.map((i) => i.upgrades[k])]
    const names = new Set(tiers.flatMap((t) => (t ? [t.card.name] : [])))
    need(names.size === 1, `characters.${id} 第 ${k + 1} 档升级卡须存在且各载体一致`)
  }
}

for (const e of Object.values(ENEMIES).flatMap(withNested)) {
  const lm = e.drive
  if (lm.kind !== 'standoff') continue
  for (const a of e.abilities ?? []) {
    const range = 'range' in a ? a.range : undefined
    need(range === undefined || range > lm.standoffDist, `enemies.${e.kind} 的能力射程须大于 standoffDist`)
  }
}

/** 走进壳层停下的半径：终端漂移 g·fall 追上速度的地方，壳层里引力随半径单调增大；外缘都追不上就停不下 */
const shellStopU = (shell: NebulaConfig['shell'], fall: number, speedU: number): number => {
  if (shellPull(shell, shell.outerU) * fall < speedU) return Infinity
  let lo = shell.innerU
  let hi = shell.outerU
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (shellPull(shell, mid) * fall >= speedU) hi = mid
    else lo = mid
  }
  return hi
}
/** 星云壳层困得住每个角色与敌人：停下处再往外瞬移，仍在壳外引力重新追不上它的逃逸半径以内 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  const n = m.nebula
  if (!n) continue
  const bodies = [
    ...Object.entries<CharacterAuthoring>(CHARACTERS).map(([k, c]) => ({ path: `characters.${k}`, fall: c.body.mass / c.body.drag, speedU: c.stats.moveSpeed })),
    ...Object.values(ENEMIES)
      .flatMap(withNested)
      .map((e) => ({ path: `enemies.${e.kind}`, fall: COMBAT.enemyBody.mass / COMBAT.enemyBody.drag, speedU: e.speed })),
  ]
  for (const b of bodies) {
    const v = b.speedU * n.contain.speedMul
    const escapeU = Math.sqrt((n.shell.gm * b.fall) / v)
    need(shellStopU(n.shell, b.fall, v) + n.contain.leapU <= escapeU, `maps.${id}.nebula.shell 困不住 ${b.path}：走到停下处再往外瞬移 ${n.contain.leapU} 格就逃出引力`)
  }
}

const PACK = new Set(readFileSync('scripts/emoji/ordering.txt', 'utf8').split(/\s+/))

const CHECKS = runChecks({
  enemies: ENEMIES,
  maps: MAPS,
  pools: BATTLEFIELD.pools,
  characters: CHARACTERS,
  maxCharLevel: MAX_CHAR_LEVEL,
  team: TEAM_BASELINE.team,
  radius: TEAM_BASELINE.member.radius,
  fanDistance: FEEL.squad.fanDistance,
})

/** 查出的问题记下来，前面写上是哪一份定义 */
const report = (where: string, issues: readonly Issue[]): void => {
  for (const i of issues) errors.push(`${where}${i.at.length > 0 ? ` ${pathText(i.at)}` : ''}：${i.why}`)
}

report('difficulty.curve', CHECKS.curve(DIFFICULTY.curve))

for (const [id, r] of Object.entries<RunDef>(RUNS)) {
  need(PACK.has(r.emoji), `runs.${id} 的 emoji 不在表情包里：${r.emoji}`)
  report(`runs.${id}`, CHECKS.run(r))
}

need(PACK.has(EDITOR_DRAFT.emoji), `editor 的 emoji 不在表情包里：${EDITOR_DRAFT.emoji}`)
report('editor', CHECKS.run(EDITOR_DRAFT))

const mutatorEmojis = new Map<string, string>()
for (const [id, m] of Object.entries<MutatorDef>(MUTATORS)) {
  need(PACK.has(m.emoji), `mutators.${id} 的 emoji 不在表情包里：${m.emoji}`)
  const dup = mutatorEmojis.get(m.emoji)
  need(dup === undefined, `mutators.${id} 与 mutators.${dup} 用了同一个 emoji`)
  mutatorEmojis.set(m.emoji, id)
  need(Number.isInteger(m.heat) && m.heat >= 1, `mutators.${id}.heat 须是正整数`)
  need(m.rules !== undefined || m.enemyMods !== undefined, `mutators.${id} 至少要改一样东西`)
  report(`mutators.${id}.rules`, CHECKS.rules(m.rules))
}

const itemEmojis = new Map<string, string>()
for (const [id, i] of Object.entries<ItemDef>(ITEMS)) {
  need(PACK.has(i.emoji), `items.${id} 的 emoji 不在表情包里：${i.emoji}`)
  const dup = itemEmojis.get(i.emoji)
  need(dup === undefined, `items.${id} 与 items.${dup} 用了同一个 emoji`)
  itemEmojis.set(i.emoji, id)
  need(i.maxStacks === undefined || i.maxStacks >= 1, `items.${id}.maxStacks 至少为 1`)
}

need(PROGRESSION.restRatio > 0 && PROGRESSION.restRatio <= 1, 'progression.restRatio 须在 (0, 1] 内')
need(PROGRESSION.xp.base > 0 && PROGRESSION.xp.growth >= 1, 'progression.xp 的底数须为正，增长不小于 1：越往后升级越难')
need(Number.isInteger(PROGRESSION.xp.maxLevel) && PROGRESSION.xp.maxLevel >= 2, 'progression.xp.maxLevel 须是不小于 2 的整数')

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exit(1)
}

const OUT = 'src/assets'
mkdirSync(`${OUT}/emoji`, { recursive: true })
const write = (name: string, data: unknown): void =>
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify(data, null, 1) + '\n')
write('abilities', ABILITIES)
write('ai', AI)
write('animations', ANIMATIONS)
write('battlefield', BATTLEFIELD)
write('characters', CHARACTERS)
write('combat', COMBAT)
write('difficulty', DIFFICULTY)
write('economy', ECONOMY)
write('editor', EDITOR_DRAFT)
write('enemies', ENEMIES)
write('feel', FEEL)
write('items', ITEMS)
write('levels', LEVEL_STATS)
write('mapdefaults', MAP_DEFAULTS)
write('maps', MAPS)
write('mutators', MUTATORS)
write('pickups', PICKUPS)
write('progression', PROGRESSION)
write('roles', ROLES)
write('runs', RUNS)
write('sfx', SFX)
write('stamina', STAMINA)
write('stats', STATS)
write('team', TEAM_BASELINE)
write('timestop', TIMESTOP)
write('weapons', WEAPONS)

// ordering.txt 与 twemoji.txt 逐行对应，只拷贝不改写
for (const name of ['ordering.txt', 'twemoji.txt']) copyFileSync(`scripts/emoji/${name}`, `${OUT}/emoji/${name}`)
