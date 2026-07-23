import type { EnemyDef } from '../src/enemies/registry'

// 创作层（不进运行时 bundle）：敌人/Boss/出场配比数据行。
// split.into 的对象引用在生成时内联展开为自包含 JSON。

export const ZOMBIE: EnemyDef = {
  kind: 'zombie',
  locomotion: { kind: 'chase' },
  emoji: '1f9df',
  name: '僵尸',
  desc: '缓慢但成群，最基础的追击者',
  size: 1.35,
  radius: 0.5,
  hp: 60,
  speed: 1.375,
  damage: 8,
  xp: 3,
  coins: 2,
}

export const GHOST: EnemyDef = {
  kind: 'ghost',
  locomotion: { kind: 'chase' },
  emoji: '1f47b',
  name: '幽灵',
  // 穿墙：无视断壁直线飘向队伍——残垣图里墙挡不住它（专治猥琐龟缩）
  phasesWalls: true,
  desc: '飘得很快的追击者，血薄，能穿墙直取队伍，死亡时治疗周围同伴',
  size: 1.2,
  radius: 0.45,
  hp: 25,
  speed: 2.875,
  damage: 5,
  xp: 2,
  coins: 2,
  // 亡语：临终把生气渡给周围受伤的同伴（先集火它反而奶了一片）
  onDeath: [{ kind: 'heal', range: 3, amount: 12, all: true }],
}

/** 游荡射手：不索敌，慢速乱逛，周期性朝自己移动方向放一发慢弹（弹幕污染走位空间） */
export const INVADER: EnemyDef = {
  kind: 'invader',
  locomotion: { kind: 'wander' },
  emoji: '1f47e',
  name: '外星怪',
  desc: '不追人，游荡途中朝前方吐慢速弹，死亡放一记冷枪',
  size: 1.25,
  radius: 0.48,
  hp: 40,
  speed: 0.9,
  damage: 6,
  xp: 4,
  coins: 3,
  abilities: [
    {
      kind: 'projectile',
      damage: 6,
      cooldownMs: 2800,
      knockback: 0,
      aim: 'move',
      lifeMs: 4500,
      projectile: { emoji: '1f534', size: 0.4, radius: 0.14, speed: 3, rotationOffsetDeg: 0 },
    },
  ],
  // 亡语：朝断气那一刻最近队员的方向补一发慢速冷枪（击杀后仍要走位）
  onDeath: [
    {
      kind: 'spawnProjectile',
      aim: 'nearest',
      damage: 8,
      lifeMs: 6000,
      projectile: { emoji: '1f6f8', size: 0.6, radius: 0.2, speed: 1.5, rotationOffsetDeg: 0 },
    },
  ],
}

/** 突刺怪：探测圈内锁定蓄力方向 → 短延迟 → 直线冲刺一段距离（横向位移可躲） */
export const BOAR: EnemyDef = {
  kind: 'boar',
  emoji: '1f417',
  name: '野猪',
  desc: '发现猎物后蓄力直线突刺，横向可躲，死亡留半透明尸壳诱骗火力',
  size: 1.4,
  radius: 0.52,
  hp: 80,
  speed: 1.1,
  damage: 10,
  xp: 5,
  coins: 3,
  locomotion: {
    kind: 'dash',
    trigger: { kind: 'detect', range: 4, cooldownMs: 1800 },
    length: { kind: 'dist', dist: 3.5 },
    windupMs: 550,
    dashSpeed: 8,
    idle: 'wander',
    aim: 'nearest',
    lockAt: 'windup',
  },
  // 亡语：原地化作半透明尸壳，无伤害无行为但能吸引火力，3 秒后消散
  onDeath: [{ kind: 'decoy', hp: 40, durationMs: 3000, alpha: 0.5 }],
}

/** 定距射手：在玩家外维持固定站位环，够不着就凑近、太近才后退，站定吐慢速毒弹
 * （几百只会在玩家四周围成一圈，玩家一动整体重新贴距离） */
