// dev 工具随线上版本常驻：游戏内 🔧 按钮开合面板，无需 URL 参数
let devOpen = false
// 调试模式：普通 / 压测（洪水+免死）/ 试炼场（勾选敌人+免死无时限）——互斥
let mode: 'normal' | 'stress' | 'lab' = 'normal'
// 试炼场勾选的敌人 kind 集合（空 = 不生成）
const labEnemies = new Set<string>()

export function isDevOpen(): boolean {
  return devOpen
}

export function setDevOpen(on: boolean): void {
  devOpen = on
}

export function getMode(): 'normal' | 'stress' | 'lab' {
  return mode
}

export function setMode(m: 'normal' | 'stress' | 'lab'): void {
  mode = m
}

/** 压测模式（洪水刷怪 + 免死） */
export function isStress(): boolean {
  return mode === 'stress'
}

/** 兼容窗口调试 API（window.__setStress）：压测开关 = 模式切换 */
export function setStress(on: boolean): void {
  mode = on ? 'stress' : 'normal'
}

/** 试炼场模式（勾选敌人定向出场 + 免死无时限） */
export function isLab(): boolean {
  return mode === 'lab'
}

export function getLabEnemies(): ReadonlySet<string> {
  return labEnemies
}

export function isLabEnemyOn(kind: string): boolean {
  return labEnemies.has(kind)
}

/** 试炼场：点选切换某敌人是否出场（arena 每帧实时读取，无需重启） */
export function toggleLabEnemy(kind: string): void {
  if (labEnemies.has(kind)) labEnemies.delete(kind)
  else labEnemies.add(kind)
}

/** 整体设定试炼场勾选集（窗口调试 API / e2e 用） */
export function setLabEnemies(kinds: readonly string[]): void {
  labEnemies.clear()
  for (const k of kinds) labEnemies.add(k)
}

// 压力测试模式（🔧 面板开关）：拉高负载且保证测得下去
export const STRESS = {
  maxHp: 10_000_000,
  spawnIntervalMs: 80,
  spawnBatch: 5,
  maxAlive: 800,
  // 所有能力冷却乘数（0.1 = 十倍攻速）
  cooldownMul: 0.1,
} as const

// 试炼场模式：低速补场、维持一个小在场池——用真实冷却看敌人真实表现
export const LAB = {
  spawnIntervalMs: 700,
  targetAlive: 10,
} as const
