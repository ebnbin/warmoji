import type { CharacterId } from '../characters/registry'

// 角色特殊能力：一阶/二阶两档，靠购买角色专属能力卡解锁（items/registry 的
// 能力卡条目；二阶卡需先持有一阶卡，累积生效不替代）。
// 能力 = 对武器行为的质变（新弹道/新区域/新机制）。实现为换持整行：
// 档位行在 weapons/registry（`2`/`3` 后缀），选行在 characters/registry 的
// loadoutFor，运行时（src/weapons/）按字段执行——武器自身没有升级逻辑。

export interface AbilitySpec {
  readonly icon: string
  readonly name: string
  readonly desc: string
}

/** 已解锁的能力档位：a1 = 一阶（下标 0 的卡），a2 = 二阶（下标 1 的卡） */
export interface AbilityTiers {
  a1: boolean
  a2: boolean
}

export const ABILITIES: Record<CharacterId, readonly [AbilitySpec, AbilitySpec]> = {
  juggler: [
    { icon: '🍅', name: '三重抛掷', desc: '每次投掷同时抛出 3 枚番茄，扇形散开' },
    { icon: '💥', name: '爆浆番茄', desc: '番茄命中后爆裂，对周围敌人造成 60% 溅射伤害' },
  ],
  unicorn: [
    { icon: '⚡', name: '二连突刺', desc: '每次出手连刺两段，第二段重新索敌' },
    { icon: '🌈', name: '虹光震波', desc: '突刺终点爆发冲击波：60% 范围伤害并强力击退' },
  ],
  troll: [
    { icon: '🌀', name: '全周横扫', desc: '巨斧扫过整整一圈，攻击四面八方的敌人' },
    { icon: '🥶', name: '震慑余波', desc: '被横扫命中的敌人减速 45%，持续 1.2 秒' },
  ],
  cowboy: [
    { icon: '🎯', name: '贯穿弹', desc: '水弹贯穿敌人，沿途最多命中 3 名' },
    { icon: '🔫', name: '左轮风暴', desc: '每把枪每第 4 次射击变为 5 发扇形弹幕' },
  ],
  mage: [
    { icon: '🔥', name: '余烬秘火', desc: '轰炸在爆心留下灼烧地面，3 秒内持续烧伤敌人' },
    { icon: '✨', name: '连锁轰炸', desc: '轰炸后 0.25 秒向随机敌人追加一次 75% 伤害的轰炸' },
  ],
  kangaroo: [
    { icon: '🪃', name: '双子回旋', desc: '同时向相反方向掷出第二枚回旋镖' },
    { icon: '🧲', name: '磁力巨镖', desc: '回旋镖增大 40%，并沿途吸取金币' },
  ],
  robot: [
    { icon: '🔭', name: '双联光束', desc: '开火时向正后方同步射出第二道光束' },
    { icon: '📡', name: '全域扫射', desc: '光束改为绕自身一周的 8 向扫射，每束 60% 伤害' },
  ],
  snowman: [
    { icon: '🩹', name: '冻伤', desc: '寒气光环每秒对范围内敌人造成 6 点伤害' },
    { icon: '🌨️', name: '凛冬降临', desc: '每 5 秒光环脉冲一次，冻结范围内敌人 0.7 秒' },
  ],
  fairy: [
    { icon: '🐑', name: '持久变形', desc: '变形时长延长到 4 秒，魔尘弹可贯穿 1 名敌人' },
    { icon: '💔', name: '脆弱诅咒', desc: '被变形的敌人受到的所有伤害提高 40%' },
  ],
  assassin: [
    { icon: '🌀', name: '连环刃', desc: '斩击同时命中目标周围一圈，波及 60% 伤害' },
    { icon: '☠️', name: '处决', desc: '目标血量低于 35% 时，斩击伤害翻倍' },
  ],
  beaver: [
    { icon: '🏗️', name: '扩建工地', desc: '同时在场的弩塔上限 +1' },
    { icon: '🎯', name: '三连弩', desc: '弩塔每次开火改为 3 发扇形连射' },
  ],
  queenBee: [
    { icon: '🐝', name: '扩巢', desc: '蜂群 +1 只' },
    { icon: '🦠', name: '麻痹毒素', desc: '被蜇中的敌人减速 45%，持续 1.2 秒' },
  ],
  medic: [
    { icon: '🥼', name: '群体处方', desc: '治疗改为范围内全体队友回复 60% 治疗量' },
    { icon: '⚡', name: '电击起搏', desc: '范围内有阵亡队友时，优先为其减少 2 秒复活倒计时' },
  ],
  jellyfish: [
    { icon: '🔗', name: '超导传递', desc: '电弧额外弹跳数提升到 4 跳' },
    { icon: '💥', name: '过载爆裂', desc: '最后一跳落点爆出小范围电击，波及 60% 伤害' },
  ],
} as const
