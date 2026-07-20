import type { EnemyDef } from '../src/enemies/registry'

// 创作层（不进运行时 bundle）：敌人/Boss/出场配比数据行。
// split.into 的对象引用在生成时内联展开为自包含 JSON。

export const ZOMBIE: EnemyDef = {
  kind: 'zombie',
  locomotion: { kind: 'chase' },
  emoji: '🧟',
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
  emoji: '👻',
  name: '幽灵',
  desc: '飘得很快的追击者，血薄，死亡时治疗周围同伴',
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
  emoji: '👾',
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
      projectile: { emoji: '🔴', size: 0.4, radius: 0.14, speed: 3, rotationOffsetDeg: 0 },
    },
  ],
  // 亡语：朝断气那一刻最近队员的方向补一发慢速冷枪（击杀后仍要走位）
  onDeath: [
    {
      kind: 'spawnProjectile',
      aim: 'nearest',
      damage: 8,
      lifeMs: 6000,
      projectile: { emoji: '🛸', size: 0.6, radius: 0.2, speed: 1.5, rotationOffsetDeg: 0 },
    },
  ],
}

/** 突刺怪：探测圈内锁定蓄力方向 → 短延迟 → 直线冲刺一段距离（横向位移可躲） */
export const BOAR: EnemyDef = {
  kind: 'boar',
  emoji: '🐗',
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
    detectRange: 4,
    windupMs: 550,
    dashSpeed: 8,
    dashDist: 3.5,
    cooldownMs: 1800,
    idle: 'wander',
    aim: 'nearest',
    lockAt: 'windup',
  },
  // 亡语：原地化作半透明尸壳，无伤害无行为但能吸引火力，3 秒后消散
  onDeath: [{ kind: 'decoy', hp: 40, durationMs: 3000, alpha: 0.5 }],
}

/** 逃跑射手：见人就拉开距离，周期性朝人吐慢速毒弹（制造追不追的抉择） */
export const SNAKE: EnemyDef = {
  kind: 'snake',
  emoji: '🐍',
  name: '毒蛇',
  desc: '见人就溜，边逃边回头吐毒弹',
  size: 1.25,
  radius: 0.45,
  hp: 35,
  speed: 2.4,
  damage: 5,
  xp: 4,
  coins: 3,
  locomotion: { kind: 'flee', range: 5 },
  abilities: [
    {
      kind: 'projectile',
      damage: 5,
      cooldownMs: 2600,
      knockback: 0,
      // 沿用攻击积木的「任意距离都开火」：覆写索敌上限到远超全图对角
      range: 99,
      lifeMs: 4500,
      projectile: { emoji: '🟢', size: 0.4, radius: 0.14, speed: 3.2, rotationOffsetDeg: 0 },
    },
  ],
}

/** 毒爆怪：慢速近战，死亡原地留毒液池（别在自己的风筝路线上打爆它） */
export const MUSHROOM: EnemyDef = {
  kind: 'mushroom',
  locomotion: { kind: 'chase' },
  emoji: '🍄',
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
  emoji: '🐀',
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
  emoji: '🐌',
  name: '黏黏怪',
  desc: '缓慢肉盾，蹭到的队员会被黏住，攻速大降数秒',
  size: 1.3,
  radius: 0.5,
  hp: 55,
  speed: 1.1,
  damage: 5,
  xp: 4,
  coins: 3,
  contactSlow: { mul: 1.6, durationMs: 3000 },
}

export const BLOBLING: EnemyDef = {
  kind: 'blobling',
  locomotion: { kind: 'chase' },
  emoji: '🫧',
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
  emoji: '🫧',
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

/** 小飞虫：虫巢吐出的迷你飞虫，血极薄、飞得快，成群骚扰（不进自然刷怪，只由虫巢生成） */
export const LARVA: EnemyDef = {
  kind: 'larva',
  locomotion: { kind: 'chase' },
  emoji: '🦟',
  name: '小飞虫',
  desc: '虫巢吐出的迷你飞虫，血薄但快，成群骚扰',
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
  emoji: '🪺',
  name: '虫巢',
  desc: '原地不动的巢穴，每隔几秒吐出小飞虫，不拆掉就一直刷',
  size: 1.5,
  radius: 0.6,
  hp: 140,
  speed: 0,
  damage: 4,
  xp: 8,
  coins: 6,
  spawner: { into: LARVA, intervalMs: 4000, count: 2, firstDelayMs: 2000 },
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
]

// 出场配比：新怪按波次渐入（sinceWave），僵尸/幽灵始终是主体；
// 权重随波次线性微调，zombie 有下限兜底（见 本文件 enemyMixAt）
export const ENEMY_MIX = [
  { kind: 'zombie', sinceWave: 1, base: 80, perWave: -2, min: 40, max: 80 },
  { kind: 'ghost', sinceWave: 1, base: 15, perWave: 1, min: 15, max: 32 },
  { kind: 'invader', sinceWave: 2, base: 8, perWave: 0.3, min: 0, max: 12 },
  { kind: 'boar', sinceWave: 3, base: 8, perWave: 0.4, min: 0, max: 16 },
  { kind: 'snake', sinceWave: 4, base: 7, perWave: 0.3, min: 0, max: 10 },
  { kind: 'mushroom', sinceWave: 4, base: 7, perWave: 0.4, min: 0, max: 14 },
  { kind: 'rat', sinceWave: 5, base: 5, perWave: 0.3, min: 0, max: 10 },
  { kind: 'blob', sinceWave: 5, base: 7, perWave: 0.4, min: 0, max: 14 },
  { kind: 'slime', sinceWave: 2, base: 16, perWave: 0.4, min: 0, max: 28 },
  { kind: 'hive', sinceWave: 7, base: 3, perWave: 0.15, min: 0, max: 6 },
] as const

export const BOSS: EnemyDef = {
  kind: 'boss',
  emoji: '👹',
  name: '赤鬼',
  desc: '终波头目：环形弹幕与蓄力突刺，击退免疫',
  size: 3.2,
  radius: 1.05,
  hp: 6000,
  speed: 1.4,
  damage: 20,
  xp: 60,
  coins: 60,
  kbImmune: true,
  locomotion: {
    kind: 'dash',
    intervalMs: 5600,
    windupMs: 750,
    dashSpeed: 8,
    durationMs: 450,
    idle: 'chase',
    aim: 'teamCenter',
    lockAt: 'launch',
    firstDelayMs: 3600,
    sfx: 'whoosh',
  },
  abilities: [
    {
      kind: 'projectile',
      damage: 8,
      cooldownMs: 2800,
      knockback: 0,
      firstDelayMs: 1800,
      lifeMs: 6000,
      fireSfx: 'boom',
      volley: { count: 12, spreadDeg: 360, randomRotate: true },
      projectile: { emoji: '🟣', size: 0.45, radius: 0.16, speed: 2.4, rotationOffsetDeg: 0 },
    },
  ],
}


/** 生成用：kind → 定义（顺序即 ENEMY_DEFS 展示顺序） */
export const ENEMIES = Object.fromEntries(ENEMY_DEFS.map((e) => [e.kind, e])) as Record<string, EnemyDef>
