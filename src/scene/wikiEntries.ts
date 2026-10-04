import { CHARACTERS, ROSTER_IDS, baseLoadout } from '../data/characters'
import { BOSSES, ENEMIES, ENEMY_DEFS } from '../data/enemies'
import type { EnemyDef } from '../types/enemies'
import { MAP_IDS, MAPS, bossFor } from '../data/maps'
import { PICKUPS } from '../data/pickups'
import { WEAPONS } from '../data/weapons'
import { ITEMS, RARITIES, RARITY_ORDER, itemXp } from '../data/items'
import { modTexts, statText } from '../data/stats'
import { keysOf } from '../util/record'
import type { ItemDef } from '../types/items'
import { abilityLabel, abilityStatLines, characterStatGroups, effectLine } from './statLines'
import { itemLines, TRAIT_LABEL } from './itemLines'
import { mapStaminaLine } from './mapLines'
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
  bounded: '有界竞技场（方形场地）',
  oldRiver: '单屏河道（万物随水流漂移）',
  void: '环面竞技场（四壁传送门，出这头即现那头）',
  oldRuins: '旧残垣（断壁废墟；墙挡人 / 挡弹 / 挡视线）',
  ruins: '残垣（山顶台地上塌了大半的石砌院落；墙按剩下的高度挡人、挡子弹、挡视线，看不见的敌人不会被自动瞄准、只剩淡影；封门的木板只有穿透的子弹打得过；冲锋、爆炸与几种技能能打出缺口，没了支撑的墙整片塌下，落石砸人·敌我通吃，碎石拖慢脚步，尘雾一时挡住视线；怪物从看不见的地方来）',
  daynight: '昼夜原野（30×30；视野随晨昏涨落，夜幕四合起迷雾）',
  space: '深空星海（圆形禁锢场谁也逃不出；天体直线横扫敌我通吃）',
  ice: '浮冰（25×25 方形浮冰；全局打滑不跟手，滑出冰面落水掉血·敌我通吃，相机永远跟随）',
  volcano: '火山（32×32 以内崖壁围着的盆地；边上的活火山挡路，定期喷发，熔岩从火山口往四面八方流，外围先凉、凝成岩石，盖住的地方敌我都挨烫）',
  ship: '帆船（舷墙围着的甲板；一切都有重量，船随甲板上的重量与海浪横摇纵摇；倾斜后上坡慢、下坡快，闲着的身体和金币顺坡滑，炮弹满甲板滚）',
  river: '河流（林间空地上一条山溪从崖上落进深潭、分成两股从断崖边落进深谷；水流按浅水方程算出，越深越急越站不住，被冲倒就顺水漂走，漂过断崖边就落下去·敌我通吃）',
  meadow: '草甸（开阔的草地，四周是针叶林、牧场的木栅栏和一道陡坡，坡上是更高的一层草甸；没有特殊规则）',
  sakura: '樱庭（瓦顶土墙围着的日式庭院，樱花开着；一条溪从墙下的水门流进来，漫过低石堰从另一面墙下流走；水流沿用河流，站不住就顺水漂，漂过堰就被冲出院子·敌我通吃；溪上一座木桥，桥上不沾水）',
  cave: '溶洞（部分露天；光照随真实的昼夜变化，看得清的范围随之涨落；入夜点起火把；怪物只从暗处出来；洞壁、石柱挡人挡子弹）',
  nebula: '星云（空心星云的空腔，没有太阳；黑洞的万有引力作用于一切，周围那圈弯过来的光大致就是走不出来的地方，掉进视界被吞掉·敌我通吃，吞下的东西让它长大；壳层的引力把一切拉回空腔；流星从壳层甩出横穿空腔，撞上就挨打）',
  nebulaOld: '旧星云（空心的星云；黑洞的万有引力作用于一切，越近越强，掉进视界被吞噬·敌我通吃；壳层的引力越往外越强，谁也出不去）',
  desert: '沙漠（约 32×32、四边首尾相接的沙海，镜头跟着走看不到边；沙丘与标志物成对，分不清来没来过，标志物挡人不挡子弹；爬坡、松沙耗体力，背阴处回得快；走过留下印子，越累越深·敌我通吃，过一会儿就被风吹平）',
  floe: '浮冰（南极海上一块近似方形的浮冰，每局形状不同；积雪踩得住、光冰与新冰打滑，滑出冰缘落进冰水冻伤·敌我通吃；阵风刮来时新冰上站不住）',
}

