import { hasComponent } from 'bitecs'
import { REJOIN } from '../../data/feel'
import { ELEMENTS, elementAt, REACTIONS } from '../../data/elements'
import { CharFlash, Elem, Enemy, Flash, Pop, Tint, Uid } from '../components'
import { MISS, pushDamageNumber, reactionLabel } from './damageNumbers'
import type { DamageNumbers } from './damageNumbers'
import { HIT_CUE, pushHitCue } from './hitCues'
import type { HitCues } from './hitCues'
import type { SimEvent } from '../events'
import type { EcsWorld } from '../world'
import type { SfxId } from '../../types/sfx'

/** 演出要用到的：播音效、震屏、顿帧、伤害数字（关掉时没有）、打中时的指示、让技能钮跟着亮 */
export interface Show {
  readonly world: EcsWorld
  readonly sfx: (id: SfxId) => void
  readonly shake: () => void
  /** 主动技能放出的那一刻，技能钮用这个颜色亮一下 */
  readonly skill: (color: number) => void
  /** 战局停 ms 毫秒，画面跟着停 */
  readonly stop: (ms: number) => void
  readonly numbers: DamageNumbers | null
  readonly cues: HitCues
  /** 主动技能放出后多久之内打中才顿帧（画面时钟）：只顿一次，召唤物、留下的场后来打中的不顿 */
  readonly pace: { skillUntil: number }
}

/** 敌人挨打闪白的时长，世界时钟 */
const FLASH_MS = 70
/** 打中队员的敌人整个闪红的时长，世界时钟：看得出是谁打的 */
const BLAME_MS = 140
const BLAME_TINT = 0xff3d3d
/** 队员挨打闪色的时长，画面时钟 */
const HURT_GLOW_MS = 120
const HURT_TINT = 0xff7777
/** 队员挨打：数字、来向的一弧与火花的颜色 */
const HURT_COLOR = 0xff5252
/** 看不见出手、打在队员身上的一下补的那道光 */
const FOE_TRACE = 0xff6e40
const PLAIN = 0xffffff
/** 元素色往白里调这么多：深色的数字在暗地面上也看得清 */
const NUMBER_LIGHTEN = 0.4
/** 放主动技能的队员按自己的元素亮这么久，没有元素的亮金色；画面时钟 */
const SKILL_GLOW_MS = 360
const SKILL_COLOR = 0xffe082
/** 元素反应的名字飘在挨打处上方这么高 */
const REACT_RISE = 44

/** 顿帧的毫秒数：精英与头目倒下、队员一下掉 heavyShare 以上的血、主动技能放出后 skillWindow 毫秒内打中 */
const STOP = { strongKill: 90, heavyHurt: 60, heavyShare: 0.12, skill: 45, skillWindow: 400 } as const

function unhandled(e: never): never {
  throw new Error(`模拟发出的事没有演法：${JSON.stringify(e)}`)
}

function lighten(rgb: number, k: number): number {
  const ch = (shift: number): number => {
    const v = (rgb >> shift) & 0xff
    return Math.round(v + (0xff - v) * k) << shift
  }
  return ch(16) | ch(8) | ch(0)
}

/** 这一下的颜色：带元素的按元素，否则白 */
function strikeColor(element: number): number {
  const el = elementAt(element)
  return el ? lighten(ELEMENTS[el].color, NUMBER_LIGHTEN) : PLAIN
}

function flash(eid: number, at: number): void {
  Flash.until[eid] = at + FLASH_MS
  Tint.effect[eid] = 1
  Tint.color[eid] = 0xffffff
}

/** 打中队员的敌人整个闪红；出手的不是敌人身体（场地、已经倒下的）就不闪 */
function blame(world: EcsWorld, eid: number, uid: number, at: number): void {
  if (eid < 0 || Uid.v[eid] !== uid || !hasComponent(world, eid, Enemy)) return
  Flash.until[eid] = at + BLAME_MS
  Tint.effect[eid] = 1
  Tint.color[eid] = BLAME_TINT
}

function glow(eid: number, color: number, until: number): void {
  CharFlash.until[eid] = until
  Tint.color[eid] = color
  Tint.effect[eid] = 0
}

