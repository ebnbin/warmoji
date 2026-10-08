import type { SfxId } from './sfx'
import type { GroundEffectDef, ZoneRules } from './groundEffects'
import type { EnemyDef, EnemyKind } from './enemies'
import type { StatusId } from './statuses'
import type { ElementId } from './elements'

/** 外观：用哪张图、显示多大（格）；rotationOffsetDeg 是图里尖头的朝向与出手方向差几度 */
export interface Look {
  readonly emoji: string
  readonly size: number
  readonly rotationOffsetDeg?: number
}
/** 弹体的飞法：不写是直飞；homing 每秒最多转 degPerSec 度转向最近的敌人；arc 从出手处抛向瞄准的地方，最高处比两头的连线高出 peakM 米，越过比它矮的障碍，落下来才打得到身体 */
export type Flight = { readonly kind: 'homing'; readonly degPerSec: number } | { readonly kind: 'arc'; readonly peakM: number }
/** 分裂：打中身体或飞完时裂成 count 发，在 spreadDeg 内散开，伤害 × ratio；裂出来的不再裂 */
export interface Split {
  readonly count: number
  readonly spreadDeg: number
  readonly ratio: number
}
interface ProjectileBase {
  readonly look: Look
  readonly radius: number
  readonly speed: number
  readonly flight?: Flight
}
/** linger：飞完不消失，落在地上 ms，等着被召回；落地的与分裂的二选一 */
type ProjectileSpec = ProjectileBase & ({ readonly linger?: number; readonly split?: never } | { readonly linger?: never; readonly split?: Split })
/** 拿在手里的武器：restOffset 是离持有者中心多远，mountSide 与 mountGap 是偏在哪一侧、偏多远，弹体也从这里出手 */
export interface HeldVisual {
  readonly look: Look
  readonly restOffset: number
  readonly mountSide?: -1 | 1
  readonly mountGap?: number
}
interface BlastRing {
  readonly color: number
  readonly fillAlpha: number
  readonly lineWidth: number
  readonly lineAlpha: number
  readonly durMs: number
}
interface BlastEffect {
  readonly kind: 'blast'
  readonly radius: number
  readonly ratio: number
  readonly knockback: number
  readonly ring?: BlastRing
  /** 破坏力：炸掉多少立方米的完好砌体（按材质的强度折算） */
  readonly breach?: number
}
interface SlowEffect {
  readonly kind: 'slow'
  readonly factor: number
  readonly durationMs: number
}
/** 中毒：每 tickMs 掉 damage 加基础伤害 ratio 倍的血 */
interface PoisonEffect {
  readonly kind: 'poison'
  readonly damage: number
  readonly ratio?: number
  readonly tickMs: number
  readonly durationMs: number
}
interface GroundZone {
  readonly kind: 'ground'
  readonly def: GroundEffectDef
}
interface MorphEffect {
  readonly kind: 'morph'
  readonly durationMs: number
  readonly morphEmoji: string
  readonly vulnMul?: number
}
interface SpawnProjectileEffect {
  readonly kind: 'spawnProjectile'
  readonly projectile: ProjectileSpec
  readonly damage: number
  readonly lifeMs: number
  readonly aim: 'nearest'
  readonly onHit?: readonly Effect[]
}
/** 有目标列表时治列表里的人（全体或血量比例最低者），否则治落点周围 range 内的同伴 */
interface HealEffect {
  readonly kind: 'heal'
  readonly amount: number
  readonly scope?: 'all' | 'lowest'
  readonly ratio?: number
  readonly range?: number
}
interface AttackSlowEffect {
  readonly kind: 'attackSlow'
  readonly mul: number
  readonly durationMs: number
}
/** 倍率增益：不写 durationMs 就是永久 */
interface BuffEffect {
  readonly kind: 'buff'
  readonly damageMul?: number
  readonly speedMul?: number
  readonly durationMs?: number
}
/** 直接造成一笔伤害：amount 加上基础伤害的 ratio 倍 */
interface DamageEffect {
  readonly kind: 'damage'
  readonly amount: number
  readonly ratio?: number
}
/** 按目标当前生命的比例造成伤害，首领与精英按 bossRatio */
interface HpDamageEffect {
  readonly kind: 'hpDamage'
  readonly ratio: number
  readonly bossRatio: number
}
/** 定身：失去行动 */
interface StunEffect {
  readonly kind: 'stun'
  readonly durationMs: number
}
/** 力竭：体力清空 */
interface ExhaustEffect {
  readonly kind: 'exhaust'
}
/** 隐匿：敌人看不见 */
interface HideEffect {
  readonly kind: 'hide'
  readonly durationMs: number
}
/** 嘲讽：目标只看得见施法者 */
interface TauntEffect {
  readonly kind: 'taunt'
  readonly durationMs: number
}
interface GuardEffect {
  readonly kind: 'guard'
  readonly mul: number
  readonly durationMs: number
}
interface ReviveEffect {
  readonly kind: 'revive'
}
interface HealRatioEffect {
  readonly kind: 'healRatio'
  readonly ratio: number
}
interface InvulnEffect {
  readonly kind: 'invuln'
  readonly ms: number
}
interface ReviveCutEffect {
  readonly kind: 'reviveCut'
  readonly ms: number
}
interface TimeStopEffect {
  readonly kind: 'timeStop'
  readonly durationMs: number
}
interface CoinsEffect {
  readonly kind: 'coins'
  readonly count: number
}
/** 结息：队伍按手上金币的 ratio 倍得金币，最多 max */
interface InterestEffect {
  readonly kind: 'interest'
  readonly ratio: number
  readonly max: number
}
/** 消散：目标身体不算击杀地移除，自爆者对自己用 */
interface VanishEffect {
  readonly kind: 'vanish'
}
/** 定身：走不了、位移不了，还能出手 */
interface RootEffect {
  readonly kind: 'root'
  readonly durationMs: number
}
/** 沉默：放不了技能，普通出手照旧 */
interface SilenceEffect {
  readonly kind: 'silence'
  readonly durationMs: number
}
/** 致盲缴械：普通出手与接触都打不出去，技能照旧 */
interface DisarmEffect {
  readonly kind: 'disarm'
  readonly durationMs: number
}
/** 禁锢：做不了冲刺、跳跃、闪现这类自己的位移 */
interface GroundedEffect {
  readonly kind: 'grounded'
  readonly durationMs: number
}
/** 睡眠：什么都做不了，挨一下就醒，醒来那一下伤害 × wakeMul */
interface SleepEffect {
  readonly kind: 'sleep'
  readonly durationMs: number
  readonly wakeMul: number
}
/** 恐惧：背离施加者逃跑，做不了别的 */
interface FearEffect {
  readonly kind: 'fear'
  readonly durationMs: number
}
/** 魅惑：朝施加者走去，做不了别的 */
interface CharmEffect {
  readonly kind: 'charm'
  readonly durationMs: number
}
/** 倒戈：把自己人当敌人打，接触也伤自己人 */
interface BerserkEffect {
  readonly kind: 'berserk'
  readonly durationMs: number
}
/** 静止：无敌、不可选中、什么都做不了 */
interface StasisEffect {
  readonly kind: 'stasis'
  readonly durationMs: number
}
/** 不可选中：谁也打不到它，它自己照常行动 */
interface UntargetableEffect {
  readonly kind: 'untargetable'
  readonly durationMs: number
}
/** 霸体：先解除身上的控制，期间免疫控制与被摆布 */
interface UnstoppableEffect {
  readonly kind: 'unstoppable'
  readonly durationMs: number
}
/** 净化：解除身上的控制与减速 */
interface CleanseEffect {
  readonly kind: 'cleanse'
}
/** 法术护盾：挡下接下来 count 次命中 */
interface SpellShieldEffect {
  readonly kind: 'spellShield'
  readonly count: number
  readonly durationMs: number
}
/** 正面格挡：来自朝向前方 arcDeg 以内的命中全部挡下，弹体在正面碎掉 */
interface FrontGuardEffect {
  readonly kind: 'frontGuard'
  readonly arcDeg: number
  readonly durationMs: number
}
/** 揭示：隐匿与潜行失效 */
interface RevealEffect {
  readonly kind: 'reveal'
  readonly durationMs: number
}
/** 潜行：看不见，直到自己出手；不写时长就一直潜着 */
interface StealthEffect {
  readonly kind: 'stealth'
  readonly durationMs?: number
}
/** 不死：生命不会降到 1 以下 */
interface UndyingEffect {
  readonly kind: 'undying'
  readonly durationMs: number
}
/** 招架：挡下所有命中，并对出手的身体施加 then */
interface ParryEffect {
  readonly kind: 'parry'
  readonly durationMs: number
  readonly then: readonly Effect[]
}
/** 拉拽：把目标拉到施法者身前 gap 处；拉不动（锚定）时，heavy 为 self 就把施法者拉过去 */
interface PullEffect {
  readonly kind: 'pull'
  readonly speed: number
  readonly gap: number
  readonly heavy?: 'self'
}
/** 击飞：原地腾空 durationMs，期间什么都做不了 */
interface KnockupEffect {
  readonly kind: 'knockup'
  readonly durationMs: number
  readonly height: number
  /** 落地时施于被击飞的身体 */
  readonly onLand?: readonly Effect[]
}
/** 推撞：沿施法者到目标的方向推出 distance，撞到墙施加 onWall */
interface ShoveEffect {
  readonly kind: 'shove'
  readonly distance: number
  readonly ms: number
  readonly onWall?: readonly Effect[]
}
/** 投掷：把目标抛向 to（身后或最近的另一个敌人），落地时对落点施加 onLand */
interface ThrowEffect {
  readonly kind: 'throw'
  readonly to: 'behind' | 'foe'
  readonly distance: number
  readonly ms: number
  readonly height: number
  readonly onLand?: readonly Effect[]
}
/** 换位：施法者与目标同时穿行到对方的位置 */
interface SwapEffect {
  readonly kind: 'swap'
}
/** 按状态表施加一种状态，持续 ms；控制类的霸体不吃；value 是这种状态的参数，如倍率 */
interface StatusEffect {
  readonly kind: 'status'
  readonly status: StatusId
  readonly ms: number
  readonly value?: number
}
/** 附魔：目标 ms 内出手都带上这种元素，盖过能力与自己的元素 */
interface ImbueEffect {
  readonly kind: 'imbue'
  readonly element: ElementId
  readonly ms: number
}
/** 转属：目标 ms 内变成这种元素，挨打按它算克制，出手也默认带它 */
interface AttuneEffect {
  readonly kind: 'attune'
  readonly element: ElementId
  readonly ms: number
}
/** 护盾：目标挡下 amount 加自己生命上限 ratio 倍的伤害（按出手方的治疗效果放大），ms 内挡满就碎；再上一层取强的 */
interface ShieldEffect {
  readonly kind: 'shield'
  readonly amount: number
  readonly ratio?: number
  readonly ms: number
}
/** 回春：目标每 tickMs 回 amount 加自己生命上限 ratio 倍的生命（按出手方的治疗效果放大），持续 durationMs */
interface MendEffect {
  readonly kind: 'mend'
  readonly amount: number
  readonly ratio?: number
  readonly tickMs: number
  readonly durationMs: number
}
/** 条件看谁：self 是带着这条规则的身体（出手者、持有者），target 是这一下作用到的身体 */
export type CondWho = 'self' | 'target'
/** 条件：对 who 判断，能用 all（并且）、any（或者）、not（不是）组合 */
export type Cond =
  | { readonly kind: 'all'; readonly of: readonly Cond[] }
  | { readonly kind: 'any'; readonly of: readonly Cond[] }
  | { readonly kind: 'not'; readonly cond: Cond }
  /** 被别人抛在空中 */
  | { readonly kind: 'airborne'; readonly who: CondWho }
  /** 身上带着这种状态；按来源分开记的状态只认这个来源施加的 */
  | { readonly kind: 'marked'; readonly who: CondWho; readonly mark: StatusId }
  | { readonly kind: 'hpBelow'; readonly who: CondWho; readonly ratio: number }
  | { readonly kind: 'boss'; readonly who: CondWho }
  /** 站着几乎没动 */
  | { readonly kind: 'still'; readonly who: CondWho }
  | { readonly kind: 'leader'; readonly who: CondWho }
  | { readonly kind: 'follower'; readonly who: CondWho }
  /** radius 内没有活着的敌人 */
  | { readonly kind: 'noFoesNear'; readonly who: CondWho; readonly radius: number }
  /** radius 内至少有 atLeast 个活着的敌人 */
  | { readonly kind: 'foesNear'; readonly who: CondWho; readonly radius: number; readonly atLeast: number }
  /** 目标离自己不超过 radius；没有目标或没有自己就不成立 */
  | { readonly kind: 'within'; readonly who: 'target'; readonly radius: number }
  /** 放完主动技能还不到 ms */
  | { readonly kind: 'afterSkill'; readonly who: CondWho; readonly ms: number }
  /** 身体此刻是这种元素 */
  | { readonly kind: 'element'; readonly who: CondWho; readonly element: ElementId }
