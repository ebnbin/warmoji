// 保底可视区：横屏 1280×720，竖屏 720×1280；多余空间向两侧扩展显示更多地图
export const VIEW = { minLong: 1280, minShort: 720 } as const

// 1 单位 = 标准实体（player）的尺寸；锚定：最小视口长边容纳 20 个单位
export const UNIT = VIEW.minLong / 20

export const MAP = {
  width: 25 * UNIT,
  height: 25 * UNIT,
  // 相机滚动范围 = 地图四周外扩这一圈
  cameraMargin: 2 * UNIT,
} as const

import { ITEMS } from './items'
import { MAPS } from './maps'
import type { MapSpec } from './maps'
import { SETTING_DEFS } from './settings'
import type {
  AreaBlastSpec,
  BoomerangSpec,
  LaserSpec,
  ProjectileSpec,
  SlowAuraSpec,
  SweepSpec,
  ThrustSpec,
  WeaponSpec,
} from './weapons'

// 击退：命中冲量按指数衰减（时间常数 tauMs），实际位移 ≈ 冲量 × tauMs/1000；
// 多次命中冲量叠加但合速度不超过 maxSpeed。
// 衰减的语义 = 敌人自身动力在抵抗；致死一击则失去动力：尸体以不衰减的
// 击退速度匀速飞出 deathSlideMs 后消失（位移 = 冲量 × deathSlideMs/1000）
export const KNOCKBACK = { tauMs: 100, maxSpeed: 1300, deathSlideMs: 300 } as const

// 武器库（可被不同角色复用；held 缺省 = 行为主体是角色本体）
const pistol = {
  kind: 'projectile',
  name: '左轮水枪',
  icon: '🔫',
  damage: 16,
  cooldownMs: 600,
  knockback: 3 * UNIT,
  held: {
    emoji: '🔫',
    size: 0.55 * UNIT,
    restOffset: 0.45 * UNIT,
    // twemoji 1f52b 枪口朝左
    rotationOffsetRad: Math.PI,
    mountGap: 0.32 * UNIT,
  },
  projectile: {
    emoji: '💧',
    size: 0.35 * UNIT,
    radius: 0.15 * UNIT,
    speed: 13 * UNIT,
    // twemoji 1f4a7 水滴尖端朝上
    rotationOffsetRad: Math.PI / 2,
  },
} satisfies ProjectileSpec

export const WEAPONS = {
  tomatoThrow: {
    kind: 'projectile',
    name: '番茄连投',
    icon: '🍅',
    damage: 22,
    cooldownMs: 450,
    knockback: 3.5 * UNIT,
    projectile: {
      emoji: '🍅',
      size: 0.4 * UNIT,
      radius: 0.18 * UNIT,
      speed: 12 * UNIT,
      rotationOffsetRad: 0,
    },
  } satisfies ProjectileSpec,
  hornThrust: {
    kind: 'thrust',
    name: '独角突刺',
    icon: '⚔️',
    damage: 26,
    cooldownMs: 900,
    knockback: 9 * UNIT,
    reach: 1.4 * UNIT,
    hitRadius: 0.5 * UNIT,
    thrustMs: 220,
    lungeDist: 0.7 * UNIT,
  } satisfies ThrustSpec,
  axeSweep: {
    kind: 'sweep',
    name: '巨斧横扫',
    icon: '🪓',
    damage: 30,
    cooldownMs: 1200,
    knockback: 7 * UNIT,
    radius: 1.5 * UNIT,
    arcRad: (150 * Math.PI) / 180,
    sweepMs: 260,
    held: {
      emoji: '🪓',
      size: 0.65 * UNIT,
      restOffset: 0.6 * UNIT,
      // twemoji 1fa93 斧刃朝左上
      rotationOffsetRad: (3 * Math.PI) / 4,
    },
  } satisfies SweepSpec,
  pistolLeft: {
    ...pistol,
    name: '左轮水枪·左',
    held: { ...pistol.held, mountSide: -1 },
  } satisfies ProjectileSpec,
  pistolRight: {
    ...pistol,
    name: '左轮水枪·右',
    held: { ...pistol.held, mountSide: 1 },
  } satisfies ProjectileSpec,
  arcaneBlast: {
    kind: 'areaBlast',
    name: '奥术轰炸',
    icon: '💥',
    damage: 22,
    cooldownMs: 1300,
    knockback: 12 * UNIT,
    detectRange: 6 * UNIT,
    blastRadius: 1.3 * UNIT,
    color: 0x9575cd,
  } satisfies AreaBlastSpec,
  laserBeam: {
    kind: 'laser',
    name: '贯穿激光',
    icon: '🔦',
    damage: 14,
    cooldownMs: 900,
    knockback: 2.5 * UNIT,
    range: 8 * UNIT,
    beamRadius: 0.22 * UNIT,
    color: 0xff5252,
    held: {
      emoji: '🔦',
      size: 0.55 * UNIT,
      restOffset: 0.45 * UNIT,
      // twemoji 1f526 灯头朝左下
      rotationOffsetRad: (3 * Math.PI) / 4,
    },
  } satisfies LaserSpec,
  frostAura: {
    kind: 'slowAura',
    name: '寒气光环',
    icon: '❄️',
    radius: 3 * UNIT,
    slowFactor: 0.5,
    color: 0x81d4fa,
  } satisfies SlowAuraSpec,
  boomerang: {
    kind: 'boomerang',
    name: '回旋镖',
    icon: '🪃',
    damage: 18,
    cooldownMs: 1200,
    knockback: 4.5 * UNIT,
    range: 4 * UNIT,
    outMs: 500,
    returnSpeed: 10 * UNIT,
    hitRadius: 0.5 * UNIT,
    spinRadPerSec: 14,
    held: {
      emoji: '🪃',
      size: 0.55 * UNIT,
      restOffset: 0.5 * UNIT,
      rotationOffsetRad: 0,
    },
  } satisfies BoomerangSpec,
} as const

