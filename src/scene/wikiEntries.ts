import { CAPTAINS } from '../data/captains'
import { CHARACTERS, baseLoadout } from '../data/characters'
import type { CharacterId } from '../types/characters'
import { BOSSES, ENEMIES, ENEMY_DEFS } from '../data/enemies'
import type { EnemyDef } from '../types/enemies'
import { MAP_IDS, MAPS, bossFor } from '../data/maps'
import { PICKUPS } from '../data/pickups'
import { WEAPONS } from '../data/weapons'
import { CARDS } from '../data/cards'
import { ITEMS, RARITIES } from '../data/items'
import type { ItemDef } from '../types/items'
import { captainStatGroups, characterStatGroups, ABILITY_KIND_LABEL } from './statLines'
import type { WikiEntry, WikiGroup } from '../types/wikiEntries'

function grid(units: number): string {
  return `${+units.toFixed(1)}格`
}

const LOCOMOTION_LABEL: Record<EnemyDef['locomotion']['kind'], string> = {
  chase: '追击',
  wander: '游荡',
  static: '原地不动',
  dash: '蓄力突刺',
  flee: '逃跑',
  coinThief: '偷金币',
  standoff: '定距吐弹',
  detonate: '自爆冲锋',
  baseOrbit: '护巢环绕',
}

const MAP_KIND_LABEL: Record<(typeof MAPS)[keyof typeof MAPS]['kind'], string> = {
  bounded: '有界竞技场（25×25 方场）',
  infinite: '无限世界（终波毒雾收拢成圈）',
  river: '单屏河道（万物随水流漂移）',
  void: '环面竞技场（四壁传送门，出这头即现那头）',
  ruins: '断壁废墟（墙挡人 / 挡弹 / 挡视线）',
  daynight: '昼夜原野（30×30；视野随晨昏涨落，夜幕四合起迷雾）',
  space: '深空星海（无限世界；天体直线横扫敌我通吃，终波奇点禁锢场谁也逃不出）',
  ice: '浮冰（25×25 方形浮冰；全局打滑不跟手，滑出冰面落水掉血·敌我通吃，相机永远跟随）',
}

function enemyStatLines(e: EnemyDef): string[] {
  const lines = [
    `生命 ${e.hp} · 移速 ${grid(e.speed)}/秒 · 接触伤害 ${e.damage}`,
    `行为 ${LOCOMOTION_LABEL[e.locomotion.kind]} · 经验 ${e.xp} · 金币 ${e.coins}${e.kbImmune ? ' · 免疫击退' : ''}`,
  ]
  for (const w of e.abilities ?? []) {
    if (w.kind === 'projectile') {
      const volley = w.volley ? ` · ${w.volley.spreadDeg >= 360 ? '环形' : '扇形'} ${w.volley.count} 发` : ''
      lines.push(`放枪：子弹 ${w.damage} 伤 · 弹速 ${grid(w.projectile.speed)}/秒${volley}`)
    } else if (w.kind === 'strike') {
      lines.push(`空袭：坠物砸向最近 ${w.targets} 名队员 · 每记 ${w.damage} 伤`)
    } else if (w.kind === 'heal') {
      lines.push(`群体治疗同伴 ${w.amount} · 间隔 ${w.cooldownMs / 1000} 秒 · 范围 ${grid(w.range)}`)
    }
  }
  const lm = e.locomotion
  if (lm.kind === 'dash' && lm.trigger.kind === 'detect' && lm.length.kind === 'dist') {
    lines.push(`探测 ${grid(lm.trigger.range)} · 突刺 ${grid(lm.length.dist)}`)
  }
  if (lm.kind === 'detonate') lines.push(`自爆：范围 ${grid(lm.blastRadius)} · 伤害 ${lm.blastDamage}`)
  if (e.phasesWalls) lines.push('穿墙：无视断壁直取队伍')
  if (e.breaksWalls) lines.push('破墙：冲撞碾碎沿途断壁')
  for (const fx of e.onDeath ?? []) {
    if (fx.kind === 'ground') lines.push(`死亡留毒 ${grid(fx.def.radius)} · 每 ${fx.def.tickMs / 1000} 秒 ${fx.def.damage} 伤`)
    if (fx.kind === 'split') lines.push(`死亡分裂 ${fx.count} 只${fx.into.name}`)
    if (fx.kind === 'heal') lines.push(`亡语治疗周围同伴 ${fx.amount}（范围 ${grid(fx.range)}）`)
    if (fx.kind === 'decoy') lines.push(`死亡留半透明尸壳诱火 ${fx.durationMs / 1000} 秒`)
  }
  for (const fx of e.onContact ?? []) {
    if (fx.kind === 'attackSlow') {
      lines.push(`接触附黏：命中队员攻击冷却 ×${fx.mul}，持续 ${fx.durationMs / 1000} 秒`)
    }
  }
  if (e.spawner) {
    lines.push(`巢穴：每 ${e.spawner.intervalMs / 1000} 秒生成 ${e.spawner.count} 只${e.spawner.into.name}`)
  }
  return lines
}

