import { CHARACTERS, ROSTER_IDS, baseLoadout } from '../data/characters'
import { ELITE, ENEMIES, ENEMY_LIST, TENACITY } from '../data/enemies'
import { ELEMENT_IDS, ELEMENT_RULES, ELEMENTS, REACTIONS } from '../data/elements'
import type { ElementId } from '../types/elements'
import type { CharacterId } from '../types/characters'
import { AFFIX_IDS, AFFIXES } from '../data/affixes'
import { STATUSES } from '../data/statuses'
import type { AffixId } from '../types/affixes'
import type { Effect } from '../types/abilityDefs'
import type { BodyRules, EnemyDef, Tenacity } from '../types/enemies'
import type { LookCell, LookPuff, StatusAction, StatusDef, StatusForce, StatusLook, StatusMerge } from '../types/statuses'
import type { Span } from '../types/obstacles'
import { LAYER_M, overOf, STANDARD } from '../ecs/utils/pass'
import { MAP_IDS, MAPS, bossesOf } from '../data/maps'
import { PICKUPS } from '../data/pickups'
import { WEAPONS } from '../data/weapons'
import { ITEMS, RARITIES, RARITY_ORDER } from '../data/items'
import { modTexts, STATS, statText } from '../data/stats'
import { maxLevelOf } from '../data/levels'
import { keysOf } from '../util/record'
import type { ItemDef } from '../types/items'
import { abilityLabel, abilityStatLines, characterStatGroups, condLine, effectLine, elementLine, pct, sec, traitLine } from './statLines'
import { itemLines, TRAIT_LABEL } from './itemLines'
import { mapStaminaLine } from './mapLines'
import type { WikiEntry, WikiGroup } from '../types/wikiEntries'
import { rulesOf } from '../data/reactions'

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
  march: '朝某处行进',
}

function driveLabel(d: EnemyDef['drive']): string {
  if (d.kind === 'chase' && d.at === 'leader') return '追击（盯队长）'
  if (d.kind === 'orbit' && d.around === 'foe') return '绕人兜圈'
  return DRIVE_LABEL[d.kind]
}

