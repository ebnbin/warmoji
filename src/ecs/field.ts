import type Phaser from 'phaser'
import { UNIT } from '../core/units'
import { emojiImage } from '../emoji/textures'
import { playSfx } from '../audio/sfx'
import { FIELD, POLARITY_COLOR } from '../data/battlefield'
import type { FieldPickupDef } from '../data/battlefield'
import { foldBattleEffects } from '../data/battlefield'
import { Alive, MFlash, Tint, Transform } from './components'
import { enemyDef } from './store'
import type { Sim } from './sim'

// 战场拾取(ECS 版,镜像 battlefield.ts):地面待拾实体(不磁吸,靠走位拾取)+ 拾取后施加的
// 限时战斗层(battleMods,乘区每帧由 refoldBattleFx 重折)+ 携带者极性光环。
// 与金币分道:金币磁吸入账(永久经济),此处不磁吸、短时、可趋可避(战术层)。
// 拾取物是「光圈 + 图标」的组合视觉,非纯 emoji 精灵,故走 Phaser 对象而非 ECS 批绘。

interface FieldEntity {
  def: FieldPickupDef
  image: Phaser.GameObjects.Image
  ring: Phaser.GameObjects.Arc
  x: number
  y: number
  until: number
}

let entities: FieldEntity[] = []
/** 携带者光环(按敌人 eid):随敌逐帧跟位,敌人离场即销毁 */
const auras = new Map<number, Phaser.GameObjects.Arc>()

/** 开局清场(场景重建:上一局的地面拾取与光环全清) */
export function clearFieldEcs(): void {
  for (const e of entities) {
    e.image.destroy()
    e.ring.destroy()
  }
  entities = []
  for (const a of auras.values()) a.destroy()
  auras.clear()
}

/** 视口重映射(单屏图横竖切换):地面待拾物随坐标系一并挪位(携带者光环逐帧跟敌,不必管) */
export function remapFieldEcs(map: (x: number, y: number) => { x: number; y: number }): void {
  for (const e of entities) {
    const p = map(e.x, e.y)
    e.x = p.x
    e.y = p.y
    e.image.setPosition(p.x, p.y)
    e.ring.setPosition(p.x, p.y)
  }
}

/** 在场地面待拾数 / 携带者数(HUD 与 e2e 探针) */
export function fieldCounts(): { pickups: number; carriers: number } {
  return { pickups: entities.length, carriers: auras.size }
}

