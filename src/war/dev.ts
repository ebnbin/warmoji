// dev 工具随线上版本常驻：游戏内 🔧 按钮开合性能面板（FPS/内存等），无需 URL 参数
let devOpen = false

export function isDevOpen(): boolean {
  return devOpen
}

export function setDevOpen(on: boolean): void {
  devOpen = on
}
