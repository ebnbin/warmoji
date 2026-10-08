import type { SfxId } from '../types/sfx'

/** 模拟发给表现层的事：只说发生了什么，怎么演归表现层；at 是世界时钟、fxAt 是画面时钟，都取发生的那一刻 */
export type SimEvent =
  /** 扣了血：扣多少、暴击没有、挨打的是不是队员 */
  | { readonly kind: 'damage'; readonly x: number; readonly y: number; readonly amount: number; readonly crit: boolean; readonly team: boolean; readonly fxAt: number }
  /** 挨了一下还活着；tint 是队员闪的颜色，没有用默认 */
  | { readonly kind: 'flinch'; readonly eid: number; readonly uid: number; readonly team: boolean; readonly tint: number | undefined; readonly at: number; readonly fxAt: number }
  /** 这一场伤不了的一下 */
  | { readonly kind: 'shrug'; readonly eid: number; readonly uid: number; readonly at: number }
  /** 躲开了一下 */
  | { readonly kind: 'dodge'; readonly x: number; readonly y: number; readonly fxAt: number }
  /** 队员身上亮一下：入队、升级、全队增益、捡到道具 */
  | { readonly kind: 'glow'; readonly eid: number; readonly uid: number; readonly color: number; readonly ms: number; readonly fxAt: number }
  /** 倒下的队员落回队伍 */
  | { readonly kind: 'rejoin'; readonly eid: number; readonly uid: number; readonly fxAt: number }
  /** 能力出手；sfx 是它出手的声音 */
  | { readonly kind: 'fire'; readonly sfx: SfxId }
  /** 捡起了道具；sfx 是它的声音 */
  | { readonly kind: 'pickup'; readonly sfx: SfxId }
  | { readonly kind: 'kill' }
  /** 预兆响亮的敌人现身 */
  | { readonly kind: 'loudSpawn' }
  /** 跳过去落地砸中 */
  | { readonly kind: 'slam' }
  /** 不靠升级道具的一局里全队升了级 */
  | { readonly kind: 'teamLevel' }
  /** 地上掉了升级道具 */
  | { readonly kind: 'levelUpDrop' }
  | { readonly kind: 'coins' }
  /** 守住一处据点、到过一处地点 */
  | { readonly kind: 'goal' }
