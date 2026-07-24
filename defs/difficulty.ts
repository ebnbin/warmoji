import type { Difficulty } from '../src/enemies/registry'

// 难度·敌潮·精英·终波减压（创作层·不进运行时 bundle）：整局的敌人压力/成长曲线设计值。
// 逻辑（刷怪节奏计算、精英判定、敌潮编排）在 src/enemies 与战斗引擎里；这里只放设计数值，
// 经 npm run gen 校验后产出 src/assets/difficulty.json。
export const DIFFICULTY = {
  // 刷怪节奏（波次制）：第 1 波基础火力可稳过，随跨波累计战斗时长持续加压，
  // 后期压力超出基础火力，由商店成长补差
  spawn: {
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
    markEmoji: '26a0',
    markSize: 1.0,
    minPlayerDist: 3,
    edgeInset: 0.5,
  },
  // 精英怪：第 fromWave 波起按概率出现——金色描边 + 三围强化，掉更多经验金币。
  // 强化走乘数（血量在刷怪时算入，移速/伤害在运行时按敌身上的标记生效）
  elite: {
    fromWave: 10,
    chance: 0.15,
    hpMul: 4,
    speedMul: 1.25,
    damageMul: 2,
    sizeMul: 1.2,
    xpMul: 4,
    coinsMul: 3,
  },
  // 敌人潮：精英波（WAVE.eliteWaves）开局的一波密集冲锋（含保底精英），配警示横幅
  surge: {
    count: 14,
    elites: 3,
    spreadMs: 2600,
  },
  bossSpawnRelief: 2,
} as const satisfies Difficulty