export const SNAKE: EnemyDef = {
  kind: 'snake',
  emoji: '1f40d',
  name: '毒蛇',
  desc: '围着玩家维持定距，站定吐毒弹，太近才后退',
  size: 1.25,
  radius: 0.45,
  hp: 35,
  speed: 2.4,
  damage: 5,
  xp: 4,
  coins: 3,
  locomotion: { kind: 'standoff', detectRange: 8, standoffDist: 5 },
  abilities: [
    {
      kind: 'projectile',
      damage: 5,
      cooldownMs: 2600,
      knockback: 0,
      // 索敌上限略大于站位距离：站定时也够得着玩家开火
      range: 8,
      lifeMs: 4500,
      projectile: { emoji: '1f7e2', size: 0.4, radius: 0.14, speed: 3.2, rotationOffsetDeg: 0 },
    },
  ],
}

/** 毒爆怪：慢速近战，死亡原地留毒液池（别在自己的风筝路线上打爆它） */
export const MUSHROOM: EnemyDef = {
  kind: 'mushroom',
  locomotion: { kind: 'chase' },
  emoji: '1f344',
  name: '毒蘑菇',
  desc: '死亡时在原地留下一片毒液',
  size: 1.25,
  radius: 0.46,
  hp: 50,
  speed: 1,
  damage: 6,
  xp: 4,
  coins: 3,
  onDeath: [
    {
      kind: 'ground',
      def: {
        radius: 1.6,
        durationMs: 3000,
        tickMs: 500,
        damage: 4,
        color: 0x7cb342,
        fillAlpha: 0.22,
        lineAlpha: 0.5,
        enterMs: 220,
      },
    },
  ],
}

/** 偷金币鼠：不理玩家，直奔地上最近的金币吃掉；击杀吐回吃掉的 + 1 枚利息 */
export const RAT: EnemyDef = {
  kind: 'rat',
  locomotion: { kind: 'coinThief' },
  emoji: '1f400',
  name: '偷币鼠',
  desc: '专偷地上的金币，击杀可全额讨回并有利息',
  size: 1.05,
  radius: 0.4,
  hp: 30,
  speed: 3.2,
  damage: 3,
  xp: 3,
  coins: 2,
}

/** 黏黏怪：缓慢肉盾，蹭到队员会糊一层黏液——该队员攻击冷却大增数秒（别让它贴脸磨输出） */
export const SLIME: EnemyDef = {
  kind: 'slime',
  locomotion: { kind: 'chase' },
  emoji: '1f40c',
  name: '黏黏怪',
  desc: '缓慢肉盾，蹭到的队员会被黏住，攻速大降数秒',
  size: 1.3,
  radius: 0.5,
  hp: 55,
  speed: 1.1,
  damage: 5,
  xp: 4,
  coins: 3,
  onContact: [{ kind: 'damage' }, { kind: 'attackSlow', mul: 1.6, durationMs: 3000 }],
}

export const BLOBLING: EnemyDef = {
  kind: 'blobling',
  locomotion: { kind: 'chase' },
  emoji: '1fae7',
  name: '小泡泡',
  desc: '泡泡分裂出的迷你体，快而脆',
  size: 0.75,
  radius: 0.28,
  hp: 18,
  speed: 2.6,
  damage: 4,
  xp: 1,
  coins: 0,
}

/** 分裂怪：死亡分裂成 2 只更小更快的迷你泡泡 */
export const BLOB: EnemyDef = {
  kind: 'blob',
  locomotion: { kind: 'chase' },
  emoji: '1fae7',
  name: '泡泡',
  desc: '被击破时分裂成两只小泡泡',
  size: 1.55,
  radius: 0.55,
  hp: 70,
  speed: 1.2,
  damage: 6,
  xp: 4,
  coins: 3,
  onDeath: [{ kind: 'split', into: BLOBLING, count: 2 }],
}

