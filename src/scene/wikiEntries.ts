import { CHARACTERS, ROSTER_IDS, baseLoadout } from '../data/characters'
import { BOSSES, ENEMIES, ENEMY_DEFS } from '../data/enemies'
import type { EnemyDef } from '../types/enemies'
import { MAP_IDS, MAPS, bossFor } from '../data/maps'
import { PICKUPS } from '../data/pickups'
import { WEAPONS } from '../data/weapons'
import { ITEMS, RARITIES } from '../data/items'
import type { ItemDef } from '../types/items'
import { abilityLabel, abilityStatLines, characterStatGroups, effectLine, SHAPE_LABEL } from './statLines'
import type { WikiEntry, WikiGroup } from '../types/wikiEntries'

function grid(units: number): string {
  return `${+units.toFixed(1)}格`
}

const DRIVE_LABEL: Record<EnemyDef['drive']['kind'], string> = {
  chase: '追击',
  wander: '游荡',
  stay: '原地不动',
  flee: '逃跑',
  coinThief: '偷金币',
  standoff: '定距吐弹',
  orbit: '护巢环绕',
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
    `行为 ${DRIVE_LABEL[e.drive.kind]}${e.drive.kind === 'chase' && e.drive.at === 'leader' ? '（盯队长）' : ''} · 经验 ${e.xp} · 金币 ${e.coins}${e.kbImmune ? ' · 免疫击退' : ''}`,
  ]
  for (const w of e.abilities ?? []) lines.push(`${abilityLabel(w)}：${abilityStatLines(w).join(' · ')}`)
  if (e.phasesWalls) lines.push('穿墙：无视断壁直取队伍')
  if (e.breaksWalls) lines.push('破墙：冲撞碾碎沿途断壁')
  if (e.guardedBy) lines.push(`依存无敌：自己召出的${ENEMIES[e.guardedBy].name}还有一座活着，就打不动它`)
  if (e.mount) lines.push(`坐骑：先扛 ${e.mount.hp} 伤害，扣光后变成${e.forms?.[e.mount.form]?.name ?? '下马形态'}`)
  if (e.grow) lines.push(`成长：出生 ${e.grow.ms / 1000} 秒后还活着就长成${e.grow.into.name}`)
  if (e.onLethal) lines.push(`致命一击时不死，改为：${e.onLethal.map((x) => effectLine(x, true)).join('，')}`)
  if (e.onLowHp) lines.push(`生命第一次低于 ${Math.round(e.onLowHp.ratio * 100)}% 时：${e.onLowHp.effects.map((x) => effectLine(x, true)).join('，')}`)
  if (e.onIdle) lines.push(`${e.onIdle.ms / 1000} 秒没出手${e.onIdle.still ? '也没动' : ''}：${e.onIdle.effects.map((x) => effectLine(x, true)).join('，')}`)
  for (const [i, f] of (e.forms ?? []).entries()) {
    if (e.mount?.form === i && !f.abilities) continue
    const traits = [f.speedMul !== undefined ? `移速 ×${f.speedMul}` : '', f.sizeMul !== undefined ? `体型 ×${f.sizeMul}` : '', f.anchored ? '原地不动' : ''].filter(Boolean).join(' · ')
    lines.push(`形态「${f.name ?? e.name}」${traits ? `：${traits}` : ''}`)
    for (const w of f.abilities ?? []) lines.push(`  ${abilityLabel(w)}：${abilityStatLines(w).join(' · ')}`)
  }
  for (const fx of e.onDeath ?? []) {
    if (fx.kind === 'split') lines.push(`死亡分裂 ${fx.count} 只${fx.into.name}`)
    else if (fx.kind === 'decoy') lines.push(`死亡留半透明尸壳诱火 ${fx.durationMs / 1000} 秒`)
    else lines.push(`亡语：${effectLine(fx)}`)
  }
  for (const fx of e.onTouch ?? []) lines.push(`接触附加：${effectLine(fx)}`)
  for (const fx of e.onHurt ?? []) lines.push(`挨打时：${effectLine(fx)}`)
  for (const fx of e.onAnchorLost ?? []) lines.push(`失巢暴走：${effectLine(fx)}`)
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
      icon: '1f939',
      title: '角色',
      entries: ROSTER_IDS.map((id) => ({
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
            `池归属 ${i.pool === 'all' ? '通用' : SHAPE_LABEL[i.pool]} · 角色经验 +${i.upgradeXp}${i.minLevel && i.minLevel > 1 ? ` · ${i.minLevel} 级解锁` : ''}`,
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
      if (w.held) used.add(w.held.emoji)
      if (w.shape.kind === 'bolt') used.add(w.shape.projectile.emoji)
    }
  }
  for (const c of Object.values(CHARACTERS)) for (const f of c.forms ?? []) if (f.emoji) used.add(f.emoji)
  for (const e of [...ENEMY_DEFS, ...BOSSES]) {
    for (const f of e.forms ?? []) if (f.emoji) used.add(f.emoji)
    for (const w of e.abilities ?? []) {
      if (w.shape.kind === 'bolt') used.add(w.shape.projectile.emoji)
      if (w.shape.kind === 'drop') used.add(w.shape.emoji)
    }
  }
  used.add(PICKUPS.coin.emoji)
  return used
}
