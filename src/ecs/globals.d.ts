// ECS 侧的 e2e 调试探针（全局 window 面）。放在本包内而非 vite-env.d.ts：
// 删本包时随目录一起消失，主干的全局类型面不残留本框架的痕迹。
// 与 arcade/globals.d.ts 对称。
// 除 __ecsLabRoster（facade 装）外，其余都由 EcsBattleScene 在运行时挂。

interface Window {
  __ecsLabRoster?: (ids: string[], enemies?: string[], invincible?: boolean) => void
  __ecsSpawnEnemy?: (kind: string, dxU?: number, dyU?: number, elite?: boolean) => void
  __ecsNearestEnemySize?: () => number
  __ecsHurtEnemy?: (dmg?: number, kb?: number) => void
  __ecsSlowEnemy?: (factor?: number, durMs?: number) => void
  __ecsPoisonEnemy?: (dmg?: number, tickMs?: number, durMs?: number) => void
  __ecsNearestEnemyHp?: () => number
  __ecsNearestEnemyState?: () => number
  __ecsMorphEnemy?: (durMs?: number, vulnMul?: number) => void
  __ecsNearestEnemyMorphed?: () => boolean
  __ecsGroundZones?: () => number
  __ecsSpawnCoinsAt?: (dxU?: number, dyU?: number, count?: number) => void
  __ecsMaxEaten?: () => number
  __ecsSettleWave?: () => number
  __ecsStress?: (count?: number, kind?: string) => void
  __ecsBossDown?: () => boolean
  __ecsMemberAtkSlowed?: () => boolean
  __ecsDancing?: () => boolean
  __ecsDropField?: (id: string, dxU?: number, dyU?: number) => void
  __ecsTimeStop?: (durMs?: number) => void
  __ecsWorldTimeScale?: () => number
  __ecsStepTeam?: (wantDx: number, wantDy: number, deltaMs?: number) => { x: number; y: number }
  __ecsTeleport?: (xU: number, yU: number) => void
  __ecsForceWorldTick?: () => void
  __ecsFastForward?: (ms: number) => void
}