/** 小飞虫：虫巢吐出的护巢飞虫——绕巢盘旋、玩家逼近巢即扑击；巢被拆后失锚暴走
 * （提速 + 加攻并直扑玩家，双属性档位切换）。不进自然刷怪，只由虫巢生成 */
export const LARVA: EnemyDef = {
  kind: 'larva',
  locomotion: {
    kind: 'baseOrbit',
    orbitRadius: 2.5,
    aggroRange: 6,
    orphanSpeedMul: 1.7,
    orphanDamageMul: 2.5,
  },
  emoji: '1f99f',
  name: '小飞虫',
  desc: '绕着虫巢盘旋守卫，玩家逼近巢就扑击；巢被拆后暴走直扑玩家',
  size: 0.7,
  radius: 0.26,
  hp: 12,
  speed: 2.8,
  damage: 3,
  xp: 1,
  coins: 0,
}

/** 虫巢：原地不动的肉盾巢穴，每隔几秒吐出小飞虫——不拆掉就一直刷，得优先清巢 */
export const HIVE: EnemyDef = {
  kind: 'hive',
  locomotion: { kind: 'static' },
  emoji: '1faba',
  name: '虫巢',
  desc: '原地不动的巢穴，每隔几秒吐出小飞虫，不拆掉就一直刷',
  size: 1.5,
  radius: 0.6,
  hp: 140,
  speed: 0,
  damage: 4,
  xp: 8,
  coins: 6,
  // 固定装置：不但移速为零，击退也免疫（否则带击退的武器能把巢穴推走）
  kbImmune: true,
  // 每巢在场至多 6 只护巢飞虫：满则停生，被清掉后续生，巢被拆才彻底停
  spawner: { into: LARVA, intervalMs: 4000, count: 2, maxAlive: 6, firstDelayMs: 2000 },
}

/** 自爆怪：径直扑向玩家，贴身即定身蓄力，蓄力完原地引爆 AoE（蓄力前击杀可拆弹） */
export const CREEPER: EnemyDef = {
  kind: 'creeper',
  emoji: '1f4a3',
  name: '自爆怪',
  desc: '径直扑向玩家，贴身后定身蓄力随即原地引爆，蓄力前击杀可拆弹',
  size: 1.3,
  radius: 0.5,
  hp: 55,
  speed: 1.6,
  // 威胁全在自爆；接触仅象征性蹭伤（通常蓄力引爆先于贴脸）
  damage: 6,
  xp: 6,
  coins: 4,
  locomotion: {
    kind: 'detonate',
    // 触发距离与爆炸半径都调大：贴脸才炸→提前进圈就蓄力，爆开范围更唬人（更难躲）
    triggerRange: 2.6,
    windupMs: 800,
    blastRadius: 3.8,
    blastDamage: 32,
    knockback: 5,
  },
}

export const ENEMY_DEFS: readonly EnemyDef[] = [
  ZOMBIE,
  GHOST,
  INVADER,
  BOAR,
  SNAKE,
  MUSHROOM,
  RAT,
  SLIME,
  BLOB,
  BLOBLING,
  HIVE,
  LARVA,
  CREEPER,
]

// Boss 就是 role:'boss' 的普通条目——每张地图一只专属 Boss，技能贴合该图主题与玩法。
// 出怪表 mix 移到各 Map；此处只给 Boss 本体（map.boss 按 kind 引用）。

/** 黑森林专属 Boss——树妖：召唤毒菌蔓生战场（spawner→毒蘑菇，死亡留毒液池），
 * 喷吐孢子弹幕封走位。缓慢厚重的召唤者/控场型，逼玩家优先清菌再近身。 */
