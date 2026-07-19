import {
  ABILITIES,
  arcaneBlast2,
  arcaneBlast3,
  axeSweep2,
  axeSweep3,
  beeSwarm2,
  beeSwarm3,
  boomerang2,
  boomerang3,
  fieldMedkit2,
  fieldMedkit3,
  frostAura2,
  frostAura3,
  hornThrust2,
  hornThrust3,
  laserBeam2,
  laserBeam3,
  pistolLeft2,
  pistolLeft3,
  pistolRight2,
  pistolRight3,
  shadowStrike2,
  shadowStrike3,
  sparkleBolt2,
  sparkleBolt3,
  tomatoThrow2,
  tomatoThrow3,
  voltArc2,
  voltArc3,
  woodTurret2,
  woodTurret3,
} from '../abilities/registry'
import type { AbilitySpec } from '../abilities/spec'

// 角色花名册：角色 → 能力为单向绑定（角色配装固定；能力可被复用）。
// 两阶专属升级随角色归行：卡文案 + 解锁后的生效配装都是角色自己的属性，
// 商店升级卡条目（items/registry upgradeCard）从这里取文案。

/** 角色的一阶专属升级：商店卡文案 + 解锁后的生效配装（换持整行） */
export interface CharacterUpgrade {
  readonly icon: string
  readonly name: string
  readonly desc: string
  readonly abilities: readonly AbilitySpec[]
}

/** 已解锁的能力档位：u1 = 一阶（下标 0 的卡），u2 = 二阶（下标 1 的卡） */
export interface UpgradeTiers {
  u1: boolean
  u2: boolean
}

export interface CharacterSpec {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly abilities: readonly AbilitySpec[]
  /** 两阶专属升级（商店专属卡解锁，累积生效）：[一阶, 一阶+二阶]，
   * 每档 = 卡文案 + 该档整套配装。升级 = 换持整行（abilities/registry 的
   * `2`/`3` 档位行），能力自身无升级逻辑 */
  readonly upgrades: readonly [CharacterUpgrade, CharacterUpgrade]
  /** 环形阵移动秉性：>0 沿环迎敌滑动，<0 避敌滑动，0 安分（被推才动）；见 core/orbit.ts */
  readonly orbit: number
}

