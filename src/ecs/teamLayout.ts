import { UNIT } from '../util/units'
import { FOLLOW, WANDER } from '../data/feel'
import { MEMBER } from '../data/characters'
import { formationPosts } from '../data/formation'
import { Alive, Breath, Depth, Follow, Pop, Sprite, Threat, Transform, VisOff, Wander } from './components'
import { backEaseOut } from './ease'
import type { Sim } from './sim'

// 队伍编队的两桩每帧活儿。这不是 system——它俩带 delta 参数，因为首帧摆位
// （initialLayout）要用 0 调一次；每帧的那次由 systems/moveTeam.ts 传 sim.dtMs。

/** 逐员布局:岗位偏移 + 待机游移 + 跟随弹簧 → 写 Follow/Transform/Depth(镜像 layoutTeam)。
 * 只管人站在哪;呼吸/弹入/翻转等纯表现在 animateMembers */
export function layout(sim: Sim, delta: number): void {
  const posts = formationPosts(sim.formation, sim.count, sim.orbitPhase)
  const moving = sim.teamDir.x !== 0 || sim.teamDir.y !== 0
  const dt = Math.min(delta, 50) / 1000
  const tSec = sim.elapsedMs / 1000
  for (let slot = 0; slot < sim.members.length; slot++) {
    const eid = sim.members[slot]!
    const idx = sim.postBySlot[slot] ?? slot
    const p = posts[idx] ?? { x: 0, y: 0 }
    const wanderOn = Alive.v[eid]! && !moving && !Threat.v[eid]
    let amp = Wander.amp[eid]!
    amp += ((wanderOn ? 1 : 0) - amp) * Math.min(1, delta / WANDER.rampMs)
    Wander.amp[eid] = amp
    const wander = amp * WANDER.radius
    const seed = Wander.seed[eid]!
    const rawX = sim.center.x + p.x + Math.sin(tSec * WANDER.freqX + seed) * wander
    const rawY = sim.center.y + p.y + Math.sin(tSec * WANDER.freqY + seed * 2.3) * wander
    // 跟随弹簧(用局部量演算,避免类型化数组元素的复合赋值歧义)
    let fx = Follow.x[eid]!
    let fy = Follow.y[eid]!
    let fvx = Follow.vx[eid]!
    let fvy = Follow.vy[eid]!
    // 环面弹簧:目标取离当前跟随点最近的镜像——中心穿缝时队员各自走最短路穿门,阵型全程连贯
    const td = sim.hooks.worldDelta(sim, fx, fy, rawX, rawY)
    const tx = fx + td.x
    const ty = fy + td.y
    if (dt > 0) {
      const k = Follow.k[eid]!
      const c = 2 * Math.sqrt(k) * FOLLOW.zeta
      fvx += (k * (tx - fx) - c * fvx) * dt
      fvy += (k * (ty - fy) - c * fvy) * dt
      fx += fvx * dt
      fy += fvy * dt
    }
    const lagX = tx - fx
    const lagY = ty - fy
    const lag = Math.hypot(lagX, lagY)
    if (lag > FOLLOW.maxLag) {
      const pull = 1 - FOLLOW.maxLag / lag
      fx += lagX * pull
      fy += lagY * pull
    }
    // 跟随点回绕(环面),弹簧状态始终保持在竞技场内
    const wrapped = sim.hooks.wrap(sim, fx, fy)
    fx = wrapped.x
    fy = wrapped.y
    Follow.x[eid] = fx
    Follow.y[eid] = fy
    Follow.vx[eid] = fvx
    Follow.vy[eid] = fvy
    // 能力视觉偏移叠在跟随点之上(突刺前冲/瞬闪):只动画面,不动阵型与索敌锚点
    Transform.x[eid] = fx + VisOff.x[eid]!
    Transform.y[eid] = fy + VisOff.y[eid]!
    const guarded = sim.formation === 'guard' && idx === 0
    // 遮挡纵深按世界差(环面上贴缝时不跳变)
    Depth.z[eid] = guarded ? 8.5 : 10 + sim.hooks.worldDelta(sim, sim.center.x, sim.center.y, fx, fy).y / UNIT
  }
}

/** 队员的程序化小动画(镜像 animateMember):呼吸挤压拉伸 + 朝移动方向翻转(仅活着的)。
 * 复活弹入期(Pop)用弹入缩放覆盖呼吸(镜像 reviveMember 的 Back.easeOut scale 弹) */
export function animateMembers(sim: Sim, delta: number): void {
  const moving = sim.teamDir.x !== 0 || sim.teamDir.y !== 0
  const memberSize = MEMBER.size * UNIT
  for (const eid of sim.members) {
    if (!Alive.v[eid]) continue
    if (Pop.until[eid]! > sim.elapsedMs) {
      const t = 1 - (Pop.until[eid]! - sim.elapsedMs) / 200
      const pop = memberSize * (0.3 + 0.7 * backEaseOut(t))
      Transform.w[eid] = pop
      Transform.h[eid] = pop
    } else {
      const bp = Breath.phase[eid]! + delta / (moving ? 85 : 140)
      Breath.phase[eid] = bp
      const s = Math.sin(bp) * (moving ? 0.13 : 0.09)
      Transform.w[eid] = memberSize * (1 - s * 0.6)
      Transform.h[eid] = memberSize * (1 + s)
    }
    if (Math.abs(sim.teamDir.x) > 0.2) Sprite.flipX[eid] = sim.teamDir.x > 0 ? 1 : 0
  }
}