/** 扣血：数字按元素着色、队员的是红的；队员挨打时震屏、身边一弧指向来处、出手的敌人闪红；有来向的顺着来向迸火花，看不见出手的补一道光；返回要顿帧多久 */
function damage(e: Extract<SimEvent, { kind: 'damage' }>, show: Show): number {
  const color = e.team ? HURT_COLOR : strikeColor(e.element)
  if (show.numbers) pushDamageNumber(show.numbers, e.x, e.y - 14, e.amount, e.crit, color, e.fxAt)
  const from = e.trace ?? e.from
  if (from) pushHitCue(show.cues, HIT_CUE.spark, e.x, e.y, from.x, from.y, color, e.fxAt)
  if (e.trace) pushHitCue(show.cues, HIT_CUE.trace, e.x, e.y, e.trace.x, e.trace.y, e.team ? FOE_TRACE : color, e.fxAt)
  if (!e.team) {
    if (!e.skill || e.fxAt > show.pace.skillUntil) return 0
    show.pace.skillUntil = -Infinity
    return STOP.skill
  }
  show.shake()
  if (e.from) pushHitCue(show.cues, HIT_CUE.hurt, e.x, e.y, e.from.x, e.from.y, HURT_COLOR, e.fxAt, e.eid, e.uid)
  blame(show.world, e.by, e.byUid, e.at)
  return e.share >= STOP.heavyShare ? STOP.heavyHurt : 0
}

/** 把模拟发出的事演出来：声音、伤害数字与打中的指示、震屏与顿帧、挨打与增益的闪色、落地回弹；身体已经换了人的只出声不闪 */
export function feedback(events: readonly SimEvent[], show: Show): void {
  let stop = 0
  // 技能当场打中的几下排在放出这件事前面
  for (const e of events) if (e.kind === 'skill') show.pace.skillUntil = e.fxAt + STOP.skillWindow
  for (const e of events) {
    switch (e.kind) {
      case 'damage':
        stop = Math.max(stop, damage(e, show))
        break
      case 'dodge':
        if (show.numbers) pushDamageNumber(show.numbers, e.x, e.y - 14, MISS, false, PLAIN, e.fxAt)
        break
      case 'react':
        if (show.numbers) pushDamageNumber(show.numbers, e.x, e.y - REACT_RISE, reactionLabel(e.reaction), false, REACTIONS[e.reaction]!.color, e.fxAt)
        break
      case 'skill': {
        const el = elementAt(Elem.v[e.eid]!)
        const color = el ? ELEMENTS[el].color : SKILL_COLOR
        show.skill(color)
        if (Uid.v[e.eid] === e.uid) glow(e.eid, color, e.fxAt + SKILL_GLOW_MS)
        break
      }
      case 'flinch':
        show.sfx(e.team ? 'hurt' : 'hit')
        if (Uid.v[e.eid] !== e.uid) break
        if (e.team) glow(e.eid, e.tint ?? HURT_TINT, e.fxAt + HURT_GLOW_MS)
        else if (Flash.until[e.eid] === 0 || Tint.color[e.eid] !== BLAME_TINT) flash(e.eid, e.at)
        break
      case 'shrug':
        if (Uid.v[e.eid] === e.uid) flash(e.eid, e.at)
        break
      case 'glow':
        if (Uid.v[e.eid] === e.uid) glow(e.eid, e.color, e.fxAt + e.ms)
        break
      case 'rejoin':
        show.sfx('revive')
        if (Uid.v[e.eid] !== e.uid) break
        Pop.until[e.eid] = e.fxAt + REJOIN.bounceMs
        Pop.ms[e.eid] = REJOIN.bounceMs
        break
      case 'fire':
      case 'pickup':
        show.sfx(e.sfx)
        break
      case 'kill':
        show.sfx('kill')
        if (e.strong) stop = Math.max(stop, STOP.strongKill)
        break
      case 'loudSpawn':
      case 'slam':
        show.sfx('boom')
        break
      case 'teamLevel':
        show.sfx('levelup')
        break
      case 'levelUpDrop':
      case 'goal':
        show.sfx('upgrade')
        break
      case 'coins':
        show.sfx('coin')
        break
      default:
        return unhandled(e)
    }
  }
  if (stop > 0) show.stop(stop)
}
