import { animateEnemies } from '../animateEnemies'
import { animateCharacters } from '../animateCharacters'
import { applyKnockback } from '../applyKnockback'
import { applySlowZones } from '../applySlowZones'
import { commitEnemySteps } from '../commitEnemySteps'
import { despawnExpired } from '../despawnExpired'
import { expireSkillBuff } from '../expireSkillBuff'
import { fadeEnemyFlash } from '../fadeEnemyFlash'
import { layoutTeam } from '../layoutTeam'
import { characterContact } from '../characterContact'
import { characterVisual } from '../characterVisual'
import { moveTeam } from '../moveTeam'
import { popInEnemies } from '../popInEnemies'
import { refoldBattleFx } from '../refoldBattleFx'
import { regenCharacters } from '../regenCharacters'
import { reviveCharacters } from '../reviveCharacters'
import { applyEnemySteps } from '../applyEnemySteps'
import { steerBaseOrbit } from '../steerBaseOrbit'
import { steerChase } from '../steerChase'
import { steerCoinThief } from '../steerCoinThief'
import { steerDash } from '../steerDash'
import { steerDetonate } from '../steerDetonate'
import { steerFlee } from '../steerFlee'
import { steerRoam } from '../steerRoam'
import { steerStandoff } from '../steerStandoff'
import { updateEnemyGates } from '../updateEnemyGates'
import { tickPoison } from '../tickPoison'
import { tintEnemies } from '../tintEnemies'
import { updateDormancy } from '../updateDormancy'
import { updateFrameTargets } from '../updateFrameTargets'
import { updateOrbit } from '../updateOrbit'
import { cullProjectiles } from '../cullProjectiles'
import { hitDirectProjectiles } from '../hitDirectProjectiles'
import { hitSweptProjectiles } from '../hitSweptProjectiles'
import { moveProjectiles } from '../moveProjectiles'
import { updateShards } from '../updateShards'
import { worldTick } from '../worldTick'
import type { Step } from './step'
import type { Sim } from '../../sim'

// 一帧仿真的流水线。步与步之间的先后此前只写在注释里——「先于一切读敌人的系统」、
// 「先于 orbit」、「接触须先于敌弹」，每条都是踩过坑才写下的真实约束，但挪一行不会红。
// 现在它们是 after + why，由 order.test.ts 逐条校验。
//
// 时停期整体放慢：敌人移速/弹体位移都按 sim.wdtMs 积分，无需在任何一步另乘时标。

/** 各走位的转向系统。彼此之间没有次序关系——一只敌人只挂一种走位组件，
 * 两个系统扫不到同一只 */
const STEERERS: readonly { name: string; run: (sim: Sim) => void }[] = [
  { name: 'steerChase', run: steerChase },
  { name: 'steerRoam', run: steerRoam },
  { name: 'steerFlee', run: steerFlee },
  { name: 'steerStandoff', run: steerStandoff },
  { name: 'steerDetonate', run: steerDetonate },
  { name: 'steerBaseOrbit', run: steerBaseOrbit },
  { name: 'steerCoinThief', run: steerCoinThief },
  { name: 'steerDash', run: steerDash },
  // static 没有系统：它就是「不动」，BVel 由 enemyGates 清零后没人再写
]

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
    name: 'animateCharacters',
    run: animateCharacters,
    after: ['layoutTeam'],
    why: '呼吸挤压叠在本帧站位之上（写的是同一个 Transform.w/h）',
  },
  { name: 'reviveCharacters', run: reviveCharacters },
  { name: 'regenCharacters', run: regenCharacters },
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
  {
    name: 'enemyGates',
    run: updateEnemyGates,
    after: ['applySlowZones'],
    why: 'Slowed 是本帧派生的移速倍率，各走位系统共读；Steering 决定本职走位这一帧接不接管',
  },
  // 每种走位一个系统，各自只认自己那个组件，互不相干，故彼此无序
  ...STEERERS.map((s) => ({ ...s, after: ['enemyGates'] })),
  {
    name: 'applyEnemySteps',
    run: applyEnemySteps,
    after: STEERERS.map((s) => s.name),
    why: '把各走位写下的行为速度过世界钩子落成 Step，故须等所有走位都写完',
  },
  {
    name: 'applyKnockback',
    run: applyKnockback,
    after: ['applyEnemySteps'],
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
  { name: 'moveProjectiles', run: moveProjectiles, after: ['commitEnemySteps'] },
  {
    name: 'hitSweptProjectiles',
    run: hitSweptProjectiles,
    after: ['moveProjectiles'],
    why: '扫掠线段的起点是 moveProjectiles 记下的 PrevPos',
  },
  {
    name: 'characterContact',
    run: characterContact,
    after: ['commitEnemySteps'],
    why: '接触判定读本帧最终位置',
  },
  {
    name: 'hitDirectProjectiles',
    run: hitDirectProjectiles,
    after: ['characterContact', 'moveProjectiles'],
    why: '同帧两者争同一层无敌帧时旧实现是接触先手（overlap 注册序）；反过来的话，贴脸接触的伤害/黏滞/荆棘反伤会被敌弹吃掉的无敌帧一并挡下',
  },
  {
    name: 'cullProjectiles',
    run: cullProjectiles,
    after: ['hitSweptProjectiles', 'hitDirectProjectiles'],
    why: '命中而死的先走，剩下的才按寿命/视野/世界钩子回收',
  },
  { name: 'characterVisual', run: characterVisual },
  { name: 'updateShards', run: updateShards },
  {
    name: 'worldTick',
    run: worldTick,
    after: ['commitEnemySteps', 'characterContact'],
    why: '世界周期结算（落水掉血、圈外掉血、天体横扫）读的是本帧最终位置',
  },
]