const MAP_KIND_LABEL: Record<(typeof MAPS)[keyof typeof MAPS]['kind'], string> = {
  ruins: '残垣（山顶台地上塌了大半的石砌院落，四围枫林橙黄、一地落叶；墙按剩下的高度挡人、挡子弹、挡视线，看不见的敌人不会被自动瞄准、只剩淡影；封门的木板只有穿透的子弹打得过；冲锋、爆炸与几种技能能打出缺口，没了支撑的墙整片塌下，落石砸人·敌我通吃，碎石拖慢脚步，尘雾一时挡住视线；怪物从看不见的地方来）',
  volcano: '火山（32×32 以内崖壁围着的盆地；边上积雪的活火山挡路，隔两分半钟上下喷发一次，熔岩从火山口往四面八方流、把雪烧化，外围先凉、凝成岩石，盖住的地方敌我都挨烫；岩石凉透后雪又慢慢盖回来）',
  meadow: '草甸（开阔的草地，四周是针叶林、牧场的木栅栏和一道陡坡，坡上是更高的一层草甸；没有特殊规则）',
  sakura: '樱花（寺院外溪边的樱林空地，一面寺墙、三面樱林，地上落满樱花；一条斜斜的溪从石组间涌进来，漫过石槛、穿过竹栅流走；水流按浅水方程算出，站不住就顺水漂，漂到下游被压在竹栅前·敌我通吃，金币也堆在那里；溪上一座木桥，桥上不沾水）',
  amethyst: '紫晶洞（玄武岩里的巨型紫水晶晶洞，阳光从塌顶与顶缝照进来；光照随真实的昼夜变化，看得清的范围随之涨落；入夜点起火把，火光映得晶体一闪一闪；怪物只从暗处出来，白天从暗道深处；洞壁、晶簇与巨晶挡人挡子弹，碎晶坡走得慢）',
  nebula: '视界（空心星云的空腔，没有太阳；黑洞的万有引力作用于一切，周围那圈弯过来的光大致就是走不出来的地方，掉进视界被吞掉·敌我通吃，吞下的东西让它长大；壳层的引力把一切拉回空腔；流星从壳层甩出横穿空腔，撞上就挨打）',
  petri: '培养皿（微观视角，灯箱上的一只营养琼脂培养皿，圆形玻璃皿壁围着；菌落从划线接种的地方和皿壁边一刻不停地往外长，我方角色踩进去几乎走不动，敌人不受影响；攻击伤不了菌落，身体死在哪里就溶掉那一圈，皿壁边那一圈溶不干净；菌落长过的金币被盖住，清干净才捡得到）',
  exit: '出口（悬在虚空里的实验迷宫，舱室铺满方框，一般八到十一间，偶尔六七间更大的，舱与舱之间只隔一道缝、只能靠门往来；方框四边首尾相接，画面往四周循环平铺，往哪边看都是舱室；每间一个只进不出的入口、两三扇写着去处的门，门开在朝去处的墙上、箭头指着要飞去的方向，队长站上一扇门充满能，整支队伍连同召唤物顺着最近的路飞过虚空，落到那一间的入口上；路是单向的，从哪扇门来，那一间都没有门通回去；每间一扇「出口」，顺着出口走会走遍所有舱室再回到原处；只有队伍那间和刚走过的两间亮着、一间比一间暗，敌人只在这三间刷、会顺着门追过来，别的舱室全黑、只隐约看得见瓷砖，敌人定在原地；亮着的舱室里门定期把台上的敌人送走；舱室按象限分四季，颜色、出的敌人和标本罐里的东西各不相同；监控盯着队长；地砖按谁踩过亮起蓝或红）',
  desert: '沙漠（约 32×32、四边首尾相接的沙海，镜头跟着走看不到边；沙丘与标志物成对，分不清来没来过，标志物挡人、矮的跨得过，石堆挡低处的子弹；爬坡、松沙耗体力，背阴处回得快；走过留下印子，越累越深·敌我通吃，过一会儿就被风吹平）',
  floe: '浮冰（南极海上一块近似方形的浮冰，每局形状不同；积雪踩得住、光冰与新冰打滑，滑出冰缘落进冰水冻伤·敌我通吃；阵风刮来时新冰上站不住）',
  theater: '舞台（一座剧场的舞台，台面就是战场；地布上画的都能走，台上的布景片挡人，齐腰的矮布景子弹飞得过、头目跨得过，比人高的挡子弹和视线；隔一阵换一幕：台上暗下来，每个角色头上一束追光，角色被吊绳吊起、不能动不能打也不受伤，旧布景吊上去，地布与天幕从右往左推成新的一幅，地上的敌人与金币跟着被推进大幕退场、不算打倒，新布景吊下来，角色原地放下；春夏秋冬四幕轮着来，每幕两处风景连在一起）',
  deep: '深海（海底峡谷的谷底，头顶透下一层幽蓝的微光，灯照到的地方更亮；一艘潜艇停在谷底上，艇身挡人挡子弹，只有一侧开门；队员离开门口只能憋气，体力就是气，只在门口那一片补得回来，见底呛水掉血；潜艇隔一阵开到别处，开走的那一阵哪里都换不了气；海里的东西不用换气）',
}

/** 多少层高合多少米 */
function meters(layers: number): string {
  return `${+(layers * LAYER_M).toFixed(1)} 米`
}