// 武器索敌上限：超出此距离的敌人不作为开火/瞄准目标。12 单位略大于
// 屏幕中心到角落（≈11.5U），可见敌必打、屏外远敌不追——索敌逻辑必须
// 有界（无限地图防御）。激光用自身更短的 range 门槛，不受此值影响
export const ACQUIRE = { range: 12 * UNIT } as const

// 角色花名册：角色 → 武器为单向绑定（角色配装固定；武器可被复用）
export interface CharacterSpec {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly weapons: readonly WeaponSpec[]
  /** 环形阵移动秉性：>0 沿环迎敌滑动，<0 避敌滑动，0 安分（被推才动）；见 core/orbit.ts */
  readonly orbit: number
}

export const CHARACTERS = {
  juggler: {
    emoji: '🤹',
    name: '杂耍演员',
    desc: '向最近的敌人连续抛掷番茄',
    weapons: [WEAPONS.tomatoThrow],
    orbit: -0.5,
  },
  unicorn: {
    emoji: '🦄',
    name: '独角兽',
    desc: '独角向前突刺，穿透沿途敌人',
    weapons: [WEAPONS.hornThrust],
    orbit: 0.8,
  },
  troll: {
    emoji: '🧌',
    name: '巨魔',
    desc: '挥舞巨斧，横扫身前扇形范围',
    weapons: [WEAPONS.axeSweep],
    orbit: 1,
  },
  cowboy: {
    emoji: '🤠',
    name: '牛仔',
    desc: '左右双枪齐发，射出高速水弹',
    weapons: [WEAPONS.pistolLeft, WEAPONS.pistolRight],
    orbit: -0.7,
  },
  mage: {
    emoji: '🧙',
    name: '法师',
    desc: '在远处敌人脚下引爆奥术轰炸',
    weapons: [WEAPONS.arcaneBlast],
    orbit: -1,
  },
  kangaroo: {
    emoji: '🦘',
    name: '袋鼠',
    desc: '掷出回旋镖，去程回程皆可伤敌',
    weapons: [WEAPONS.boomerang],
    orbit: 0.4,
  },
  robot: {
    emoji: '🤖',
    name: '机器人',
    desc: '手持激光器，灼穿一条直线上的所有敌人',
    weapons: [WEAPONS.laserBeam],
    orbit: -0.6,
  },
  snowman: {
    emoji: '⛄',
    name: '雪人',
    desc: '以队伍中心散发寒气，持续减速范围内的敌人',
    weapons: [WEAPONS.frostAura],
    orbit: 0,
  },
} as const satisfies Record<string, CharacterSpec>

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
  /** 开局队伍等级（= 可立刻花掉的点数；通常 1） */
  readonly startLevel: number
  /** 开局波次（通常 1）；>1 时跳过之前的波次，难度时钟按被跳过的
   * 波次时长预推进——敌人配比与强度都是该波的真实水平 */
  readonly startWave: number
  /** 全队经验获取倍率 */
  readonly xpGainMul: number
  /** 每次进商店全员复活并恢复满血（默认规则：存活者血量保留、阵亡者 30% 血复活） */
  readonly reviveInShop: boolean
  /** 每次进商店的免费道具刷新次数 */
  readonly freeRefreshes: number
  /** 第 1 波开战前是否开放商店（整编结束后）；为未来自带初始金币的队长预留 */
  readonly firstWaveShop: boolean
}

