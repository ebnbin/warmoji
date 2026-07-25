// 旧框架（arcade）的 e2e 调试探针（全局 window 面）。与 ecs/probes.d.ts 对称：
// 放在本包内，删本包时随目录一起消失；实现在 probes.ts，装配走 experiments facade。
// 注意文件名不能叫 probes.d.ts——与 probes.ts 同名时 TS 视其为后者的声明产物而排除出编译。

interface Window {
  __setLab?: (kinds: string[], mapId?: string) => void
  __labTeam?: (ids: string[], mapId?: string) => void
  __spawnEnemy?: (kind: string, dxU?: number, dyU?: number) => void
  __spawnArmedEnemy?: (abilityId: string, dxU?: number, dyU?: number) => void
  __dropCoins?: (n: number, dxU?: number, dyU?: number) => void
  __spawnCarrier?: (polarity?: 'buff' | 'debuff', id?: string) => void
  __spawnFieldPickup?: (polarity?: 'buff' | 'debuff', id?: string, dxU?: number, dyU?: number) => void
}