/** 身段跟标准身体不一样时的说明 */
function spanLine([lo, hi]: Span): string | null {
  const over = overOf(lo, hi)
  const pass = over === overOf(...STANDARD) ? '' : over > 0 ? `；${meters(over)}以下的障碍${lo > 0 ? '从它底下过去' : '跨得过'}` : '；什么障碍都跨不过'
  if (lo > 0) return `悬空：离地 ${meters(lo)}，脚不沾地——熔岩、溪水与地上的毒池都碰不到它${pass}`
  if (hi < STANDARD[1]) return `矮：只有 ${meters(hi + 1)}高，打它的子弹压低了飞、更容易被矮东西挡下，齐胸飞的弹幕从它头上过去${pass}`
  if (hi > STANDARD[1]) return `高大：有 ${meters(hi + 1)}高，隔着矮墙也露得出上半截${pass}`
  return null
}

/** 形态的身段换了时的一个词 */
function spanTag(s: Span | undefined): string {
  if (!s) return ''
  const [lo, hi] = s
  return lo > 0 ? '悬空' : hi < STANDARD[1] ? '矮' : hi > STANDARD[1] ? '高大' : '标准身高'
}

/** 控制韧性的说法 */
function tenacityLine(t: Tenacity): string {
  return `被控制累计 ${sec(t.fillMs)}就解掉控制、霸体 ${sec(t.steadfastMs)}`
}

/** 身体的反应说成几行：致命、残血、闲着、死后、碰人、被碰、挨打、击杀、失巢 */
function reactionLines(r: BodyRules): string[] {
  const self = (fx: readonly Effect[]): string => fx.map((x) => effectLine(x, true)).join('，')
  const lines: string[] = []
  if (r.onLethal) lines.push(`致命一击时不死，改为：${self(r.onLethal)}`)
  for (const l of r.onLowHp ?? []) lines.push(`生命第一次低于 ${Math.round(l.ratio * 100)}% 时：${self(l.effects)}`)
  if (r.onIdle) lines.push(`${r.onIdle.ms / 1000} 秒没出手${r.onIdle.still ? '也没动' : ''}：${self(r.onIdle.effects)}`)
  for (const fx of r.onDeath ?? []) {
    if (fx.kind === 'split') lines.push(`死亡分裂 ${fx.count} 只${fx.into?.name ?? '普通的同类'}`)
    else if (fx.kind === 'decoy') lines.push(`死亡留半透明尸壳诱火 ${fx.durationMs / 1000} 秒`)
    else lines.push(`亡语：${effectLine(fx)}`)
  }
  for (const fx of r.onTouch ?? []) lines.push(`接触附加：${effectLine(fx)}`)
  for (const fx of r.onTouched ?? []) lines.push(`被碰到时：${effectLine(fx)}`)
  for (const fx of r.onHurt ?? []) lines.push(`挨打时：${effectLine(fx)}`)
  for (const fx of r.onKill ?? []) lines.push(`击杀时：${effectLine(fx)}`)
  for (const fx of r.onAnchorLost ?? []) lines.push(`失巢暴走：${effectLine(fx)}`)
  return lines
}

