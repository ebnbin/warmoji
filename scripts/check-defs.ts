import { CHARACTERS } from '../defs/characters.ts'
import { WEAPONS } from '../defs/weapons.ts'
import { ENEMIES } from '../defs/enemies.ts'
import { MAPS } from '../defs/maps.ts'
import { PROGRESSION } from '../defs/progression.ts'
import type { CharacterAuthoring } from '../src/types/characters'
import type { EnemyDef } from '../src/types/enemies'
import type { MapDef } from '../src/types/maps'

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

for (const [id, c] of Object.entries<CharacterAuthoring>(CHARACTERS)) {
  for (const k of [0, 1]) {
    const tiers = [...c.weapons.map((w) => WEAPONS[w].upgrades[k]), ...c.innate.map((i) => i.upgrades[k])]
    const names = new Set(tiers.flatMap((t) => (t ? [t.card.name] : [])))
    need(names.size === 1, `characters.${id} 第 ${k + 1} 档升级卡须存在且各载体一致`)
  }
}

const withNested = (e: EnemyDef): EnemyDef[] => [
  e,
  ...(e.spawner ? withNested(e.spawner.into) : []),
  ...(e.onDeath ?? []).flatMap((fx) => (fx.kind === 'split' ? withNested(fx.into) : [])),
]
for (const e of Object.values(ENEMIES).flatMap(withNested)) {
  const lm = e.locomotion
  if (lm.kind !== 'standoff') continue
  for (const a of e.abilities ?? []) {
    const range = 'range' in a ? a.range : undefined
    need(range === undefined || range > lm.standoffDist, `enemies.${e.kind} 的能力射程须大于 standoffDist`)
  }
}

need(
  PROGRESSION.loopFrom >= 1 && PROGRESSION.loopFrom <= PROGRESSION.waveDurationsSec.length,
  'progression.loopFrom 须在 1 到总波数之间',
)

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exit(1)
}