export const CHARACTERS = {
  juggler: {
    emoji: '🤹',
    name: '杂耍演员',
    desc: '向最近的敌人连续抛掷番茄',
    abilities: [ABILITIES.tomatoThrow],
    upgrades: [
      { icon: '🍅', name: '三重抛掷', desc: '每次投掷同时抛出 3 枚番茄，扇形散开', abilities: [tomatoThrow2] },
      { icon: '💥', name: '爆浆番茄', desc: '番茄命中后爆裂，对周围敌人造成 60% 溅射伤害', abilities: [tomatoThrow3] },
    ],
    orbit: -0.5,
  },
  unicorn: {
    emoji: '🦄',
    name: '独角兽',
    desc: '独角向前突刺，穿透沿途敌人',
    abilities: [ABILITIES.hornThrust],
    upgrades: [
      { icon: '⚡', name: '二连突刺', desc: '每次出手连刺两段，第二段重新索敌', abilities: [hornThrust2] },
      { icon: '🌈', name: '虹光震波', desc: '突刺终点爆发冲击波：60% 范围伤害并强力击退', abilities: [hornThrust3] },
    ],
    orbit: 0.8,
  },
  troll: {
    emoji: '🧌',
    name: '巨魔',
    desc: '挥舞巨斧，横扫身前扇形范围',
    abilities: [ABILITIES.axeSweep],
    upgrades: [
      { icon: '🌀', name: '全周横扫', desc: '巨斧扫过整整一圈，攻击四面八方的敌人', abilities: [axeSweep2] },
      { icon: '🥶', name: '震慑余波', desc: '被横扫命中的敌人减速 45%，持续 1.2 秒', abilities: [axeSweep3] },
    ],
    orbit: 1,
  },
  cowboy: {
    emoji: '🤠',
    name: '牛仔',
    desc: '左右双枪齐发，射出高速水弹',
    abilities: [ABILITIES.pistolLeft, ABILITIES.pistolRight],
    upgrades: [
      { icon: '🎯', name: '贯穿弹', desc: '水弹贯穿敌人，沿途最多命中 3 名', abilities: [pistolLeft2, pistolRight2] },
      { icon: '🔫', name: '左轮风暴', desc: '每把枪每第 4 次射击变为 5 发扇形弹幕', abilities: [pistolLeft3, pistolRight3] },
    ],
    orbit: -0.7,
  },
  mage: {
    emoji: '🧙',
    name: '法师',
    desc: '在远处敌人脚下引爆奥术轰炸',
    abilities: [ABILITIES.arcaneBlast],
    upgrades: [
      { icon: '🔥', name: '余烬秘火', desc: '轰炸在爆心留下灼烧地面，3 秒内持续烧伤敌人', abilities: [arcaneBlast2] },
      { icon: '✨', name: '连锁轰炸', desc: '轰炸后 0.25 秒向随机敌人追加一次 75% 伤害的轰炸', abilities: [arcaneBlast3] },
    ],
    orbit: -1,
  },
  kangaroo: {
    emoji: '🦘',
    name: '袋鼠',
    desc: '掷出回旋镖，去程回程皆可伤敌',
    abilities: [ABILITIES.boomerang],
    upgrades: [
      { icon: '🪃', name: '双子回旋', desc: '同时向相反方向掷出第二枚回旋镖', abilities: [boomerang2] },
      { icon: '🧲', name: '磁力巨镖', desc: '回旋镖增大 40%，并沿途吸取金币', abilities: [boomerang3] },
    ],
    orbit: 0.4,
  },
  robot: {
    emoji: '🤖',
    name: '机器人',
    desc: '手持激光器，灼穿一条直线上的所有敌人',
    abilities: [ABILITIES.laserBeam],
    upgrades: [
      { icon: '🔭', name: '双联光束', desc: '开火时向正后方同步射出第二道光束', abilities: [laserBeam2] },
      { icon: '📡', name: '全域扫射', desc: '光束改为绕自身一周的 8 向扫射，每束 60% 伤害', abilities: [laserBeam3] },
    ],
    orbit: -0.6,
  },
  snowman: {
    emoji: '⛄',
    name: '雪人',
    desc: '以队伍中心散发寒气，持续减速范围内的敌人',
    abilities: [ABILITIES.frostAura],
    upgrades: [
      { icon: '🩹', name: '冻伤', desc: '寒气光环每秒对范围内敌人造成 6 点伤害', abilities: [frostAura2] },
      { icon: '🌨️', name: '凛冬降临', desc: '每 5 秒光环脉冲一次，冻结范围内敌人 0.7 秒', abilities: [frostAura3] },
    ],
    orbit: 0,
  },
  fairy: {
    emoji: '🧚',
    name: '仙子',
    desc: '魔尘弹把敌人变形成无害的绵羊，变形期间不能伤人',
    abilities: [ABILITIES.sparkleBolt],
    upgrades: [
      { icon: '🐑', name: '持久变形', desc: '变形时长延长到 4 秒，魔尘弹可贯穿 1 名敌人', abilities: [sparkleBolt2] },
      { icon: '💔', name: '脆弱诅咒', desc: '被变形的敌人受到的所有伤害提高 40%', abilities: [sparkleBolt3] },
    ],
    orbit: -0.6,
  },
  assassin: {
    emoji: '🥷',
    name: '刺客',
    desc: '瞬移到范围内血最厚的敌人背后重斩一刀，再闪回原位；出手瞬间无敌',
    abilities: [ABILITIES.shadowStrike],
    upgrades: [
      { icon: '🌀', name: '连环刃', desc: '斩击同时命中目标周围一圈，波及 60% 伤害', abilities: [shadowStrike2] },
      { icon: '☠️', name: '处决', desc: '目标血量低于 35% 时，斩击伤害翻倍', abilities: [shadowStrike3] },
    ],
    orbit: 0.5,
  },
  beaver: {
    emoji: '🦫',
    name: '河狸工程师',
    desc: '自己不动手，定期在脚下架起自动开火的弩塔',
    abilities: [ABILITIES.woodTurret],
    upgrades: [
      { icon: '🏗️', name: '扩建工地', desc: '同时在场的弩塔上限 +1', abilities: [woodTurret2] },
      { icon: '🎯', name: '三连弩', desc: '弩塔每次开火改为 3 发扇形连射', abilities: [woodTurret3] },
    ],
    orbit: -0.3,
  },
  queenBee: {
    emoji: '🐝',
    name: '蜂后',
    desc: '统领一小群蜜蜂，蜂群自主追击撞刺敌人',
    abilities: [ABILITIES.beeSwarm],
    upgrades: [
      { icon: '🐝', name: '扩巢', desc: '蜂群 +1 只', abilities: [beeSwarm2] },
      { icon: '🦠', name: '麻痹毒素', desc: '被蜇中的敌人减速 45%，持续 1.2 秒', abilities: [beeSwarm3] },
    ],
    orbit: -0.2,
  },
  medic: {
    emoji: '🧑‍⚕️',
    name: '军医',
    desc: '周期治疗附近血量最低的队友，顺手甩两支飞针',
    abilities: [ABILITIES.fieldMedkit, ABILITIES.syringeDart],
    upgrades: [
      { icon: '🥼', name: '群体处方', desc: '治疗改为范围内全体队友回复 60% 治疗量', abilities: [fieldMedkit2, ABILITIES.syringeDart] },
      { icon: '⚡', name: '电击起搏', desc: '范围内有阵亡队友时，优先为其减少 2 秒复活倒计时', abilities: [fieldMedkit3, ABILITIES.syringeDart] },
    ],
    orbit: -0.8,
  },
  jellyfish: {
    emoji: '🪼',
    name: '水母',
    desc: '电弧在敌群间弹跳传导，敌人越密越疼',
    abilities: [ABILITIES.voltArc],
    upgrades: [
      { icon: '🔗', name: '超导传递', desc: '电弧额外弹跳数提升到 4 跳', abilities: [voltArc2] },
      { icon: '💥', name: '过载爆裂', desc: '最后一跳落点爆出小范围电击，波及 60% 伤害', abilities: [voltArc3] },
    ],
    orbit: 0.2,
  },
} as const satisfies Record<string, CharacterSpec>

