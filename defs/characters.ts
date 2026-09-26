import type { CharacterAuthoring } from '../src/types/characters'

export const CHARACTERS = {
  juggler: {
    emoji: '1f939',
    name: '杂耍演员',
    desc: '向最近的敌人连续抛掷番茄',
    body: { thrust: 30, drag: 5, mass: 0.9 },
    skill: { name: '全场蹦迪', icon: '1f57a', desc: '全场敌人跟着蹦迪，短时间失去行动', cdMs: 30_000, ability: 'discoFever' },
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
    body: { thrust: 34, drag: 4.5, mass: 1 },
    skill: { name: '彩虹冲锋', icon: '1f308', desc: '朝指定方向冲刺四格，沿途敌人受伤并被撞开', cdMs: 7000, ability: 'rainbowRush', aim: true },
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
    body: { thrust: 17, drag: 4.5, mass: 1.8 },
    skill: { name: '嘲讽怒吼', icon: '1f4e2', desc: '五格内的敌人三秒内只追巨魔，期间他受到的伤害减半', cdMs: 20_000, ability: 'trollRoar' },
    weapons: ['axe'],
    innate: [],
  },
  cowboy: {
    emoji: '1f920',
    name: '牛仔',
    desc: '左右双枪齐发，射出高速水弹',
    body: { thrust: 29, drag: 5, mass: 1 },
    skill: { name: '天降横财', icon: '1f4b0', desc: '钱袋从天而降砸向最近的敌人，每次命中掉一枚金币', cdMs: 20_000, ability: 'goldRain' },
    weapons: ['pistolLeft', 'pistolRight'],
    innate: [],
  },
  mage: {
    emoji: '1f9d9',
    name: '法师',
    desc: '在远处敌人脚下引爆奥术轰炸',
    body: { thrust: 25, drag: 5, mass: 0.9 },
    skill: { name: '弱点讲义', icon: '1f4d6', desc: '八秒内全队伤害提高六成', cdMs: 30_000, ability: 'weaknessLecture' },
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
    body: { thrust: 28, drag: 4, mass: 0.9 },
    skill: { name: '弹跳践踏', icon: '1f4a5', desc: '朝指定方向跃出四格，落地时范围伤害并击退', cdMs: 14_000, ability: 'bounceStomp', aim: true },
    weapons: ['boomerang'],
    innate: [],
  },
  robot: {
    emoji: '1f916',
    name: '机器人',
    desc: '手持激光器，灼穿一条直线上的所有敌人',
    body: { thrust: 21, drag: 5, mass: 1.4 },
    skill: { name: '降维打击', icon: '2604', desc: '全场敌人受到一次巨额伤害，Boss 减半', cdMs: 45_000, ability: 'dimensionStrike' },
    weapons: ['laserBeam'],
    innate: [],
  },
  snowman: {
    emoji: '26c4',
    name: '雪人',
    desc: '以队伍中心散发寒气，持续减速范围内的敌人',
    body: { thrust: 17.5, drag: 5, mass: 1.5 },
    skill: { name: '时停', icon: '23f3', desc: '时间停止一段时间，静止时全场近乎凝固', cdMs: 45_000, ability: 'timeFreeze' },
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
    desc: '魔尘弹把敌人整个变成一只无能力的绵羊——暂时失去攻击、被动与亡语，只保留血量，一段时间后恢复；同一敌人变羊有冷却',
    body: { thrust: 32, drag: 5, mass: 0.5 },
    skill: { name: '变形派对', icon: '1f411', desc: '三格半内的敌人全部变成绵羊四秒', cdMs: 30_000, ability: 'sheepParty' },
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
    body: { thrust: 32, drag: 4, mass: 0.7 },
    skill: { name: '影遁', icon: '1f32b', desc: '三秒内全队不被敌人锁定，敌人只会乱走', cdMs: 25_000, ability: 'shadowVeil' },
    weapons: ['dagger'],
    innate: [],
  },
  beaver: {
    emoji: '1f9ab',
    name: '河狸工程师',
    desc: '自己不动手，定期在脚下架起自动开火的弩塔',
    body: { thrust: 22, drag: 5.5, mass: 1.1 },
    skill: { name: '工程速建', icon: '1f3d7', desc: '立刻在周围架起三座弩塔，持续十秒', cdMs: 20_000, ability: 'quickBuild' },
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
    desc: '每隔一阵放出一群小蜂，自主寻路蜇敌施毒后自毁，优先扑向未中毒的目标',
    body: { thrust: 25, drag: 4.5, mass: 0.8 },
    skill: { name: '蜜蜂王庭', icon: '1f36f', desc: '生成四格领域六秒：队友持续回血，敌人持续中毒', cdMs: 24_000, ability: 'beeCourt' },
    weapons: [],
    innate: [
      {
        name: '毒蜂群',
        icon: '1f41d',
        base: 'beeSwarm',
        upgrades: [
          { ability: 'beeSwarm2', card: { icon: '1f41d', name: '扩巢', desc: '每波小蜂 +1 只' } },
          { ability: 'beeSwarm3', card: { icon: '1f9a0', name: '剧毒麻痹', desc: '毒素更烈，蜇中附带 45% 减速 1.2 秒' } },
        ],
      },
    ],
  },
  medic: {
    emoji: '1f9d1_200d_2695_fe0f',
    name: '军医',
    desc: '周期治疗附近血量最低的队友，顺手甩两支飞针',
    body: { thrust: 26, drag: 5, mass: 1 },
    skill: { name: '急救包', icon: '2695', desc: '倒地队友立刻复活，存活者回血一半，全队无敌两秒', cdMs: 45_000, ability: 'holyLight' },
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
    body: { thrust: 13.5, drag: 3, mass: 0.8 },
    skill: { name: '电磁脉冲', icon: '1f329', desc: '六格内所有敌人受到一次电击并减速六成三秒', cdMs: 18_000, ability: 'emPulse' },
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

