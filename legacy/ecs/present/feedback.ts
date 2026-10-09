import { REJOIN } from '../../data/feel'
import { CharFlash, Flash, Pop, Tint, Uid } from '../components'
import { MISS, pushDamageNumber } from './damageNumbers'
import type { DamageNumbers } from './damageNumbers'
import type { SimEvent } from '../events'
import type { SfxId } from '../../types/sfx'

/** 演出要用到的：播音效、震屏、伤害数字（关掉时没有） */
export interface Show {
  readonly sfx: (id: SfxId) => void
  readonly shake: () => void
  readonly numbers: DamageNumbers | null
}

/** 敌人挨打闪白的时长，世界时钟 */
const FLASH_MS = 70
/** 队员挨打闪色的时长，画面时钟 */
const HURT_GLOW_MS = 120
const HURT_TINT = 0xff7777

function unhandled(e: never): never {
  throw new Error(`模拟发出的事没有演法：${JSON.stringify(e)}`)
}

function flash(eid: number, at: number): void {
  Flash.until[eid] = at + FLASH_MS
  Tint.effect[eid] = 1
  Tint.color[eid] = 0xffffff
}

function glow(eid: number, color: number, until: number): void {
  CharFlash.until[eid] = until
  Tint.color[eid] = color
  Tint.effect[eid] = 0
}

/** 把模拟发出的事演出来：声音、伤害数字、震屏、挨打与增益的闪色、落地回弹；身体已经换了人的只出声不闪 */
export function feedback(events: readonly SimEvent[], show: Show): void {
  for (const e of events) {
    switch (e.kind) {
      case 'damage':
        if (e.team) show.shake()
        else if (show.numbers) pushDamageNumber(show.numbers, e.x, e.y - 14, e.amount, e.crit, e.fxAt)
        break
      case 'dodge':
        if (show.numbers) pushDamageNumber(show.numbers, e.x, e.y - 14, MISS, false, e.fxAt)
        break
      case 'flinch':
        show.sfx(e.team ? 'hurt' : 'hit')
        if (Uid.v[e.eid] !== e.uid) break
        if (e.team) glow(e.eid, e.tint ?? HURT_TINT, e.fxAt + HURT_GLOW_MS)
        else flash(e.eid, e.at)
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
}
