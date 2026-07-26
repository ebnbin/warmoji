import type { Sim } from '../sim'

/** 本帧登记表清零：能力系统是唯一生产者，消费方（updatePickups）读最近一次。
 * 少了这一步登记项会逐帧堆积 */
export function clearFrameRegisters(sim: Sim): void {
  sim.frameAttractors.length = 0
}