/** 精英词缀带几个 */
function affixCount(): string {
  const { min, max } = ELITE.affixes
  return min === max ? `${min}` : `${min}–${max}`
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
    `行为 ${driveLabel(e.drive)} · 经验 ${e.xp} · 金币 ${e.coins}${tireless ? ' · 不知疲倦' : ''}`,
    elementLine(e.element),
  ]
  lines.push(
    e.role === 'boss'
      ? `头目：不会成为精英；${tenacityLine(TENACITY.boss)}，韧性条在血条下面`
      : `成为精英时：属性更强、掉落更多，随机带 ${affixCount()} 个精英词缀；${tenacityLine(TENACITY.elite)}（见「精英词缀」页）`,
  )
  const traits = traitLine(e.traits, e.span)
  if (traits) lines.push(`特质：${traits}`)
  for (const w of e.abilities ?? []) lines.push(`${abilityLabel(w)}：${abilityStatLines(w).join(' · ')}`)
  if (e.gcdMs) lines.push(`出完一招 ${e.gcdMs / 1000} 秒内不出下一招`)
  for (const r of e.drives ?? []) lines.push(`${condLine(r.if)}时改为${driveLabel(r.drive)}`)
  for (const p of e.phases ?? []) {
    const enter = [p.drive ? `改为${driveLabel(p.drive)}` : '', p.element ? `元素转为${ELEMENTS[p.element].name}` : '', ...(p.stats ? modTexts(p.stats) : []), ...(p.effects ?? []).map((x) => effectLine(x, true))].filter(Boolean)
    lines.push(`阶段${p.name ? `「${p.name}」` : ''}：生命低于 ${Math.round(p.below * 100)}% 进入${enter.length > 0 ? `，${enter.join('，')}` : ''}`)
    for (const w of p.abilities ?? []) lines.push(`  ${abilityLabel(w)}：${abilityStatLines(w).join(' · ')}`)
  }
  const span = e.span ? spanLine(e.span) : null
  if (span) lines.push(span)
  if (e.traits?.includes('phases')) lines.push('穿墙：穿得过的墙与岩石挡不住它，直取队伍')
  if (e.guardedBy) lines.push(`依存无敌：自己召出的${ENEMIES[e.guardedBy].name}还有一座活着，就打不动它`)
  if (e.mount) lines.push(`坐骑：先扛 ${e.mount.hp} 伤害，扣光后变成${e.forms?.[e.mount.form]?.name ?? '下马形态'}`)
  if (e.grow) lines.push(`成长：出生 ${e.grow.ms / 1000} 秒后还活着就长成${e.grow.into.name}`)
  for (const [i, f] of (e.forms ?? []).entries()) {
    if (e.mount?.form === i && !f.abilities) continue
    const parts = [...(f.stats ? modTexts(f.stats) : []), f.traits ? `特质换成${traitLine(f.traits, f.span) || '无'}` : '', f.element ? `元素换成${ELEMENTS[f.element].name}` : '', spanTag(f.span)].filter(Boolean).join(' · ')
    lines.push(`形态「${f.name ?? e.name}」${parts ? `：${parts}` : ''}`)
    for (const w of f.abilities ?? []) lines.push(`  ${abilityLabel(w)}：${abilityStatLines(w).join(' · ')}`)
  }
  lines.push(...reactionLines(rulesOf(e)))
  if (e.spawner) {
    lines.push(`巢穴：每 ${e.spawner.intervalMs / 1000} 秒生成 ${e.spawner.count} 只${e.spawner.into.name}`)
  }
  return lines
}

function mapStatLines(id: (typeof MAP_IDS)[number]): string[] {
  const m = MAPS[id]
  const names = m.foes.map((k) => ENEMIES[k].name)
  const count = new Map<ElementId, number>()
  for (const k of [...m.foes, ...m.bosses]) {
    const el = ENEMIES[k].element
    if (el) count.set(el, (count.get(el) ?? 0) + 1)
  }
  return [
    `世界规则 ${MAP_KIND_LABEL[m.kind]}`,
    mapStaminaLine(m),
    `头目 ${bossesOf(id).map((b) => b.name).join('、')}`,
    `出没敌人 ${names.join('、')}`,
    ...(count.size > 0 ? [`敌人的元素 ${[...count].map(([el, n]) => `${ELEMENTS[el].name}×${n}`).join('、')}`] : []),
  ]
}

