import { playSfx } from '../../audio/sfx'
import { gainXp, waveBonusXp } from '../../war/xp'
import { isFinalWave } from '../../data/waves'
import { Alive, MHp } from '../components'
import type { Sim } from '../sim'

// 波次结算(镜像 endWave 的纯 run 变更部分):波末保底经验(队长×道具倍率)+ 团队道具波末
// 结算(大锅回复/债券分红)+ 累计战斗时长 + 波次自增 + 队员血量快照。场景过场(结算横幅/
// scene.start 到结算/抽卡/整编/商店)留在场景侧。

/** 结算本波:回写 run(经验/回复/金币/combatMs/wave/memberHp),返回是否通关(终波) */
export function settleWave(sim: Sim): boolean {
  const run = sim.run
  const finished = isFinalWave(run.wave)
  // 波末保底经验(队长 xpGainMul × 团队经验卡倍率,已并入 reward.captainXpMul)
  const gained = gainXp(run.xp, Math.round(waveBonusXp(run.wave) * sim.reward.captainXpMul))
  run.xp = gained.state
  if (gained.levelsGained > 0) {
    run.cardDraws += gained.levelsGained
    playSfx('levelup')
  }
  // 团队道具波末结算:大锅回复(血量快照前生效)
  if (sim.reward.waveHealRatio > 0) {
    for (const m of sim.members) {
      if (!Alive.v[m]) continue
      MHp.hp[m] = Math.min(MHp.max[m]!, MHp.hp[m]! + MHp.max[m]! * sim.reward.waveHealRatio)
    }
  }
  // 债券分红计入本波金币
  if (sim.reward.waveCoins > 0) run.coins += sim.reward.waveCoins
  run.combatMs += sim.elapsedMs
  run.wave += 1
  run.memberHp = sim.members.map((m) => (Alive.v[m] ? Math.round(MHp.hp[m]!) : 0))
  return finished
}