export function enemyStatLines(e: EnemyDef): string[] {
  const tireless = e.stats?.exertion === 0
  const lines = [
    [
      `生命 ${e.hp} · 移速 ${grid(e.speed)}/秒 · 接触伤害 ${e.damage}`,
      ...keysOf(e.stats ?? {})
        .filter((k) => !(k === 'exertion' && tireless))
        .map((k) => statText(k, e.stats![k]!)),
    ].join(' · '),
    `行为 ${DRIVE_LABEL[e.drive.kind]}${e.drive.kind === 'chase' && e.drive.at === 'leader' ? '（盯队长）' : ''} · 经验 ${e.xp} · 金币 ${e.coins}${e.kbImmune ? ' · 免疫击退' : ''}${tireless ? ' · 不知疲倦' : ''}`,
  ]
  for (const w of e.abilities ?? []) lines.push(`${abilityLabel(w)}：${abilityStatLines(w).join(' · ')}`)
  if (e.phasesWalls) lines.push('穿墙：穿得过的墙与岩石挡不住它，直取队伍')
  if (e.guardedBy) lines.push(`依存无敌：自己召出的${ENEMIES[e.guardedBy].name}还有一座活着，就打不动它`)
  if (e.mount) lines.push(`坐骑：先扛 ${e.mount.hp} 伤害，扣光后变成${e.forms?.[e.mount.form]?.name ?? '下马形态'}`)
  if (e.grow) lines.push(`成长：出生 ${e.grow.ms / 1000} 秒后还活着就长成${e.grow.into.name}`)
  if (e.onLethal) lines.push(`致命一击时不死，改为：${e.onLethal.map((x) => effectLine(x, true)).join('，')}`)
  if (e.onLowHp) lines.push(`生命第一次低于 ${Math.round(e.onLowHp.ratio * 100)}% 时：${e.onLowHp.effects.map((x) => effectLine(x, true)).join('，')}`)
  if (e.onIdle) lines.push(`${e.onIdle.ms / 1000} 秒没出手${e.onIdle.still ? '也没动' : ''}：${e.onIdle.effects.map((x) => effectLine(x, true)).join('，')}`)
  for (const [i, f] of (e.forms ?? []).entries()) {
    if (e.mount?.form === i && !f.abilities) continue
    const traits = [...(f.stats ? modTexts(f.stats) : []), f.anchored ? '原地不动' : ''].filter(Boolean).join(' · ')
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
    mapStaminaLine(m),
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
      entries: RARITY_ORDER.flatMap((r) => Object.values<ItemDef>(ITEMS).filter((i) => i.rarity === r)).map((i) => ({
        emoji: i.emoji,
        name: i.name,
        desc: itemLines(i).join(' · '),
        lines: [
          `道具 · ${RARITIES[i.rarity].label} · 价格 ${i.price} 金币 · ${i.maxStacks === undefined ? '无限堆叠' : i.maxStacks === 1 ? '唯一' : `上限 ${i.maxStacks} 件`}`,
          `${i.for ? `只刷给${i.for.map((t) => TRAIT_LABEL[t]).join('、')}角色` : '所有角色都能刷到'} · 角色经验 +${itemXp(i)}${i.minLevel && i.minLevel > 1 ? ` · ${i.minLevel} 级解锁` : ''}`,
        ],
      })),
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
