import type { EndRule } from '../types/runs'

/** 失败条件：到点就输的时限、倒下的次数、带 lose 的地图事件与读数、漏过的敌人；其余都是达成条件 */
export function isLose(e: EndRule): boolean {
  switch (e.kind) {
    case 'time':
    case 'event':
    case 'gauge':
      return e.lose === true
    case 'downs':
    case 'leak':
      return true
    default:
      return false
  }
}