const FOREST_BOSS: EnemyDef = {
  kind: 'treant',
  role: 'boss',
  emoji: '1f333',
  name: '树妖',
  desc: '黑森林头目：召唤毒菌蔓生战场，喷吐孢子扇幕，缓慢厚重，击退免疫',
  size: 3.4,
  radius: 1.1,
  hp: 6500,
  speed: 1.0,
  damage: 20,
  xp: 60,
  coins: 60,
  kbImmune: true,
  locomotion: { kind: 'chase' },
  // 育菌：周期从根须育出毒蘑菇（亡语留毒液池），不清就越滚越多
  spawner: { into: MUSHROOM, intervalMs: 5200, count: 2, maxAlive: 6, firstDelayMs: 3000 },
  abilities: [
    {
      kind: 'projectile',
      damage: 8,
      cooldownMs: 3200,
      knockback: 0,
      firstDelayMs: 2000,
      lifeMs: 6000,
      volley: { count: 7, spreadDeg: 160 },
      projectile: { emoji: '1f7e2', size: 0.42, radius: 0.15, speed: 2.4, rotationOffsetDeg: 0 },
    },
  ],
}

/** 荒漠专属 Boss——蝎王：掘沙尾刺猛扑（dash 突袭）+ 毒液扇射。无边大漠里高机动
 * 逼近型，突袭配远程毒幕，逼玩家横向拉扯躲刺。 */
const DESERT_BOSS: EnemyDef = {
  kind: 'scorpion',
  role: 'boss',
  emoji: '1f982',
  name: '蝎王',
  desc: '荒漠头目：掘沙尾刺猛扑突袭，喷射毒液扇幕，击退免疫',
  size: 3.2,
  radius: 1.05,
  hp: 6000,
  speed: 1.5,
  damage: 22,
  xp: 60,
  coins: 60,
  kbImmune: true,
  locomotion: {
    kind: 'dash',
    trigger: { kind: 'timer', intervalMs: 5000, firstDelayMs: 3500 },
    length: { kind: 'time', durationMs: 500 },
    windupMs: 650,
    dashSpeed: 11,
    idle: 'chase',
    aim: 'teamCenter',
    lockAt: 'launch',
    sfx: 'whoosh',
  },
  abilities: [
    {
      kind: 'projectile',
      damage: 8,
      cooldownMs: 3000,
      knockback: 0,
      firstDelayMs: 1800,
      lifeMs: 5000,
      aim: 'nearest',
      volley: { count: 5, spreadDeg: 70 },
      projectile: { emoji: '1f7e3', size: 0.42, radius: 0.15, speed: 3.2, rotationOffsetDeg: 0 },
    },
  ],
}

/** 奔流专属 Boss——巨鳄：喷吐水弹扇幕 + 掀起水柱自天砸落（strike）。潜伏河道的
 * 远程+范围压制型，水柱无视走位天降，逼玩家在水流漂移里不停换位。 */
const RIVER_BOSS: EnemyDef = {
  kind: 'croc',
  role: 'boss',
  emoji: '1f40a',
  name: '巨鳄',
  desc: '奔流头目：喷吐水弹扇幕，掀起水柱自天砸落，击退免疫',
  size: 3.4,
  radius: 1.1,
  hp: 6200,
  speed: 1.3,
  damage: 20,
  xp: 60,
  coins: 60,
  kbImmune: true,
  locomotion: { kind: 'chase' },
  abilities: [
    {
      kind: 'projectile',
      damage: 9,
      cooldownMs: 3200,
      knockback: 0,
      firstDelayMs: 1800,
      lifeMs: 5000,
      aim: 'nearest',
      volley: { count: 6, spreadDeg: 90 },
      projectile: { emoji: '1f4a7', size: 0.5, radius: 0.18, speed: 2.6, rotationOffsetDeg: 0 },
    },
    {
      kind: 'strike',
      damage: 22,
      cooldownMs: 5000,
      knockback: 0,
      targets: 4,
      drop: { emoji: '1f4a7', size: 1.0, fromAbove: 4, dropMs: 240, staggerMs: 80 },
    },
  ],
}