/** 几率：过了 p 的几率才施加 then */
interface ChanceEffect {
  readonly kind: 'chance'
  readonly p: number
  readonly then: readonly Effect[]
}
/** 条件效果：目标满足 when 施加 then，否则施加 else */
interface IfEffect {
  readonly kind: 'if'
  readonly when: Cond
  readonly then: readonly Effect[]
  readonly else?: readonly Effect[]
}
/** 叠层：同一来源在目标身上叠满 max 层时施加 then 并清空 */
interface StackEffect {
  readonly kind: 'stack'
  readonly max: number
  readonly durationMs: number
  readonly then: readonly Effect[]
}
/** 引爆：让目标身上这个来源的引信或存伤立刻到期，照常结算 */
interface DetonateEffect {
  readonly kind: 'detonate'
  readonly mark: 'fuse' | 'store'
}
/** 引信：ms 后在目标所在处施加 then；jump 为真时目标先死了引信跳到最近的另一个敌人 */
interface FuseEffect {
  readonly kind: 'fuse'
  readonly ms: number
  readonly then: readonly Effect[]
  readonly jump?: boolean
}
/** 存伤：ms 内目标受到的伤害记下来，到期以它的 ratio 倍为基础伤害施加 then */
interface StoreEffect {
  readonly kind: 'store'
  readonly ms: number
  readonly ratio: number
  readonly then: readonly Effect[]
}
/** 死亡印记：ms 内目标死了，对施加者施加 then（死者是受害者） */
interface DeathMarkEffect {
  readonly kind: 'deathMark'
  readonly ms: number
  readonly then: readonly Effect[]
}
/** 冷却：this 是出手的这条能力，skill 是主动技能，all 是全部；给了 ms 就减这么多，否则直接转好；who 为 team 时是施法者这一方所有身体的 */
interface RefreshEffect {
  readonly kind: 'refresh'
  readonly what: 'this' | 'skill' | 'all'
  readonly ms?: number
  readonly who?: 'team'
}
/** 资源：给目标加（减）资源 */
interface GainEffect {
  readonly kind: 'gain'
  readonly amount: number
}
/** 强化下一击：目标接下来 hits 次普通出手附带 then */
interface EmpowerEffect {
  readonly kind: 'empower'
  readonly hits: number
  readonly then: readonly Effect[]
}
/** 选谁：self 是出手者自己；foes 是落点 radius 内这一下打得到的敌方，allies 是落点 radius 内的同伴；只留满足 filter 的，按 sort 排好取前 count 个 */
export type Selector =
  | { readonly side: 'self' }
  | {
      readonly side: 'foes' | 'allies'
      readonly radius: number
      readonly filter?: Cond
      /** nearest 离落点由近到远，weakest 生命比例由低到高 */
      readonly sort?: 'nearest' | 'weakest'
      readonly count?: number
    }