/** 生效配装：升级卡质变 = 换持整行（一阶 → 二阶累积；未解锁用基础行） */
export function loadoutFor(spec: CharacterSpec, tiers: UpgradeTiers): readonly AbilitySpec[] {
  if (!tiers.u1) return spec.abilities
  return tiers.u2 ? spec.upgrades[1].abilities : spec.upgrades[0].abilities
}

export type CharacterId = keyof typeof CHARACTERS
export const ROSTER_IDS = Object.keys(CHARACTERS) as readonly CharacterId[]

// 队长主动技能：每位队长一个，跨波 CD——剩余冷却存在 run 上、只按战斗
// 时钟推进（商店/整编不走表），上一波攒的进度带进下一波。左下角按钮或
// E 键释放；效果逻辑按队长 id 在 BaseArenaScene.castSkill 分派，效果参数
// 见下方 SKILL 常量（与「能力先直接建模为字段」同一约定，不做通用效果系统）
export interface CaptainSkill {
  readonly name: string
  readonly desc: string
  readonly cdMs: number
}

// 队长：不登场、无实体的团队增益提供者（emotion 表情形象）。
// 能力先直接建模为字段，需要通用效果系统时再抽象；编制上限/经验相关能力由队长决定。
export interface CaptainSpec {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  /** 主动技能（战斗内左下角按钮释放） */
  readonly skill: CaptainSkill
  /** 编制上限：可招募的角色总数 */
  readonly teamSize: number
  /** 开局波次（通常 1）；>1 时跳过之前的波次，难度时钟按被跳过的
   * 波次时长预推进——敌人配比与强度都是该波的真实水平，且能量豆拉满；
   * 阵容仍从零起步，由玩家在整编页逐个自选招满（core/run.ts beginRun） */
  readonly startWave: number
  /** 开局金币 */
  readonly startCoins: number
  /** 全队经验获取倍率 */
  readonly xpGainMul: number
  /** 每次进商店全员复活并恢复满血（默认规则：存活者血量保留、阵亡者 30% 血复活） */
  readonly reviveInShop: boolean
  /** 每次进商店的免费道具刷新次数 */
  readonly freeRefreshes: number
  /** 开局整编结束后是否先进商店再开战（自带开局金币的队长用） */
  readonly firstWaveShop: boolean
}

