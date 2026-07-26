import { animateEnemies } from '../systems/animateEnemies'
import { animateMembers } from '../systems/animateMembers'
import { applyKnockback } from '../systems/applyKnockback'
import { applySlowZones } from '../systems/applySlowZones'
import { commitEnemySteps } from '../systems/commitEnemySteps'
import { despawnExpired } from '../systems/despawnExpired'
import { expireSkillBuff } from '../systems/expireSkillBuff'
import { fadeEnemyFlash } from '../systems/fadeEnemyFlash'
import { layoutTeam } from '../systems/layoutTeam'
import { memberContact } from '../systems/memberContact'
import { memberVisual } from '../systems/memberVisual'
import { moveTeam } from '../systems/moveTeam'
import { popInEnemies } from '../systems/popInEnemies'
import { refoldBattleFx } from '../systems/refoldBattleFx'
import { regenMembers } from '../systems/regenMembers'
import { reviveMembers } from '../systems/reviveMembers'
import { steerEnemies } from '../systems/steerEnemies'
import { tickPoison } from '../systems/tickPoison'
import { tintEnemies } from '../systems/tintEnemies'
import { updateDormancy } from '../systems/updateDormancy'
import { updateEnemyProjectiles } from '../systems/updateEnemyProjectiles'
import { updateFrameTargets } from '../systems/updateFrameTargets'
import { updateOrbit } from '../systems/updateOrbit'
import { updateProjectiles } from '../systems/updateProjectiles'
import { updateShards } from '../systems/updateShards'
import { worldTick } from '../systems/worldTick'
import type { Step } from './step'

// 一帧仿真的流水线。步与步之间的先后此前只写在注释里——「先于一切读敌人的系统」、
// 「先于 orbit」、「接触须先于敌弹」，每条都是踩过坑才写下的真实约束，但挪一行不会红。
// 现在它们是 after + why，由 order.test.ts 逐条校验。
//
// 时停期整体放慢：敌人移速/弹体位移都按 sim.wdtMs 积分，无需在任何一步另乘时标。

export const SIM_PIPELINE: readonly Step[] = [
  {
    name: 'refoldBattleFx',
    run: refoldBattleFx,
    why: '战场限时层的乘区是实时的，须先于任何消费它的移动/攻击/敌速',
  },
  { name: 'expireSkillBuff', run: expireSkillBuff },
  {
    name: 'updateDormancy',
    run: updateDormancy,
    why: '休眠是本帧派生的：远离队伍的敌人冻结 AI 与位移，故须先于一切读敌人的系统',
  },
  {
    name: 'updateFrameTargets',
    run: updateFrameTargets,
    after: ['updateDormancy'],
    why: '威胁点里不该有休眠怪；队伍 orbit/游移门控读这一份，故也须先于 updateOrbit',
  },
  { name: 'updateOrbit', run: updateOrbit, after: ['updateFrameTargets'] },
  {
    name: 'moveTeam',
    run: moveTeam,
    after: ['updateOrbit'],
    why: '编队岗位角度由环相位决定，队伍中心挪之前要先定好相位',
  },
  {
    name: 'layoutTeam',
    run: layoutTeam,
    after: ['moveTeam'],
    why: '逐员站位是绕队伍中心算的，中心须先挪到本帧位置',
  },
  {
    name: 'animateMembers',
    run: animateMembers,
    after: ['layoutTeam'],
    why: '呼吸挤压叠在本帧站位之上（写的是同一个 Transform.w/h）',
  },
  { name: 'reviveMembers', run: reviveMembers },
  { name: 'regenMembers', run: regenMembers },
  { name: 'tickPoison', run: tickPoison },
  { name: 'popInEnemies', run: popInEnemies, after: ['updateDormancy'] },
  { name: 'despawnExpired', run: despawnExpired, after: ['updateDormancy'] },
  { name: 'fadeEnemyFlash', run: fadeEnemyFlash, after: ['updateDormancy'] },
  {
    name: 'applySlowZones',
    run: applySlowZones,
    after: ['updateDormancy'],
    why: 'ZoneSlow 是本帧派生的，转向与染色共读这一份，故须先于两者',
  },
  { name: 'tintEnemies', run: tintEnemies, after: ['applySlowZones'] },
  { name: 'steerEnemies', run: steerEnemies, after: ['applySlowZones'] },
  {
    name: 'applyKnockback',
    run: applyKnockback,
    after: ['steerEnemies'],
    why: '击退冲量叠加在本帧的行为位移之上（两者写同一个 Step.x/y）',
  },
  {
    name: 'commitEnemySteps',
    run: commitEnemySteps,
    after: ['applyKnockback'],
    why: '位移到这一步才真正落到 Transform 上——在此之前 Step 只是本帧的累加器',
  },
  {
    name: 'animateEnemies',
    run: animateEnemies,
    after: ['commitEnemySteps'],
    why: '朝向翻转读的是本帧最终位移',
  },
  { name: 'updateProjectiles', run: updateProjectiles, after: ['commitEnemySteps'] },
  {
    name: 'memberContact',
    run: memberContact,
    after: ['commitEnemySteps'],
    why: '接触判定读本帧最终位置',
  },
  {
    name: 'updateEnemyProjectiles',
    run: updateEnemyProjectiles,
    after: ['memberContact'],
    why: '同帧两者争同一层无敌帧时旧实现是接触先手（overlap 注册序）；反过来的话，贴脸接触的伤害/黏滞/荆棘反伤会被敌弹吃掉的无敌帧一并挡下',
  },
  { name: 'memberVisual', run: memberVisual },
  { name: 'updateShards', run: updateShards },
  {
    name: 'worldTick',
    run: worldTick,
    after: ['commitEnemySteps', 'memberContact'],
    why: '世界周期结算（落水掉血、圈外掉血、天体横扫）读的是本帧最终位置',
  },
]