/** 换个对象施加：选出的身体吃 then，一个都没选到就不施加 */
interface ToEffect {
  readonly kind: 'to'
  readonly who: Selector
  readonly then: readonly Effect[]
}
/** 形态：切到本体的第 to 个形态（-1 是本体）；给了 ms 就到时切回本体并施加 onEnd */
interface FormEffect {
  readonly kind: 'form'
  readonly to: number
  readonly ms?: number
  readonly onEnd?: readonly Effect[]
}
/** 体型：× mul，受击与接触的面积跟着变；给了 ms 到时还原，否则叠加到这个身体消失，最多 max 倍 */
interface GrowEffect {
  readonly kind: 'grow'
  readonly mul: number
  readonly ms?: number
  readonly max?: number
}
/** 回溯：沿直线穿行回 ms 前的位置，到了生命取那时与现在的较高者；只有记着路的身体回得去，带这个效果的能力装上时就给宿主记路 */
interface RewindEffect {
  readonly kind: 'rewind'
  readonly ms: number
}
/** 夺取：把目标的一条能力复制给施法者用 ms，冷却 cooldownMs；skill 为真时夺它的主动技能，并让它的冷却重新走 */
interface StealEffect {
  readonly kind: 'steal'
  readonly ms: number
  readonly cooldownMs: number
  readonly skill?: boolean
}
/** 召唤：召出 count 个身体，阵营随施法者、记在施法者名下；unit 是一种身体，在施法者身边 spread 内散开；clone 是施法者的分身，带着它的普通出手（伤害 × dmgRatio）；victim 是死亡印记结算时的死者，以施法者的阵营站起来（头目不会）；给了 lifeMs 到时消失，hpRatio 是生命比例（分身按施法者的上限、死者按原来的上限），onDeath 是它死时施加的 */
interface SummonEffect {
  readonly kind: 'summon'
  readonly of: { readonly unit: EnemyDef; readonly spread: number } | { readonly clone: { readonly dmgRatio: number } } | 'victim'
  readonly count: number
  readonly lifeMs?: number
  readonly hpRatio?: number
  readonly onDeath?: readonly Effect[]
}
/** 放出另一个能力：从施法者身上照这个能力的瞄准与形状出手一次，吃施法者的属性；不耗冷却，也不算放了主动技能 */
interface CastEffect {
  readonly kind: 'cast'
  readonly ability: Extract<AbilityDef, { readonly trigger: 'manual' }>
}
/** 吞噬：把目标吞进施法者肚子里最多 ms，每秒消化 dps；施法者挨够 escape 伤害或死了就吐出来；spit 是吐出时抛出的距离 */
interface DevourEffect {
  readonly kind: 'devour'
  readonly ms: number
  readonly dps: number
  readonly escape: number
  readonly spit: number
}
/** 附身：目标贴到施法者身上 ms，期间不可选中，照常出手 */
interface AttachEffect {
  readonly kind: 'attach'
  readonly ms: number
}
/** 隐身穿行到自己召出的 of 身边（最靠近目标的那个），现身时施加 then */
interface TeleportEffect {
  readonly kind: 'teleport'
  readonly of: EnemyKind
  readonly then?: readonly Effect[]
}
/** 残影：沿出手方向冲出 dash 远处留一个影子，存在 lifeMs，最多 max 个；镜像的能力也从影子出手；taunt 给了就让影子嘲讽周围 */
interface ShadowEffect {
  readonly kind: 'shadow'
  readonly lifeMs: number
  readonly max: number
  readonly dash: number
  readonly taunt?: { readonly radius: number; readonly ms: number }
}
/** 与自己最新的影子换位 */
interface ShadowSwapEffect {
  readonly kind: 'shadowSwap'
}
/** 亡后残留：生命回到上限的 hpRatio，之后 ms 内流失殆尽，期间照常行动 */
interface UndeadEffect {
  readonly kind: 'undead'
  readonly ms: number
  readonly hpRatio: number
}
/** 墙：wall 垂直于出手方向、中心在前方 offset 处、长 length；ring 以落点为心、半径 length；bodies 与 shots 是挡谁的身体与弹体（挡弹只挡敌方的）；reflect 把挡下的弹体反弹成自己的；follow 让墙跟着施法者；onCross 是敌方身体越过它时施加的 */
interface BarrierEffect {
  readonly kind: 'barrier'
  readonly shape: 'wall' | 'ring'
  readonly length: number
  readonly offset?: number
  readonly durationMs: number
  readonly bodies: 'all' | 'foes' | 'none'
  readonly shots: boolean
  readonly reflect?: boolean
  readonly follow?: boolean
  readonly onCross?: readonly Effect[]
  readonly color: number
}
/** 传送门：施法者脚下与出手方向 distance 处各开一个，任何身体踏进一个就隐身穿行到另一个出来，同一个身体 cdMs 内不再传 */
interface PortalEffect {
  readonly kind: 'portal'
  readonly distance: number
  readonly radius: number
  readonly durationMs: number
  readonly cdMs: number
  readonly color: number
}
/** 牵绳：把施法者与目标连起来 ms；目标离开 range 就断并施加 onBreak，撑满 ms 施加 onHold */
interface TetherEffect {
  readonly kind: 'tether'
  readonly ms: number
  readonly range: number
  readonly onHold?: readonly Effect[]
  readonly onBreak?: readonly Effect[]
  readonly color: number
}
/** 召回：自己落在地上的弹体全部飞回施法者，沿途再打一遍 */
interface RecallEffect {
  readonly kind: 'recall'
  readonly speed: number
}
/** 打断：取消目标正在蓄的力与没打完的连发，霸体不吃 */
interface InterruptEffect {
  readonly kind: 'interrupt'
}
/** 群体传送：目标（allies 为真时是全体同伴）沿出手方向隐身穿行 distance */
interface WarpEffect {
  readonly kind: 'warp'
  readonly distance: number
  readonly allies?: boolean
}
/** 拖行：目标被拴在施法者身后跟着走 ms，期间不能行动 */
interface DragEffect {
  readonly kind: 'drag'
  readonly ms: number
}
/** 异界：施法者与目标一起进入只有彼此的界 ms，界外的谁也碰不到他们，他们也碰不到界外 */
interface RealmEffect {
  readonly kind: 'realm'
  readonly ms: number
}
export type Effect =
  | StatusEffect
  | BlastEffect
  | SlowEffect
  | PoisonEffect
  | GroundZone
  | MorphEffect
  | SpawnProjectileEffect
  | HealEffect
  | AttackSlowEffect
  | BuffEffect
  | DamageEffect
  | HpDamageEffect
  | StunEffect
  | ExhaustEffect
  | HideEffect
  | TauntEffect
  | GuardEffect
  | ReviveEffect
  | HealRatioEffect
  | InvulnEffect
  | ReviveCutEffect
  | TimeStopEffect
  | CoinsEffect
  | InterestEffect
  | VanishEffect
  | RootEffect
  | SilenceEffect
  | DisarmEffect
  | GroundedEffect
  | SleepEffect
  | FearEffect
  | CharmEffect
  | BerserkEffect
  | StasisEffect
  | UntargetableEffect
  | UnstoppableEffect
  | CleanseEffect
  | SpellShieldEffect
  | FrontGuardEffect
  | RevealEffect
  | StealthEffect
  | UndyingEffect
  | ParryEffect
  | PullEffect
  | KnockupEffect
  | ShoveEffect
  | ThrowEffect
  | SwapEffect
  | IfEffect
  | StackEffect
  | DetonateEffect
  | FuseEffect
  | StoreEffect
  | DeathMarkEffect
  | RefreshEffect
  | GainEffect
  | EmpowerEffect
  | ToEffect
  | ChanceEffect
  | FormEffect
  | GrowEffect
  | RewindEffect
  | StealEffect
  | SummonEffect
  | CastEffect
  | DevourEffect
  | AttachEffect
  | TeleportEffect
  | ShadowEffect
  | ShadowSwapEffect
  | UndeadEffect
  | BarrierEffect
  | PortalEffect
  | TetherEffect
  | RecallEffect
  | InterruptEffect
  | WarpEffect
  | DragEffect
  | RealmEffect
  | ImbueEffect
  | AttuneEffect
  | ShieldEffect
  | MendEffect