export const CAPTAINS = {
  angel: {
    emoji: '😇',
    name: '天使',
    desc: '每次进入商店，全体队员复活并恢复满血',
    teamSize: 5,
    startWave: 1,
    startCoins: 0,
    xpGainMul: 1,
    reviveInShop: true,
    freeRefreshes: 0,
    firstWaveShop: false,
    skill: {
      name: '圣光降临',
      desc: '阵亡队员满血复活，存活队员回复 50% 生命，全队无敌 2 秒',
      cdMs: 35_000,
    },
  },
  moneybags: {
    emoji: '🤑',
    name: '财迷',
    desc: '每次进入商店，前 3 次道具刷新免费',
    teamSize: 5,
    startWave: 1,
    startCoins: 0,
    xpGainMul: 1,
    reviveInShop: false,
    freeRefreshes: 3,
    firstWaveShop: false,
    skill: {
      name: '天降横财',
      desc: '金袋砸向最近的 8 个敌人：伤害与强击退，每袋落地掉 1 枚金币',
      cdMs: 20_000,
    },
  },
  party: {
    emoji: '🥳',
    name: '派对之星',
    desc: '气氛组拉满，编制上限 6 人',
    teamSize: 6,
    startWave: 1,
    startCoins: 0,
    xpGainMul: 1,
    reviveInShop: false,
    freeRefreshes: 0,
    firstWaveShop: false,
    skill: {
      name: '全场蹦迪',
      desc: '全场敌人（含 Boss）被音乐感染，跳舞 3.5 秒不能动弹',
      cdMs: 30_000,
    },
  },
  prodigy: {
    emoji: '🤓',
    name: '神童',
    desc: '天资聪颖，自选阵容直接满编开局，能量豆拉满、自带启动资金（测试直通车）',
    teamSize: 5,
    startWave: 15,
    startCoins: 500,
    xpGainMul: 1,
    reviveInShop: false,
    freeRefreshes: 0,
    firstWaveShop: true,
    skill: {
      name: '降维打击',
      desc: '一道灵光扫过全场，所有敌人受到大额伤害（随波次增强），Boss 承伤减半',
      cdMs: 45_000,
    },
  },
  scholar: {
    emoji: '🧐',
    name: '学者',
    desc: '带队有方，全队经验获取 +25%',
    teamSize: 5,
    startWave: 1,
    startCoins: 0,
    xpGainMul: 1.25,
    reviveInShop: false,
    freeRefreshes: 0,
    firstWaveShop: false,
    skill: {
      name: '弱点讲义',
      desc: '划出敌人弱点，8 秒内全队伤害 ×1.6',
      cdMs: 30_000,
    },
  },
} as const satisfies Record<string, CaptainSpec>

export type CaptainId = keyof typeof CAPTAINS
export const CAPTAIN_IDS = Object.keys(CAPTAINS) as readonly CaptainId[]

// 队伍：玩家操控队伍中心点，角色按队形岗位随行；除此之外角色是完全独立的单位。
// 队形几何在 battle/formation.ts；满员后可在整编页切换队形与互换站位。
export const TEAM = {
  ringRadius: 0.8,
  /** 3 人环收紧的小半径（人少时更像一个整体）；≥4 人用 ringRadius */
  smallRingRadius: 0.58,
  /** 2 人阵的左右圆心距（紧凑贴身，允许轻微视觉重叠）；1~2 人不环绕 */
  pairGap: 1.1,
  moveSpeed: 5.5,
  reviveMs: 10_000,
  /** N 保 1 中心的受击判定半径系数：被保护的实际收益（碰撞圆减半更难被摸到） */
  guardCenterHurtboxMul: 0.5,
} as const

export const MEMBER = {
  size: 1.2,
  radius: 0.45,
  maxHp: 100,
  // 波次制要求整波存活，受击间隔放宽让「蹭到怪」是磨损而非速死
  iframesMs: 700,
} as const
