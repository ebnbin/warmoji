// ?dev=1 开启性能面板与压测开关；正常玩家不可见
export const devMode = new URLSearchParams(window.location.search).has('dev')

let stress = false

export function isStress(): boolean {
  return stress
}

export function setStress(on: boolean): void {
  stress = on
}