interface ZoneVisual {
  readonly color: number
  readonly fillAlpha: number
  readonly lineAlpha: number
  readonly lineWidth: number
  readonly enterMs: number
}

/** 形状：一次出手覆盖谁 */
export type Delivery = 'melee' | 'ranged'

export type Shape =
  | { readonly kind: 'bolt'; readonly projectile: ProjectileSpec; readonly lifeMs: number; readonly pierce?: number }
  | { readonly kind: 'segment'; readonly reach: number; readonly radius: number; readonly ms: number; readonly lungeDist?: number; readonly beam?: boolean }
  | { readonly kind: 'sector'; readonly radius: number; readonly arcDeg: number; readonly ms: number }
  | { readonly kind: 'disc'; readonly radius: number; readonly at: 'self' | 'target'; readonly of?: 'foes' | 'hurt' }
  | { readonly kind: 'chain'; readonly hops: number; readonly hopRange: number; readonly decay: number }
  | {
      readonly kind: 'flyer'
      readonly range: number
      readonly outMs: number
      readonly returnSpeed: number
      readonly radius: number
      readonly spinDegPerSec: number
      readonly coinMagnetRadius?: number
    }
  | {
      readonly kind: 'drop'
      readonly targets: number
      readonly look: Look
      readonly fromAbove: number
      readonly dropMs: number
      readonly staggerMs: number
    }
  | { readonly kind: 'blink'; readonly behindDist: number; readonly strikeMs: number; readonly execute?: { readonly hpRatio: number; readonly mul: number } }
  | { readonly kind: 'sprint'; readonly distance: number; readonly ms: number; readonly radius?: number; readonly seek?: boolean }
  | { readonly kind: 'leap'; readonly distance: number; readonly ms: number; readonly height: number; readonly radius: number }
  | { readonly kind: 'all'; readonly of: 'foes' | 'allies'; readonly downed?: boolean }
  | (ZoneRules & {
      readonly kind: 'zone'
      readonly radius: number
      readonly durationMs: number
      readonly tickMs?: number
      readonly mend?: number
      readonly follow?: boolean
      readonly pulse?: { readonly intervalMs: number; readonly onHit: readonly Effect[] }
      readonly visual: ZoneVisual
    })
  | {
      readonly kind: 'summon'
      readonly count: number
      readonly minion: {
        readonly look: Look
        readonly speed: number
        readonly orbit: { readonly radius: number; readonly spinRadPerSec: number }
      }
      readonly lifeMs: number
    }
  | {
      readonly kind: 'emplace'
      readonly count: number
      readonly spread?: number
      readonly maxAlive: number
      readonly lifeMs: number
      readonly look: Look
      readonly ability: AbilityDef
    }
  | { readonly kind: 'world' }