export const CAPTAINS = {
  angel: {
    emoji: '😇',
    name: '天使',
    desc: '每次进入商店，全体队员复活并恢复满血',
    teamSize: 5,
    startLevel: 1,
    startWave: 1,
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
    startLevel: 1,
    startWave: 1,
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
    startLevel: 1,
    startWave: 1,
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
    desc: '天资聪颖，开局队伍等级 15，直接从第 10 波开战（测试直通车）',
    teamSize: 5,
    startLevel: 15,
    startWave: 10,
    xpGainMul: 1,
    reviveInShop: false,
    freeRefreshes: 0,
    firstWaveShop: false,
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
    startLevel: 1,
    startWave: 1,
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

// 主动技能的效果参数（CD 在 CAPTAINS[id].skill.cdMs）
export const SKILL = {
  /** 开局 CD 预充比例：新局第一次充能只需一半时间，尽早见到机制 */
  startCharge: 0.5,
  /** 圣光降临：存活者回复比例 + 全队无敌时长（走受击无敌帧通道，
   * 挡接触与敌弹；毒液池/毒雾是独立计时通道，不受无敌保护） */
  angel: { healRatio: 0.5, invulnMs: 2000 },
  /** 天降横财：砸最近 targets 个敌人，每袋伤害/击退/落地金币数 */
  moneybags: { targets: 8, damage: 60, knockback: 10 * UNIT, coinsPerHit: 1 },
  /** 全场蹦迪：全场敌人（含 Boss）定身跳舞时长 */
  party: { danceMs: 3500 },
  /** 弱点讲义：全队伤害倍率 + 持续时长（不跨波） */
  scholar: { damageMul: 1.6, durationMs: 8000 },
  /** 降维打击：基准伤害 × 当前波次血量倍率（与敌人成长同步），Boss 承伤比例 */
  prodigy: { damage: 70, bossRatio: 0.5 },
} as const

// 队伍：玩家操控队伍中心点，角色按队形岗位随行；除此之外角色是完全独立的单位。
// 队形几何在 core/formation.ts；满员后可在整编页切换队形与互换站位。
export const TEAM = {
  ringRadius: 0.8 * UNIT,
  moveSpeed: 5.5 * UNIT,
  reviveMs: 10_000,
  /** N 保 1 中心的受击判定半径系数：被保护的实际收益（碰撞圆减半更难被摸到） */
  guardCenterHurtboxMul: 0.5,
} as const

// 环形阵轨道动力学：全员按「秉性（CHARACTERS.orbit）× 探测范围内敌情」计算移动倾向，
// 每帧力量（倾向绝对值）最大者即刻掌舵（同力随机、阵亡出局、随时换手），
// 环是刚性同步的：主力驱动一个共享相位，全员保持均匀间距整体转动（core/orbit.ts）。
export const ORBIT = {
  /** 敌人进入该距离（从角色自身量起）才产生移动倾向 */
  detectRange: 4.5 * UNIT,
  /** 沿环最大角速度（rad/s）≈ 每 3 秒一整圈 */
  maxSpeed: 2,
  /** 避敌/迎敌倾向增益 */
  avoidGain: 3.2,
  seekGain: 2.6,
} as const

// 跟随惯性：队员用轻微欠阻尼弹簧追自己的岗位，起步慢半拍、急停带一点回弹
export const FOLLOW = {
  /** 弹簧刚度（1/s²）；kJitter 按槽位抖动刚度，让各队员步调不齐 */
  kBase: 230,
  kJitter: 0.3,
  /** 阻尼比 <1 → 轻微过冲 */
  zeta: 0.86,
  /** 拖拽距离上限（px）：高速移动时不被甩得太远 */
  maxLag: 60,
} as const

// 待机游移：静止且探测范围内无敌时，绕岗位做缓慢李萨如漂移
export const WANDER = {
  radius: 6,
  freqX: 0.8,
  freqY: 1.13,
  /** 幅度淡入淡出时长 */
  rampMs: 350,
} as const

export const MEMBER = {
  size: 0.9 * UNIT,
  radius: 0.45 * UNIT,
  maxHp: 100,
  // 波次制要求整波存活，受击间隔放宽让「蹭到怪」是磨损而非速死
  iframesMs: 700,
} as const

// 波次制：一波战斗固定时长 → 结算横幅 → 整编/商店 → 下一波；上一波阵亡者下波低血复活。
// 有限局：打满 totalWaves 波即通关（进结算页），中途团灭进同一结算页的失败版
export const WAVE = {
  /** 前 shortWaves 波每波 shortMs（快节奏开局），之后每波 longMs */
  shortWaves: 5,
  shortMs: 15_000,
  longMs: 30_000,
  totalWaves: 15,
  /** 终波（Boss 波）时长：击败 Boss 或撑满时长皆通关 */
  finalMs: 45_000,
  reviveHpRatio: 0.3,
  /** 波末结算横幅停留时长：给玩家松手时间，防止战斗输入误触商店按钮 */
  summaryMs: 1600,
} as const

// 敌人：behavior 决定战斗内行为分支（ArenaScene 按此分派）。
// chase 直追最近队员；wanderFire 游荡+朝移动方向放枪；dash 探测→蓄力→直线突刺；
// fleeFire 见人就逃+朝人冷枪；coinThief 抢地上的金币，击杀吐回+利息。
export interface EnemyBulletSpec {
  readonly emoji: string
  readonly size: number
  readonly radius: number
  readonly speed: number
  readonly damage: number
  readonly lifeMs: number
}

interface EnemyBase {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly size: number
  readonly radius: number
  readonly hp: number
  readonly speed: number
  readonly damage: number
  // 经验击杀即得；金币落地需拾取（波次结束未拾取的消失）
  readonly xp: number
  readonly coins: number
}

export interface ChaseEnemySpec extends EnemyBase {
  readonly kind: 'zombie' | 'ghost' | 'mushroom' | 'blob' | 'blobling'
  readonly behavior: 'chase'
  /** 死亡在原地留毒液池（玩家踩入按 tick 掉血） */
  readonly poison?: {
    readonly radius: number
    readonly durationMs: number
    readonly tickMs: number
    readonly damage: number
  }
  /** 死亡分裂出迷你体 */
  readonly split?: { readonly into: ChaseEnemySpec; readonly count: number }
}

export interface WanderFireEnemySpec extends EnemyBase {
  readonly kind: 'invader'
  readonly behavior: 'wanderFire'
  readonly fireIntervalMs: number
  readonly bullet: EnemyBulletSpec
}

export interface DashEnemySpec extends EnemyBase {
  readonly kind: 'boar'
  readonly behavior: 'dash'
  readonly detectRange: number
  readonly windupMs: number
  readonly dashSpeed: number
  readonly dashDist: number
  readonly cooldownMs: number
}

export interface FleeFireEnemySpec extends EnemyBase {
  readonly kind: 'snake'
  readonly behavior: 'fleeFire'
  readonly fleeRange: number
  readonly fireIntervalMs: number
  readonly bullet: EnemyBulletSpec
}

export interface CoinThiefEnemySpec extends EnemyBase {
  readonly kind: 'rat'
  readonly behavior: 'coinThief'
}

export type EnemySpec =
  | ChaseEnemySpec
  | WanderFireEnemySpec
  | DashEnemySpec
  | FleeFireEnemySpec
  | CoinThiefEnemySpec

export const ZOMBIE: ChaseEnemySpec = {
  kind: 'zombie',
  behavior: 'chase',
  emoji: '🧟',
  name: '僵尸',
  desc: '缓慢但成群，最基础的追击者',
  size: 1 * UNIT,
  radius: 0.5 * UNIT,
  hp: 60,
  speed: 1.375 * UNIT,
  damage: 8,
  xp: 3,
  coins: 1,
}

export const GHOST: ChaseEnemySpec = {
  kind: 'ghost',
  behavior: 'chase',
  emoji: '👻',
  name: '幽灵',
  desc: '飘得很快的追击者，血薄',
  size: 0.9 * UNIT,
  radius: 0.45 * UNIT,
  hp: 25,
  speed: 2.875 * UNIT,
  damage: 5,
  xp: 2,
  coins: 1,
}

/** 游荡射手：不索敌，慢速乱逛，周期性朝自己移动方向放一发慢弹（弹幕污染走位空间） */
export const INVADER: WanderFireEnemySpec = {
  kind: 'invader',
  behavior: 'wanderFire',
  emoji: '👾',
  name: '外星怪',
  desc: '不追人，游荡途中朝前方吐慢速弹',
  size: 0.95 * UNIT,
  radius: 0.48 * UNIT,
  hp: 40,
  speed: 0.9 * UNIT,
  damage: 6,
  xp: 4,
  coins: 2,
  fireIntervalMs: 2800,
  bullet: { emoji: '🔴', size: 0.3 * UNIT, radius: 0.14 * UNIT, speed: 3 * UNIT, damage: 6, lifeMs: 4500 },
}

/** 突刺怪：探测圈内锁定蓄力方向 → 短延迟 → 直线冲刺一段距离（横向位移可躲） */
export const BOAR: DashEnemySpec = {
  kind: 'boar',
  behavior: 'dash',
  emoji: '🐗',
  name: '野猪',
  desc: '发现猎物后蓄力直线突刺，横向可躲',
  size: 1.05 * UNIT,
  radius: 0.52 * UNIT,
  hp: 80,
  speed: 1.1 * UNIT,
  damage: 10,
  xp: 5,
  coins: 2,
  detectRange: 4 * UNIT,
  windupMs: 550,
  dashSpeed: 8 * UNIT,
  dashDist: 3.5 * UNIT,
  cooldownMs: 1800,
}

/** 逃跑射手：见人就拉开距离，周期性朝人吐慢速毒弹（制造追不追的抉择） */
export const SNAKE: FleeFireEnemySpec = {
  kind: 'snake',
  behavior: 'fleeFire',
  emoji: '🐍',
  name: '毒蛇',
  desc: '见人就溜，边逃边回头吐毒弹',
  size: 0.95 * UNIT,
  radius: 0.45 * UNIT,
  hp: 35,
  speed: 2.4 * UNIT,
  damage: 5,
  xp: 4,
  coins: 2,
  fleeRange: 5 * UNIT,
  fireIntervalMs: 2600,
  bullet: { emoji: '🟢', size: 0.3 * UNIT, radius: 0.14 * UNIT, speed: 3.2 * UNIT, damage: 5, lifeMs: 4500 },
}

/** 毒爆怪：慢速近战，死亡原地留毒液池（别在自己的风筝路线上打爆它） */
export const MUSHROOM: ChaseEnemySpec = {
  kind: 'mushroom',
  behavior: 'chase',
  emoji: '🍄',
  name: '毒蘑菇',
  desc: '死亡时在原地留下一片毒液',
  size: 0.95 * UNIT,
  radius: 0.46 * UNIT,
  hp: 50,
  speed: 1 * UNIT,
  damage: 6,
  xp: 4,
  coins: 2,
  poison: { radius: 1.6 * UNIT, durationMs: 3000, tickMs: 500, damage: 4 },
}

/** 偷金币鼠：不理玩家，直奔地上最近的金币吃掉；击杀吐回吃掉的 + 1 枚利息 */
export const RAT: CoinThiefEnemySpec = {
  kind: 'rat',
  behavior: 'coinThief',
  emoji: '🐀',
  name: '偷币鼠',
  desc: '专偷地上的金币，击杀可全额讨回并有利息',
  size: 0.8 * UNIT,
  radius: 0.4 * UNIT,
  hp: 30,
  speed: 3.2 * UNIT,
  damage: 3,
  xp: 3,
  coins: 1,
}

export const BLOBLING: ChaseEnemySpec = {
  kind: 'blobling',
  behavior: 'chase',
  emoji: '🫧',
  name: '小泡泡',
  desc: '泡泡分裂出的迷你体，快而脆',
  size: 0.55 * UNIT,
  radius: 0.28 * UNIT,
  hp: 18,
  speed: 2.6 * UNIT,
  damage: 4,
  xp: 1,
  coins: 0,
}

/** 分裂怪：死亡分裂成 2 只更小更快的迷你泡泡 */
export const BLOB: ChaseEnemySpec = {
  kind: 'blob',
  behavior: 'chase',
  emoji: '🫧',
  name: '泡泡',
  desc: '被击破时分裂成两只小泡泡',
  size: 1.15 * UNIT,
  radius: 0.55 * UNIT,
  hp: 70,
  speed: 1.2 * UNIT,
  damage: 6,
  xp: 4,
  coins: 2,
  split: { into: BLOBLING, count: 2 },
}

export const ENEMY_SPECS: readonly EnemySpec[] = [
  ZOMBIE,
  GHOST,
  INVADER,
  BOAR,
  SNAKE,
  MUSHROOM,
  RAT,
  BLOB,
  BLOBLING,
]

// 出场配比：新怪按波次渐入（sinceWave），僵尸/幽灵始终是主体；
// 权重随波次线性微调，zombie 有下限兜底（见 core/enemies.ts enemyMixAt）
export const ENEMY_MIX = [
  { kind: 'zombie', sinceWave: 1, base: 80, perWave: -2, min: 40, max: 80 },
  { kind: 'ghost', sinceWave: 1, base: 15, perWave: 1, min: 15, max: 32 },
  { kind: 'invader', sinceWave: 2, base: 8, perWave: 0.3, min: 0, max: 12 },
  { kind: 'boar', sinceWave: 3, base: 8, perWave: 0.4, min: 0, max: 16 },
  { kind: 'snake', sinceWave: 4, base: 7, perWave: 0.3, min: 0, max: 10 },
  { kind: 'mushroom', sinceWave: 4, base: 7, perWave: 0.4, min: 0, max: 14 },
  { kind: 'rat', sinceWave: 5, base: 5, perWave: 0.3, min: 0, max: 10 },
  { kind: 'blob', sinceWave: 5, base: 7, perWave: 0.4, min: 0, max: 14 },
] as const

// 金币拾取是团队能力：磁吸与入账都以队伍中心为基点（拾取范围类道具挂队长）
export const COIN = {
  emoji: '🪙',
  size: 0.45 * UNIT,
  radius: 0.22 * UNIT,
  magnetRadius: 2.25 * UNIT,
  magnetSpeed: 8 * UNIT,
  collectRadius: 0.5 * UNIT,
} as const

// 刷怪节奏（波次制）：第 1 波基础火力可稳过，随跨波累计战斗时长持续加压，
// 后期压力超出基础火力，由商店成长补差
export const SPAWN = {
  startIntervalMs: 450,
  minIntervalMs: 80,
  rampSeconds: 300,
  hpGrowthPerMin: 0.5,
  maxAlive: 400,
  // 刷怪供给随在场人数缩放：factor = base + perMember×人数（5 人 = 1.0），
  // 让单人首发的第 1 波与满编后期压力手感一致
  teamFactorBase: 0.35,
  teamFactorPerMember: 0.13,
  // 地图内随机刷怪：先显示预告标记再落地
  telegraphMs: 900,
  markEmoji: '⚠️',
  markSize: 0.75 * UNIT,
  minPlayerDist: 3 * UNIT,
  edgeInset: 0.5 * UNIT,
} as const

// 精英怪：第 fromWave 波起按概率出现——金色描边 + 三围强化，掉更多经验金币。
// 强化走乘数（血量在刷怪时算入，移速/伤害在运行时按敌身上的标记生效）
export const ELITE = {
  fromWave: 10,
  chance: 0.15,
  hpMul: 4,
  speedMul: 1.25,
  damageMul: 2,
  sizeMul: 1.2,
  xpMul: 4,
  coinsMul: 3,
} as const

// 敌人潮：第 wave 波开局的一波密集冲锋（含保底精英），配警示横幅
export const SURGE = {
  wave: 10,
  count: 14,
  elites: 3,
  /** 潮水在这段时间内陆续落地 */
  spreadMs: 2600,
} as const

// 终局 Boss（最后一波）：大体型 + 周期环形弹幕 + 蓄力突刺；击退免疫。
// 血量固定不吃时间成长曲线（平衡按满编 15 波队伍校准），击败或撑满时长皆通关
export const BOSS = {
  emoji: '👹',
  name: '赤鬼',
  size: 2.4 * UNIT,
  radius: 1.05 * UNIT,
  hp: 4000,
  /** 平时缓速逼近队伍中心 */
  speed: 1.4 * UNIT,
  damage: 20,
  xp: 60,
  coins: 40,
  /** 环形弹幕：周期性向四周均匀发射（带随机整体旋转） */
  ring: {
    count: 12,
    intervalMs: 2800,
    bullet: { emoji: '🟣', size: 0.34 * UNIT, radius: 0.16 * UNIT, speed: 2.4 * UNIT, damage: 8, lifeMs: 6000 },
  },
  /** 突刺循环：蓄力提示后朝队伍中心猛冲 */
  dash: { intervalMs: 5600, windupMs: 750, speed: 8 * UNIT, durationMs: 450 },
  /** 终波常规刷怪减压倍率（间隔 ×N）：把火力焦点留给 Boss */
  spawnRelief: 2,
} as const

// 无限地图（kind='infinite' 的关卡）：无边界世界 + 活跃方形 + 终波缩圈。
// 活跃判定用按轴距离（Chebyshev 方形）：与地图/分块/视口的矩形几何同构；
// 32 格半边长 > 有限地图对角任意两点的轴距（25）——未来把有限图统一进
// 同一机制时，图上永远无人休眠，行为零差异
export const INFINITE = {
  /** 活跃方形半边长：超出的敌人休眠（冻结 AI/物理/不占刷怪上限，保留全状态） */
  activeHalf: 32 * UNIT,
  /** 刷怪环带（以队伍中心为圆心）：内环避脸；外环 = 活跃半边长之半——
   * 奔跑方向的前方早有已落地的敌人在等，一直跑不能白嫖（多数落点在屏外，
   * 近处落点仍有 ⚠️ 预告） */
  spawnRingMin: 4 * UNIT,
  spawnRingMax: 16 * UNIT,
  /** 装饰分块边长（格）：块 = 精灵批量建/销毁的粒度，噪声连续性与块无关 */
  chunkCells: 8,
  /** 装饰活跃范围 = 相机视野外扩的块数（销毁再多留一块防抖） */
  chunkPad: 1,
} as const

// 终波缩圈（无限地图的 Boss 战边界）：圈心 = 终波开始时的队伍中心。
// 它不是吃鸡式终局压缩——只为封住「跑得比 Boss 快就能无限避战」：
// 半径先停留（让玩家看清圈）再缓缩 4 格即停，之后恒为 rMin 的固定竞技场；
// 圈外队员按 tick 掉血，敌人不受圈伤
export const ZONE = {
  r0: 16 * UNIT,
  rMin: 12 * UNIT,
  /** 开圈后的静止观察期 */
  holdMs: 6000,
  /** 收缩结束时刻（此后维持 rMin 到波末） */
  shrinkEndMs: 38_000,
  tickMs: 500,
  tickDamage: 6,
} as const

// 河流地图（kind='river'）：单屏固定竞技场 + 恒定水流。
// 相机静止，世界 = 逻辑视口；河道沿长轴居中（横屏水平、竖屏垂直），
// 宽恒 10 格，短边余量为两岸暗带。水流 = 全员恒定漂移（子弹除外），
// 顺流快/逆流慢/挂机漂向下游都由这一个矢量自然涌现。
// 只有玩家与 Boss 被钳在河道内；敌人/金币自由出界——敌人沿用无限图
// 休眠机制（32 格）并会逆流游回，金币漂出下游即冲走
export const RIVER = {
  /** 视野倍率：单屏固定相机下 20 格视野太挤，放大到 1280 逻辑宽 → 24 格
   * （世界尺寸 = 逻辑视口 × viewScale，实体相应显小） */
  viewScale: 1.2,
  /** 河道宽度（跨流向恒定）：最小屏短边 13.5 格，留出两岸各 0.75 格 */
  width: 12 * UNIT,
  /** 流速：恒定漂移速度（队伍移速 5.5 格/秒 → 顺流 6.5、逆流 4.5，
   * 挂机 20 秒漂完整条河，站位压力明显但可对抗） */
  flow: 1 * UNIT,
  /** 金币漂出下游边界这一距离后清理（玩家钳在屏内，永远追不回） */
  coinCullPad: 2 * UNIT,
  /** 水面漂浮物数量（🍃🌸🫧 顺流循环，流向的直白提示） */
  driftCount: 18,
  /** 漂浮物个体速度倍率区间（再乘河心快近岸慢的剖面） */
  driftSpeedMul: [0.75, 1.3],
  /** 双层水纹滚动速度（视差；只是贴图偏移，与实体漂移无关，约为流速的 0.6/1.2 倍） */
  waveSlow: 0.6 * UNIT,
  waveFast: 1.2 * UNIT,
} as const

// 虚空地图（kind='void'）：固定尺寸的环面竞技场，四边是传送门。
// 相机静止且视口裁剪出屏幕内最大居中的 16:9（竖屏 9:16）区域，非该比例
// 的屏幕多余处留空白；场内一切实体（含玩家/Boss/子弹）坐标按模回绕，
// 没有任何墙。索敌/AI/磁吸全部用环面最短差（core/void.ts）
export const VOID = {
  /** 竞技场长边（16:9 的 16 → 24 格，与河流同款 1.2 视野密度） */
  arenaLong: 24 * UNIT,
  /** 竞技场短边（13.5 格） */
  arenaShort: 13.5 * UNIT,
  /** 条带相机宽度：四缝各一条 + 四角，渲染实体跨缝时的对侧分身 */
  strip: 1.5 * UNIT,
  /** 玩家子弹寿命：环面上永远飞不出屏幕，必须按时限回收 */
  projectileLifeMs: 1500,
  /** 传送门门框光带厚度 */
  frame: 0.3 * UNIT,
} as const

// 压力测试模式（🔧 面板开关）：拉高负载且保证测得下去
export const STRESS = {
  maxHp: 10_000_000,
  spawnIntervalMs: 80,
  spawnBatch: 5,
  maxAlive: 800,
  // 所有武器冷却乘数（0.1 = 十倍攻速）
  cooldownMul: 0.1,
} as const

// 经验：等比升级曲线（前快后慢），点数经济见 core/run.ts。
// 经验/等级无上限（点数花不出去也继续涨，作容错溢出）；曲线放缓换更高点数产出。
// 满配需求 = 5 人 × 6 级 = 30 点；校准目标：无经验加成队长 15 波约 22~24 点，
// 快队长可摸满、慢队长 ~18，保留「点数不够、必须取舍」的决策
export const XP = {
  base: 45,
  growth: 1.14,
  /** 波末保底经验 = base + perWave×波次：15 波制下是经验主梁之一，
   * 保证前几波（15 秒短波杀怪少）每波也能升级 */
  waveBonusBase: 40,
  waveBonusPerWave: 36,
} as const

// 角色等级：1 拥有 · 2/4/5 维度数值（core/levels.ts）· 3/6 特殊能力
// （core/abilities.ts）。普通模式满级 6；无尽模式后续放开 7+（纯数值）
export const LEVELS = { max: 6 } as const

// 商店：每个上架位可付费重新随机（队长可提供免费次数）
export const SHOP = { refreshPrice: 2 } as const

// 角色受击时的相机震动
export const HIT_SHAKE = { durationMs: 60, intensity: 0.0012 } as const

// 剪影描边（radius 单位 = twemoji viewBox 单位，36 格）：按阵营配色
// 玩家侧黑、敌人紫、敌方子弹红、精英/Boss 金——一眼分清敌我与威胁等级
export const OUTLINE = {
  radius: 2,
  colors: {
    player: '#000000',
    enemy: '#8e24aa',
    enemyShot: '#d32f2f',
    elite: '#ffb300',
  },
} as const

export type OutlineKind = keyof typeof OUTLINE.colors

const roster: readonly CharacterSpec[] = Object.values(CHARACTERS)

// 描边变体按阵营分组预载：玩家侧黑、敌人紫、敌方子弹红
export const OUTLINED_EMOJIS: Record<OutlineKind, readonly string[]> = {
  player: [
    ...roster.map((c) => c.emoji),
    ...Object.values<CaptainSpec>(CAPTAINS).map((c) => c.emoji),
    ...roster.flatMap((c) =>
      c.weapons.flatMap((w) => [
        ...('held' in w && w.held ? [w.held.emoji] : []),
        ...(w.kind === 'projectile' ? [w.projectile.emoji] : []),
      ]),
    ),
    COIN.emoji,
    '➕',
    '💀',
    // 财迷「天降横财」的金袋投掷物
    '💰',
    // 地图地面装饰 + 河流水面漂浮物：与玩家侧同款黑描边（低透明度贴地/浮水）
    ...new Set(
      Object.values<MapSpec>(MAPS).flatMap((m) => [...m.decor.emojis, ...(m.drift ?? [])]),
    ),
  ],
  enemy: [...new Set(ENEMY_SPECS.map((e) => e.emoji))],
  enemyShot: [
    ...new Set([
      ...ENEMY_SPECS.flatMap((e) => ('bullet' in e ? [e.bullet.emoji] : [])),
      BOSS.ring.bullet.emoji,
    ]),
  ],
  // 精英变体（含 Boss）：金边
  elite: [...new Set(ENEMY_SPECS.map((e) => e.emoji)), BOSS.emoji],
}

// 启动时预载的 emoji（含 UI 图标）；其余全集按需加载（ui/emoji.ts ensureEmoji）
export const PRELOAD_EMOJIS: readonly string[] = [
  ...Object.values(OUTLINED_EMOJIS).flat(),
  // 属性面板的武器/基础组图标 + 商店道具图标
  ...roster.flatMap((c) => c.weapons.map((w) => w.icon)),
  ...Object.values<{ emoji: string }>(ITEMS).map((i) => i.emoji),
  // 地图图标（选择页素体）+ 地图详情组图标；装饰的描边变体在 OUTLINED_EMOJIS.player
  ...Object.values(MAPS).map((m) => m.emoji),
  '🗺️',
  '🚧',
  ...SETTING_DEFS.map((d) => d.icon),
  SPAWN.markEmoji,
  // 属性面板「特殊能力」组图标
  '⭐',
  '⚙️',
  '📖',
  '🌐',
  '➕',
  '⬆️',
  '⚔️',
  '🏆',
  '⚡',
  '👟',
  '❤️',
  '🔧',
  '✅',
  '⏸️',
  '👑',
  // 主菜单 Emoji Studio 入口图标（studio 页内素材按需加载）
  '🧪',
]
