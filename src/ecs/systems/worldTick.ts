import type { Sim } from '../sim'

/** 世界周期结算：本图独有的那几处按时结算（落水掉血、圈外掉血、天体横扫…）。
 * 具体做什么按 mapId 取的钩子说了算（见 ../worlds.ts），默认实现即森林语义 */
export function worldTick(sim: Sim): void {
  sim.hooks.tick(sim, sim.wdtMs)
}