function mapStatLines(id: (typeof MAP_IDS)[number]): string[] {
  const m = MAPS[id]
  const boss = bossFor(id)
  const names = [...new Set(m.mix.map((r) => ENEMIES[r.kind]?.name).filter(Boolean))]
  return [
    `世界规则 ${MAP_KIND_LABEL[m.kind]}`,
    `终波头目 ${boss.name}`,
    `出没敌人 ${names.join('、')}`,
  ]
}

function flatten(groups: readonly { title: string; lines: readonly string[] }[]): string[] {
  return groups.flatMap((g) => [`◆ ${g.title}`, ...g.lines])
}

export function wikiGroups(): WikiGroup[] {
  return [
    {
      icon: '1f5fa',
      title: '地图',
      entries: MAP_IDS.map((id) => ({
        emoji: MAPS[id].emoji,
        name: MAPS[id].name,
        desc: MAPS[id].desc,
        lines: mapStatLines(id),
      })),
    },
    {
      icon: '1f607',
      title: '队长',
      entries: Object.values(CAPTAINS).map((c) => ({
        emoji: c.emoji,
        name: c.name,
        desc: c.desc,
        lines: flatten(captainStatGroups(c)),
      })),
    },
    {
      icon: '1f939',
      title: '角色',
      entries: (Object.keys(CHARACTERS) as CharacterId[]).map((id) => ({
        emoji: CHARACTERS[id].emoji,
        name: CHARACTERS[id].name,
        desc: CHARACTERS[id].desc,
        lines: flatten(characterStatGroups(id, [], 1, { path: false })),
        levels: [1, 2, 3].map((lv) => ({
          label: `${lv} 级`,
          lines: flatten(characterStatGroups(id, [], lv, { path: false })),
        })),
      })),
    },
    {
      icon: '1f9df',
      title: '敌人',
      entries: [...ENEMY_DEFS, ...BOSSES].map((e) => ({
        emoji: e.emoji,
        name: e.role === 'boss' ? `${e.name}（Boss）` : e.name,
        desc: e.desc,
        lines: enemyStatLines(e),
      })),
    },
    {
      icon: '1f6e1',
      title: '道具',
      entries: [
        ...Object.values<ItemDef>(ITEMS).map((i) => ({
          emoji: i.emoji,
          name: i.name,
          desc: i.desc,
          lines: [
            `道具 · ${RARITIES[i.rarity].label} · 价格 ${i.price} 金币 · ${i.maxStacks === undefined ? '无限堆叠' : `上限 ${i.maxStacks} 件`}`,
            `池归属 ${i.pool === 'all' ? '通用' : ABILITY_KIND_LABEL[i.pool]} · 角色经验 +${i.upgradeXp}${i.minLevel && i.minLevel > 1 ? ` · ${i.minLevel} 级解锁` : ''}`,
          ],
        })),
        ...Object.values(CARDS).map((c) => ({
          emoji: c.emoji,
          name: c.name,
          desc: c.desc,
          lines: [
            `升级卡 · ${RARITIES[c.rarity].label} · 升级时三选一，提供全队增益`,
            c.maxLevel > 1 ? `可叠加至 ${c.maxLevel} 级（每级再叠加一次）` : '唯一（不可叠加）',
          ],
        })),
      ],
    },
  ]
}

export function wikiEntryByEmoji(): Map<string, { category: string; entry: WikiEntry }> {
  const map = new Map<string, { category: string; entry: WikiEntry }>()
  for (const g of wikiGroups()) {
    for (const e of g.entries) {
      if (!map.has(e.emoji)) map.set(e.emoji, { category: g.title, entry: e })
    }
  }
  return map
}

export function usedEmojiSet(): Set<string> {
  const used = new Set<string>()
  for (const g of wikiGroups()) for (const e of g.entries) used.add(e.emoji)
  for (const w of Object.values(WEAPONS)) used.add(w.emoji)
  for (const c of Object.values(CHARACTERS)) {
    for (const carrier of c.carriers) {
      used.add(carrier.icon)
      for (const card of carrier.cards) if (card) used.add(card.icon)
    }
    for (const w of baseLoadout(c)) {
      if ('held' in w && w.held) used.add(w.held.emoji)
      if (w.kind === 'projectile') used.add(w.projectile.emoji)
    }
  }
  for (const e of [...ENEMY_DEFS, ...BOSSES]) {
    for (const w of e.abilities ?? []) {
      if (w.kind === 'projectile') used.add(w.projectile.emoji)
      if (w.kind === 'strike') used.add(w.drop.emoji)
    }
  }
  used.add(PICKUPS.coin.emoji)
  return used
}