/** 精英词缀页的第一条：精英是怎么回事 */
function eliteEntry(): WikiEntry {
  return {
    emoji: '2b50',
    name: '精英',
    desc: `小怪都可能以精英出现：更强、给得更多，出生时从 ${AFFIX_IDS.length} 个词缀里随机带 ${affixCount()} 个不重样的，每个词缀都看得出来：身上的样子、个头、元素，或者挨打、倒下时的反应`,
    lines: [
      `属性：${modTexts(ELITE.stats).join(' · ')}`,
      `掉落：经验 ×${ELITE.xpMul} · 金币 ×${ELITE.coinsMul}`,
      `控制韧性：${tenacityLine(TENACITY.elite)}；打断一次蓄力或连发也记 ${sec(TENACITY.interruptMs)}，不被控制时 ${sec(TENACITY.drainMs)}回落到空`,
      `词缀：${AFFIX_IDS.map((id) => AFFIXES[id].name).join('、')}，各自的效果见本页其余各条`,
      '头目不会成为精英',
    ],
  }
}

/** 一个精英词缀：属性与反应都从词缀表来 */
function affixEntry(id: AffixId): WikiEntry {
  const a = AFFIXES[id]
  return {
    emoji: a.icon,
    name: a.name,
    desc: a.desc,
    lines: [
      ...(a.element ? [`本身变成${ELEMENTS[a.element].name}：${ELEMENTS[a.element].body}`] : []),
      ...(a.look ? [lookLine(a.look, false)] : []),
      ...(a.stats ? [`属性：${modTexts(a.stats).join(' · ')}`] : []),
      ...reactionLines(rulesOf({ emoji: a.icon, name: a.name, reactions: a.reactions })),
      `成为精英的小怪随机带 ${affixCount()} 个不重样的词缀，这是其中一个；头目不会带`,
    ],
  }
}

const ACTION_LABEL: Record<StatusAction, string> = { move: '走', act: '普通出手', cast: '放技能', dash: '冲刺、跳跃、闪现', touch: '接触伤人' }

const FORCE_LABEL: Record<StatusForce['kind'], string> = { flee: '背离施加者逃跑', approach: '朝施加者走过去', taunted: '追着嘲讽它的人打' }

const SAME_STRENGTH = '强度一样的只延长时间；不一样的各算各的、各自到期，生效时取'

const MERGE_LABEL: Record<StatusMerge, string> = {
  high: `${SAME_STRENGTH}参数最大的那条`,
  low: `${SAME_STRENGTH}参数最小（最强）的那条`,
  rate: `${SAME_STRENGTH}每秒伤害最高的那条`,
  bySource: '按施加者分开记，生效的是施加者还在的里面最晚到期的那条',
}

/** 一种状态的规则，从状态表的字段说出来 */
const CELL_LABEL: Readonly<Record<LookCell, string>> = { ice: '整个包进一块冰', bubble: '罩着一层护罩', glow: '身后泛着光', star: '头上绕着星星', zee: '头上冒 Z', heart: '头上冒心', drop: '冒汗', spikes: '身上一圈尖刺' }
const COMIC_LABEL: Readonly<Record<NonNullable<StatusLook['comic']>, string>> = { stars: '头上绕着星星', zzz: '头上往上飘 Z', hearts: '头上往上飘心' }
const PUFF_LABEL: Readonly<Record<LookPuff | 'element', string>> = { flame: '冒火苗', toxic: '冒绿泡', drip: '往下滴水', frost: '冒寒气', zap: '冒电火花', mend: '冒绿色的光点', dust: '扬起尘土', fuse: '冒火星', blood: '冒血珠', element: '冒那种元素的粒子' }
const FROM_LABEL = { body: '身上', head: '头顶', feet: '脚下' } as const

/** 在身上的样子：tinted 是身上还染着色 */
function lookLine(l: StatusLook | undefined, tinted: boolean): string {
  if (!l) return '样子：看不出来'
  const parts = [
    tinted ? '身上染色' : '',
    l.wrap ? CELL_LABEL[l.wrap.cell] : '',
    l.comic ? COMIC_LABEL[l.comic] : '',
    l.shackle !== undefined ? '脚下拴着一圈' : '',
    l.guardArc !== undefined ? '身前地上一道弧' : '',
    l.sigil !== undefined ? '脚下转着一圈法印' : '',
    l.emit ? `${FROM_LABEL[l.emit.from]}${PUFF_LABEL[l.emit.puff]}` : '',
  ].filter(Boolean)
  return `样子：${parts.length > 0 ? parts.join('，') : '看行为就知道'}`
}

