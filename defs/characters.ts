import { WEAPONS } from './weapons.ts'
import type { WeaponSource } from '../src/weapons/registry'
import type { CharacterAuthoring, InnateSource } from '../src/characters/registry'

// 创作层（不进运行时 bundle）：角色数据行。一个角色由两类攻击来源组成——
// 「持有的武器」（weapons，引用 defs/weapons.ts 的实体武器）与「自带的徒手
// 能力」（innate，无实体武器，直接引用能力）。二者都自带升级路径（base + 各档）。
// gen 直接写出载体形态的 characters.json，运行时统一成 Carrier 消费；
// 商店升级卡文案（defs/items.ts）由 characterCard 从各载体档位派生（多载体去重）。

export const CHARACTERS = {
  juggler: {
    emoji: '1f939',
    name: '杂耍演员',
    desc: '向最近的敌人连续抛掷番茄',
    orbit: -0.5,
    weapons: [],
    innate: [
      {
        name: '番茄连投',
        icon: '1f345',
        base: 'tomatoThrow',
        upgrades: [
          { ability: 'tomatoThrow2', card: { icon: '1f345', name: '三重抛掷', desc: '每次投掷同时抛出 3 枚番茄，扇形散开' } },
          { ability: 'tomatoThrow3', card: { icon: '1f4a5', name: '爆浆番茄', desc: '番茄命中后爆裂，对周围敌人造成 60% 溅射伤害' } },
        ],
      },
    ],
  },
  unicorn: {
    emoji: '1f984',
    name: '独角兽',
    desc: '独角向前突刺，穿透沿途敌人',
    orbit: 0.8,
    weapons: [],
    innate: [
      {
        name: '独角突刺',
        icon: '2694',
        base: 'hornThrust',
        upgrades: [
          { ability: 'hornThrust2', card: { icon: '26a1', name: '二连突刺', desc: '每次出手连刺两段，第二段重新索敌' } },
          { ability: 'hornThrust3', card: { icon: '1f308', name: '虹光震波', desc: '突刺终点爆发冲击波：60% 范围伤害并强力击退' } },
        ],
      },
    ],
  },
  troll: {
    emoji: '1f9cc',
    name: '巨魔',
    desc: '挥舞巨斧，横扫身前扇形范围',
    orbit: 1,
    weapons: ['axe'],
    innate: [],
  },
  cowboy: {
    emoji: '1f920',
    name: '牛仔',
    desc: '左右双枪齐发，射出高速水弹',
    orbit: -0.7,
    weapons: ['pistolLeft', 'pistolRight'],
    innate: [],
  },
  mage: {
    emoji: '1f9d9',
    name: '法师',
    desc: '在远处敌人脚下引爆奥术轰炸',
    orbit: -1,
    weapons: [],
    innate: [
      {
        name: '奥术轰炸',
        icon: '1f4a5',
        base: 'arcaneBlast',
        upgrades: [
          { ability: 'arcaneBlast2', card: { icon: '1f525', name: '余烬秘火', desc: '轰炸在爆心留下灼烧地面，3 秒内持续烧伤敌人' } },
          { ability: 'arcaneBlast3', card: { icon: '2728', name: '连锁轰炸', desc: '轰炸后 0.25 秒向随机敌人追加一次 75% 伤害的轰炸' } },
        ],
      },
    ],
  },
  kangaroo: {
    emoji: '1f998',
    name: '袋鼠',
    desc: '掷出回旋镖，去程回程皆可伤敌',
    orbit: 0.4,
    weapons: ['boomerang'],
    innate: [],
  },
  robot: {
    emoji: '1f916',
    name: '机器人',
    desc: '手持激光器，灼穿一条直线上的所有敌人',
    orbit: -0.6,
    weapons: ['laserBeam'],
    innate: [],
  },
  snowman: {
    emoji: '26c4',
    name: '雪人',
    desc: '以队伍中心散发寒气，持续减速范围内的敌人',
    orbit: 0,
    weapons: [],
    innate: [
      {
        name: '寒气光环',
        icon: '2744',
        base: 'frostAura',
        upgrades: [
          { ability: 'frostAura2', card: { icon: '1fa79', name: '冻伤', desc: '寒气光环每秒对范围内敌人造成 6 点伤害' } },
          { ability: 'frostAura3', card: { icon: '1f328', name: '凛冬降临', desc: '每 5 秒光环脉冲一次，冻结范围内敌人 0.7 秒' } },
        ],
      },
    ],
  },
  fairy: {
    emoji: '1f9da',
    name: '仙子',
    desc: '魔尘弹把敌人变形成无害的绵羊，变形期间不能伤人',
    orbit: -0.6,
    weapons: [],
    innate: [
      {
        name: '魔尘弹',
        icon: '1fa84',
        base: 'sparkleBolt',
        upgrades: [
          { ability: 'sparkleBolt2', card: { icon: '1f411', name: '持久变形', desc: '变形时长延长到 4 秒，魔尘弹可贯穿 1 名敌人' } },
          { ability: 'sparkleBolt3', card: { icon: '1f494', name: '脆弱诅咒', desc: '被变形的敌人受到的所有伤害提高 40%' } },
        ],
      },
    ],
  },
  assassin: {
    emoji: '1f977',
    name: '刺客',
    desc: '瞬移到范围内血最厚的敌人背后重斩一刀，再闪回原位；出手瞬间无敌',
    orbit: 0.5,
    weapons: ['dagger'],
    innate: [],
  },
  beaver: {
    emoji: '1f9ab',
    name: '河狸工程师',
    desc: '自己不动手，定期在脚下架起自动开火的弩塔',
    orbit: -0.3,
    weapons: [],
    innate: [
      {
        name: '林木弩塔',
        icon: '1f3f9',
        base: 'woodTurret',
        upgrades: [
          { ability: 'woodTurret2', card: { icon: '1f3d7', name: '扩建工地', desc: '同时在场的弩塔上限 +1' } },
          { ability: 'woodTurret3', card: { icon: '1f3af', name: '三连弩', desc: '弩塔每次开火改为 3 发扇形连射' } },
        ],
      },
    ],
  },
  queenBee: {
    emoji: '1f41d',
    name: '蜂后',
    desc: '统领一小群蜜蜂，蜂群自主追击撞刺敌人',
    orbit: -0.2,
    weapons: [],
    innate: [
      {
        name: '蜂群',
        icon: '1f41d',
        base: 'beeSwarm',
        upgrades: [
          { ability: 'beeSwarm2', card: { icon: '1f41d', name: '扩巢', desc: '蜂群 +1 只' } },
          { ability: 'beeSwarm3', card: { icon: '1f9a0', name: '麻痹毒素', desc: '被蜇中的敌人减速 45%，持续 1.2 秒' } },
        ],
      },
    ],
  },
  medic: {
    emoji: '1f9d1_200d_2695_fe0f',
    name: '军医',
    desc: '周期治疗附近血量最低的队友，顺手甩两支飞针',
    orbit: -0.8,
    weapons: [],
    innate: [
      {
        name: '战地医疗',
        icon: '1f48a',
        base: 'fieldMedkit',
        upgrades: [
          { ability: 'fieldMedkit2', card: { icon: '1f97c', name: '群体处方', desc: '治疗改为范围内全体队友回复 60% 治疗量' } },
          { ability: 'fieldMedkit3', card: { icon: '26a1', name: '电击起搏', desc: '范围内有阵亡队友时，优先为其减少 2 秒复活倒计时' } },
        ],
      },
      { name: '飞针', icon: '1f489', base: 'syringeDart', upgrades: [] },
    ],
  },
  jellyfish: {
    emoji: '1fabc',
    name: '水母',
    desc: '电弧在敌群间弹跳传导，敌人越密越疼',
    orbit: 0.2,
    weapons: [],
    innate: [
      {
        name: '感电触须',
        icon: '26a1',
        base: 'voltArc',
        upgrades: [
          { ability: 'voltArc2', card: { icon: '1f517', name: '超导传递', desc: '电弧额外弹跳数提升到 4 跳' } },
          { ability: 'voltArc3', card: { icon: '1f4a5', name: '过载爆裂', desc: '最后一跳落点爆出小范围电击，波及 60% 伤害' } },
        ],
      },
    ],
  },
} as const satisfies Record<string, CharacterAuthoring>

// ── 载体展平：把 weapons + innate 两类载体按档位展平回旧的 abilities/upgrades ──

const WEAPON_MAP = WEAPONS as Record<string, WeaponSource>

/** 一个载体（武器或徒手能力）的档位视图：base + 各升级档 */
interface Carrier {
  readonly base: string
  readonly upgrades: InnateSource['upgrades']
}

function carriersOf(c: CharacterAuthoring): Carrier[] {
  return [
    ...c.weapons.map((wid) => {
      const w = WEAPON_MAP[wid]!
      return { base: w.base, upgrades: w.upgrades }
    }),
    ...c.innate.map((i) => ({ base: i.base, upgrades: i.upgrades })),
  ]
}

/** 角色在指定档位的升级卡（多载体同档取首个有升级的载体；gen 校验同档卡一致） */
export function characterCard(c: CharacterAuthoring, index: 0 | 1): { icon: string; name: string; desc: string } {
  for (const cr of carriersOf(c)) {
    const u = cr.upgrades[index]
    if (u) return u.card
  }
  throw new Error('角色缺升级档')
}
