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