/** 掉一枚地面拾取(携带者死亡处):不磁吸,静置待走位拾取(镜像 spawnFieldPickup) */
export function spawnFieldPickupEcs(
  sim: Sim,
  scene: Phaser.Scene,
  x: number,
  y: number,
  def: FieldPickupDef,
): void {
  const color = POLARITY_COLOR[def.polarity]
  // 落点先过世界钩子(浮冰:钳进冰面,免得掉进水里隔着掉血区拾不回)
  const p = sim.hooks.constrainCoin(sim, x, y)
  const ring = scene.add
    .circle(p.x, p.y, FIELD.grabRadiusU * UNIT, color, 0.12)
    .setStrokeStyle(3, color, 0.9)
    .setDepth(3)
  const image = emojiImage(scene, p.x, p.y, def.emoji, 0.85 * UNIT, 'player').setDepth(6)
  // 待拾脉冲:光圈呼吸 + 图标缓浮,读得出「这里有东西可拾」
  scene.tweens.add({
    targets: ring,
    scale: { from: 0.82, to: 1.12 },
    alpha: { from: 0.9, to: 0.35 },
    duration: 700,
    yoyo: true,
    repeat: -1,
  })
  scene.tweens.add({ targets: image, y: p.y - 6, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
  const base = image.scaleX
  image.setScale(base * 0.3)
  scene.tweens.add({ targets: image, scale: base, duration: 180, ease: 'Back.easeOut' })
  entities.push({ def, image, ring, x: p.x, y: p.y, until: sim.elapsedMs + FIELD.groundMs })
}

/** 施加一层限时效果:同 id 只刷新计时不叠加,随即重折(镜像 applyFieldPickup) */
export function applyFieldPickupEcs(sim: Sim, def: FieldPickupDef): void {
  sim.battleMods = sim.battleMods.filter((m) => m.id !== def.id)
  sim.battleMods.push({
    id: def.id,
    emoji: def.emoji,
    polarity: def.polarity,
    until: sim.elapsedMs + def.durationMs,
    totalMs: def.durationMs,
    fx: def.fx,
  })
  sim.battleFx = foldBattleEffects(sim.battleMods.map((m) => m.fx))
}

/** 逐帧:拾取(队伍中心进圈即收,不磁吸)+ 地面到期淡出 + 携带者光环跟位 */
export function updateFieldEcs(sim: Sim, scene: Phaser.Scene): void {
  // 携带者光环跟位;携带者已离场(enemyDef 清空 = 死亡/自毁)则销毁光环,免得空圈留在原地
  for (const [eid, aura] of auras) {
    if (enemyDef[eid] === undefined) {
      aura.destroy()
      auras.delete(eid)
      continue
    }
    aura.setPosition(Transform.x[eid]!, Transform.y[eid]!)
  }
  if (entities.length === 0) return
  const now = sim.elapsedMs
  const grab = FIELD.grabRadiusU * UNIT
  const grab2 = grab * grab
  entities = entities.filter((p) => {
    const d = sim.hooks.worldDelta(sim, p.x, p.y, sim.center.x, sim.center.y)
    if (d.x * d.x + d.y * d.y <= grab2) {
      collect(sim, scene, p)
      return false
    }
    if (now >= p.until) {
      scene.tweens.add({
        targets: [p.image, p.ring],
        alpha: 0,
        duration: 250,
        onComplete: () => {
          p.image.destroy()
          p.ring.destroy()
        },
      })
      return false
    }
    return true
  })
}

/** 收取一枚(镜像 collectFieldPickup):爆点 + 音效 + 施加限时层 + 到手横幅 + 全队闪极性色 */
function collect(sim: Sim, scene: Phaser.Scene, p: FieldEntity): void {
  const color = POLARITY_COLOR[p.def.polarity]
  sim.pendingBursts.push({ x: p.x, y: p.y, count: 10, kind: 'coin' })
  playSfx(p.def.polarity === 'buff' ? 'levelup' : 'hurt')
  p.image.destroy()
  p.ring.destroy()
  applyFieldPickupEcs(sim, p.def)
  scene.events.emit('field-collected', {
    emoji: p.def.emoji,
    name: p.def.name,
    desc: p.def.desc,
    polarity: p.def.polarity,
  })
  // 到手反馈:全队闪一下极性色
  // 走受击闪光同一通道:否则 memberVisual 每帧把染色抹回常态,只闪得到一帧
  for (const m of sim.members) {
    if (!Alive.v[m]) continue
    MFlash.until[m] = sim.elapsedMs + 300
    Tint.color[m] = color
    Tint.effect[m] = 0
  }
}

/** 给携带者敌人挂极性光环(镜像 attachCarrierAura) */
export function attachCarrierAuraEcs(scene: Phaser.Scene, eid: number, def: FieldPickupDef): void {
  const color = POLARITY_COLOR[def.polarity]
  const aura = scene.add
    .circle(Transform.x[eid]!, Transform.y[eid]!, FIELD.auraRadiusU * UNIT, color, 0.18)
    .setStrokeStyle(3, color, 0.85)
    .setDepth(4)
  scene.tweens.add({
    targets: aura,
    scale: { from: 0.85, to: 1.12 },
    alpha: { from: 0.85, to: 0.4 },
    duration: 650,
    yoyo: true,
    repeat: -1,
  })
  auras.set(eid, aura)
}

/** 携带者离场:销毁光环(死亡处掉拾取由调用方负责) */
export function detachCarrierAuraEcs(eid: number): void {
  const aura = auras.get(eid)
  if (!aura) return
  aura.destroy()
  auras.delete(eid)
}