/** 工厂专属 Boss——母机核心：激光点射穿插整圈环扫（everyN 每三发一轮环射，
 * 环面地图上绕圈回卷）+ 液压重锤自天砸落（strike）。远程弹幕+范围压制型。 */
const FACTORY_BOSS: EnemyDef = {
  kind: 'mecha',
  role: 'boss',
  emoji: '1f916',
  name: '母机核心',
  desc: '工厂头目：激光点射与整圈环扫，液压重锤自天砸落，击退免疫',
  size: 3.4,
  radius: 1.1,
  hp: 6500,
  speed: 1.2,
  damage: 20,
  xp: 60,
  coins: 60,
  kbImmune: true,
  locomotion: { kind: 'chase' },
  abilities: [
    {
      kind: 'projectile',
      damage: 8,
      cooldownMs: 2400,
      knockback: 0,
      firstDelayMs: 1600,
      lifeMs: 6000,
      aim: 'nearest',
      fireSfx: 'boom',
      // 每三发一轮整圈激光环扫，其余为点射
      everyN: { n: 3, count: 12, spreadDeg: 360 },
      projectile: { emoji: '1f534', size: 0.4, radius: 0.14, speed: 3.2, rotationOffsetDeg: 0 },
    },
    {
      kind: 'strike',
      damage: 24,
      cooldownMs: 4800,
      knockback: 0,
      targets: 5,
      drop: { emoji: '1f528', size: 1.1, fromAbove: 4, dropMs: 220, staggerMs: 80 },
    },
  ],
}


/** 残垣图专属 Boss——拆迁鬼：犀角冲撞碾碎沿途断壁（breaksWalls），把回廊拆成开阔地；
 * 第二技能「落石」从天砸向最近队员，无视断壁遮挡（残垣崩落，猥琐龟缩也躲不掉）。
 * 冲撞只在冲刺态破墙（steer.ts），非冲刺期照常走流场绕墙逼近队伍中心。 */
const RUINS_BOSS: EnemyDef = {
  kind: 'rhino',
  role: 'boss',
  emoji: '1f98f',
  name: '拆迁鬼',
  desc: '残垣头目：犀角冲撞碾碎沿途断壁，落石从天砸下无视遮挡，击退免疫',
  size: 3.2,
  radius: 1.05,
  hp: 6000,
  speed: 1.4,
  damage: 20,
  xp: 60,
  coins: 60,
  kbImmune: true,
  // 冲撞破墙：非冲刺期走流场绕墙逼近，冲刺态锁定队伍中心直线冲、沿途碾碎断壁
  breaksWalls: true,
  locomotion: {
    kind: 'dash',
    trigger: { kind: 'timer', intervalMs: 5000, firstDelayMs: 3200 },
    length: { kind: 'time', durationMs: 600 },
    windupMs: 700,
    dashSpeed: 10,
    idle: 'chase',
    aim: 'teamCenter',
    lockAt: 'launch',
    sfx: 'whoosh',
  },
  abilities: [
    // 落石：点名最近 5 名队员，巨石自天而降砸下——坠物从上方落地，天然无视断壁遮挡
    {
      kind: 'strike',
      damage: 24,
      cooldownMs: 4500,
      knockback: 0,
      targets: 5,
      drop: { emoji: '1faa8', size: 1.1, fromAbove: 4, dropMs: 240, staggerMs: 90 },
    },
  ],
}

/** 生成用：kind → 定义（顺序即展示顺序；Boss 按地图顺序排在常规怪之后） */
export const ENEMIES = Object.fromEntries(
  [...ENEMY_DEFS, FOREST_BOSS, DESERT_BOSS, RIVER_BOSS, FACTORY_BOSS, RUINS_BOSS].map((e) => [e.kind, e]),
) as Record<string, EnemyDef>