function statusLines(st: StatusDef): string[] {
  const lines: string[] = []
  if (st.cc) lines.push('控制：霸体挡得住，施加霸体或净化时解掉；头目与精英被控制会累进韧性条')
  else if (st.cleansable) lines.push('净化能解掉')
  if (st.blocks) lines.push(`封住：${st.blocks.map((b) => ACTION_LABEL[b]).join('、')}`)
  if (st.forces) lines.push(`逼着${FORCE_LABEL[st.forces.kind]}${st.forces.pace === 1 ? '' : `（速度 ×${st.forces.pace}）`}`)
  if (st.wander) lines.push(`自己慢慢乱逛（速度 ×${st.wander}）`)
  if (st.stat) lines.push(`影响的属性：${STATS[st.stat.key].name}`)
  const flags = [
    st.untargetable ? '谁也选不中' : '',
    st.untouchable ? '什么都落不到身上，持续伤害也不行' : '',
    st.invulnerable ? '带伤害的一下打不进来，持续伤害照样' : '',
    st.hidden ? '看不见，显形让它失效' : '',
    st.reveals ? '让隐匿与潜行失效' : '',
    st.steadfast ? '控制、被摆布、打断都不吃' : '',
    st.turncoat ? '把自己人当敌人' : '',
    st.halts ? '姿态与产出都停住' : '',
    st.interrupts ? '中了就打断正在蓄的力与连发' : '',
    st.pinned ? '身上的状态满了也不会被顶掉' : '',
  ].filter(Boolean)
  if (flags.length > 0) lines.push(flags.join('；'))
  const again = st.merge ? MERGE_LABEL[st.merge] : st.keyed ? '按来源分开记，同一来源的只延长时间' : '只延长时间（取更长的），参数用新的'
  lines.push(`再中一次：${again}`)
  lines.push(lookLine(st.look, st.tint !== undefined))
  return lines
}

/** 有图鉴图标的状态，按图标的先后排 */
function statusEntries(): WikiEntry[] {
  return Object.values<StatusDef>(STATUSES)
    .flatMap((st) => (st.icon ? [{ st, icon: st.icon }] : []))
    .sort((a, b) => a.icon.rank - b.icon.rank)
    .map(({ st, icon }) => ({ emoji: icon.emoji, name: st.name, desc: st.desc, lines: statusLines(st) }))
}

function flatten(groups: readonly { title: string; lines: readonly string[] }[]): string[] {
  return groups.flatMap((g) => [`◆ ${g.title}`, ...g.lines])
}

/** 一名角色的图鉴条目：1 级到他的等级上限各一页 */
function characterEntry(id: CharacterId): WikiEntry {
  return {
    emoji: CHARACTERS[id].emoji,
    name: CHARACTERS[id].name,
    desc: CHARACTERS[id].desc,
    lines: flatten(characterStatGroups(id, [], 1, { path: false })),
    levels: Array.from({ length: maxLevelOf(id) }, (_, i) => i + 1).map((lv) => ({
      label: `${lv} 级`,
      lines: flatten(characterStatGroups(id, [], lv, { path: false })),
    })),
  }
}

function enemyEntry(e: EnemyDef): WikiEntry {
  return { emoji: e.emoji, name: e.role === 'boss' ? `${e.name}（Boss）` : e.name, desc: e.desc, lines: enemyStatLines(e) }
}