export type ShapeKind = Shape['kind']

/** 瞄准：出手的方向或落点从哪来 */
export type Aim = 'nearest' | 'strongest' | 'move' | 'leader' | 'self' | 'stick'

/** 重复出手：一次几发、隔多久、每发打几折、每第 N 次才触发、追加的几发怎么重新瞄准 */
export interface Repeat {
  readonly count: number
  readonly spreadDeg?: number
  readonly delayMs?: number
  readonly ratio?: number
  readonly everyN?: number
  readonly reaim?: 'same' | 'nearest' | 'random'
}

/** 蓄力：出手前停下 ms 毫秒；方向在蓄力开始或结束时锁定；telegraph 是蓄力期间身体上的预兆 */
export interface Windup {
  readonly ms: number
  readonly lockAt: 'start' | 'end'
  readonly telegraph: 'shake' | 'blink'
}

interface AbilityBase {
  /** skill 是技能：沉默挡它；attack 是普通出手：缴械挡它。不写时手动的是技能、自动的是普通出手 */
  readonly class?: 'attack' | 'skill'
  readonly aim: Aim
  readonly windup?: Windup
  readonly range?: number
  readonly shape: Shape
  /** 出手方式，决定吃近战伤害还是远程伤害；不写按形状定 */
  readonly delivery?: Delivery
  /** 这一下的元素，不写按出手的身体的；附了魔的按附的 */
  readonly element?: ElementId
  readonly damage?: number
  readonly knockback?: number
  readonly onHit?: readonly Effect[]
  /** 出手的反应：cast 在出手前施于自己，结算后按新的状态判定这一下出不出得去（先解控再冲出去）；fire 在出手后施于自己；kill 在这条能力打死谁时施于自己 */
  readonly reactions?: readonly AbilityReaction[]
  readonly repeat?: Repeat
  readonly held?: HeldVisual
  readonly fireSfx?: SfxId
  readonly color?: number
  readonly fxRadius?: number
  readonly piercesWalls?: boolean
  /** 破坏力：这一下能打掉多少立方米的完好砌体（按材质的强度折算）；弹体撞上障碍、近战与爆炸打到的范围、冲刺一路撞上的都算 */
  readonly breach?: number
  /** 可以攒几次：冷却按次恢复 */
  readonly charges?: number
  /** 出手后 windowMs 内可以接下一段；冷却在最后一段打完或窗口关闭后才走 */
  readonly recast?: { readonly windowMs: number; readonly ability: AbilityDef }
  /** 按住蓄力（只有手动的有）：按满 maxMs 时位移与判定距离 × reachMul、伤害 × damageMul */
  readonly hold?: { readonly maxMs: number; readonly reachMul: number; readonly damageMul: number }
  /** 弹匣：打完 count 发换弹 reloadMs；最后一发附带 last */
  readonly ammo?: { readonly count: number; readonly reloadMs: number; readonly last?: readonly Effect[] }
  /** 轮流出手：本身是第一式，之后依次换成这几式，冷却接着走 */
  readonly cycle?: readonly AbilityDef[]
  /** 资源：出手消耗 cost、获得 gain；boost 是资源到 at 时消耗 spend 的强化 */
  readonly cost?: number
  readonly gain?: number
  readonly boost?: { readonly at: number; readonly spend: number; readonly damageMul?: number; readonly onHit?: readonly Effect[] }
  /** 以血施法：出手扣这么多生命，不够就不出手 */
  readonly hpCost?: number
  /** 只对满足条件的目标出手 */
  readonly requires?: Cond
  /** 什么时候用：瞄准以后再看一次，不成立就不出手、下一刻再看；self 是出手的身体，target 是瞄准到的目标，没有目标的看不了 target */
  readonly when?: Cond
  /** 非玩家身体同时有几招能出时，先出 priority 大的，一样大的按装上的先后 */
  readonly priority?: number
  /** 连招：非玩家身体放完这一招，按顺序接着放这几招，每招等上一招做完；连招里的不看冷却，瞄不到目标就断 */
  readonly combo?: readonly Extract<AbilityDef, { readonly trigger: 'manual' }>[]
  /** 影子也照着出手 */
  readonly mirror?: boolean
  /** 施法锚点：这条能力从一个跟着宿主的物件上出手；orbit 绕宿主转、trail 落在宿主一秒半前的位置、ally 贴着血量最低的队友 */
  readonly anchor?: { readonly look: Look; readonly mode: 'orbit' | 'trail' | 'ally'; readonly distance: number }
}
/** 反应：on 这件事发生时，满足 if、过了 chance 的几率，对 to 施加 effects；to 的 self 是带着这条反应的身体，other 是这件事里的另一方（打中的目标、出手打它的身体），spot 是这件事发生的地方（倒下处） */
export interface ReactionBase {
  readonly if?: Cond
  readonly effects: readonly Effect[]
}
export type Reaction = ReactionBase &
  (
    | { readonly on: 'hit' | 'crit' | 'dodge' | 'hurt'; readonly to: 'self' | 'other'; readonly chance?: number }
    | { readonly on: 'kill'; readonly to: 'self' | 'spot'; readonly chance?: number }
    | { readonly on: 'skill'; readonly to: 'self'; readonly chance?: number }
    | { readonly on: 'cast' | 'fire'; readonly to: 'self' }
    | { readonly on: 'wave' | 'lethal'; readonly to: 'self' }
    | { readonly on: 'lowHp'; readonly ratio: number; readonly to: 'self' }
  )
/** 能力的反应：出手前、出手后、打死谁时 */
export type AbilityReaction = ReactionBase & { readonly on: 'cast' | 'fire' | 'kill'; readonly to: 'self' }
/** 一个能力 = 触发 × 瞄准 × 形状 × 载荷 × 重复 */
export type AbilityDef =
  | (AbilityBase & { readonly trigger: 'auto'; readonly cooldownMs: number; readonly firstDelayMs?: number })
  | (AbilityBase & { readonly trigger: 'manual' })
