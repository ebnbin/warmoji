// dev 工具随线上版本常驻：游戏内 🔧 按钮开合面板，无需 URL 参数
let devOpen = false
let stress = false

export function isDevOpen(): boolean {
  return devOpen
}

export function setDevOpen(on: boolean): void {
  devOpen = on
}

export function isStress(): boolean {
  return stress
}

export function setStress(on: boolean): void {
  stress = on
}

// 压力测试模式（🔧 面板开关）：拉高负载且保证测得下去
export const STRESS = {
  maxHp: 10_000_000,
  spawnIntervalMs: 80,
  spawnBatch: 5,
  maxAlive: 800,
  // 所有武器冷却乘数（0.1 = 十倍攻速）
  cooldownMul: 0.1,
} as const