/** 元素页的第一条：各元素留在身上的状态与反应的规则 */
function elementRulesEntry(): WikiEntry {
  const { burn, chill, shock, wet, poison } = ELEMENT_RULES
  return {
    emoji: '1f308',
    name: '元素与反应',
    desc: '带元素的一下打在身上，留下这种元素的状态，或者和身上已有的起反应；不带元素的一下是物理。元素之间没有克制倍率，身体本身是哪种元素就免疫哪种',
    lines: [
      `燃烧：每 ${sec(burn.tickMs)} 掉点燃那一下 ${pct(burn.ratio)} 的血，烧 ${sec(burn.durationMs)}，再点跳伤取大的、延长时间；每跳一次烧到身体相距 ${grid(burn.spread)} 内、没在烧的同伴`,
      `寒冷：每挨一下冰加一层，移速 ×${chill.slow}，${sec(chill.ms)} 不再挨冰就散；叠到 ${chill.stacks} 层冻住 ${sec(chill.frozenMs)}`,
      `电：打断挨打的出手（记进韧性），再跳到 ${grid(shock.radius)} 内最近的另一个敌人，吃这一下 ${pct(shock.ratio)}`,
      `湿：浇湿 ${sec(wet.ms)}；本身是水的、泡在水里的一直是湿的`,
      `中毒：每挨一下毒加一层，每层每 ${sec(poison.tickMs)} 掉那一下 ${pct(poison.ratio)} 的血，最多 ${poison.stacks} 层，满了以后更强的一层顶掉平均的一层，${sec(poison.durationMs)} 不再中毒就解；中了毒什么回复都不管用`,
      '持续伤害的一跳不沾元素，也不起反应',
      ...REACTIONS.map((r) => `${r.name}：${r.desc}`),
    ],
  }
}

/** 一种元素：打中会怎样、本身是它免疫什么 */
function elementEntry(id: ElementId): WikiEntry {
  const el = ELEMENTS[id]
  return { emoji: el.icon, name: `${el.name}元素`, desc: el.desc, lines: [`身体本身是${el.name}：${el.body}`] }
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
    { icon: '1f939', title: '角色', entries: ROSTER_IDS.map(characterEntry) },
    { icon: '1f9df', title: '敌人', entries: ENEMY_LIST.map(enemyEntry) },
    { icon: '1f308', title: '元素', entries: [elementRulesEntry(), ...ELEMENT_IDS.map(elementEntry)] },
    {
      icon: '2b50',
      title: '精英词缀',
      entries: [eliteEntry(), ...AFFIX_IDS.map(affixEntry)],
    },
    {
      icon: '1f4ab',
      title: '状态',
      entries: statusEntries(),
    },
    {
      icon: '1f6e1',
      title: '道具',
      entries: RARITY_ORDER.flatMap((r) => Object.values<ItemDef>(ITEMS).filter((i) => i.rarity === r)).map((i) => ({
        emoji: i.emoji,
        name: i.name,
        desc: itemLines(i).join(' · '),
        lines: [
          `队伍道具 · ${RARITIES[i.rarity].label} · 价格 ${i.price} 金币 · ${i.maxStacks === undefined ? '全队不限件数' : i.maxStacks === 1 ? '全队唯一' : `全队最多 ${i.maxStacks} 件`}`,
          i.for ? `只对${i.for.map((t) => TRAIT_LABEL[t]).join('、')}角色有用` : '对场上每个人都有用',
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
      if (w.held) used.add(w.held.look.emoji)
      if (w.shape.kind === 'bolt') used.add(w.shape.projectile.look.emoji)
    }
  }
  for (const c of Object.values(CHARACTERS)) for (const f of c.forms ?? []) if (f.emoji) used.add(f.emoji)
  for (const e of Object.values(ENEMIES)) {
    for (const f of e.forms ?? []) if (f.emoji) used.add(f.emoji)
    for (const w of e.abilities ?? []) {
      if (w.shape.kind === 'bolt') used.add(w.shape.projectile.look.emoji)
      if (w.shape.kind === 'drop') used.add(w.shape.look.emoji)
    }
  }
  used.add(PICKUPS.coin.emoji)
  return used
}
