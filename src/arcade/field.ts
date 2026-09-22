import type Phaser from 'phaser'
import { UNIT } from '../util/units'
import { emojiImage } from '../emoji/textures'
import { playSfx } from '../audio/sfx'
import { BATTLE_FX_IDENTITY, CARRIER_BUDGET, FIELD, POLARITY_COLOR, POOLS } from '../data/battlefield'
import type { BattleEffects, FieldPickupDef, Polarity } from '../types/battlefield'
import type { ArcadeBattleScene, ImageObj } from './ArcadeBattleScene'
import type { Enemy } from './enemy/enemies'
import type { MapId } from '../types/maps'

/** 队伍中心进入 grabRadius 即收，不磁吸 */
export interface FieldPickupEntity {
  def: FieldPickupDef
  image: ImageObj
  ring: Phaser.GameObjects.Arc
  /** 拾取判定用；image 的浮动只是视觉 */
  x: number
  y: number
  until: number
  grabbed: boolean
}

export function spawnFieldPickup(
  scene: ArcadeBattleScene,
  x: number,
  y: number,
  def: FieldPickupDef,
): void {
  const pos = scene.constrainCoinPos({ x, y })
  const color = POLARITY_COLOR[def.polarity]
  const ring = scene.add
    .circle(pos.x, pos.y, FIELD.grabRadiusU * UNIT, color, 0.12)
    .setStrokeStyle(3, color, 0.9)
    .setDepth(3)
  const image = emojiImage(scene, pos.x, pos.y, def.emoji, 0.85 * UNIT, 'player').setDepth(6)
  scene.tweens.add({
    targets: ring,
    scale: { from: 0.82, to: 1.12 },
    alpha: { from: 0.9, to: 0.35 },
    duration: 700,
    yoyo: true,
    repeat: -1,
  })
  scene.tweens.add({
    targets: image,
    y: pos.y - 6,
    duration: 620,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  })
  const base = image.scaleX
  image.setScale(base * 0.3)
  scene.tweens.add({ targets: image, scale: base, duration: 180, ease: 'Back.easeOut' })
  scene.fieldPickups.push({
    def,
    image,
    ring,
    x: pos.x,
    y: pos.y,
    until: scene.elapsedMs + FIELD.groundMs,
    grabbed: false,
  })
}

export function updateFieldPickups(scene: ArcadeBattleScene): void {
  if (scene.fieldPickups.length === 0) return
  const now = scene.elapsedMs
  const grab2 = FIELD.grabRadiusU * UNIT * (FIELD.grabRadiusU * UNIT)
  scene.fieldPickups = scene.fieldPickups.filter((p) => {
    if (p.grabbed) return false
    const d = scene.worldDelta(p, scene.center)
    if (d.x * d.x + d.y * d.y <= grab2) {
      collectFieldPickup(scene, p)
      return false
    }
    if (now >= p.until) {
      fadeEntity(p)
      return false
    }
    return true
  })
}

function collectFieldPickup(scene: ArcadeBattleScene, p: FieldPickupEntity): void {
  p.grabbed = true
  const color = POLARITY_COLOR[p.def.polarity]
  scene.coinBurst.explode(10, p.x, p.y)
  playSfx(p.def.polarity === 'buff' ? 'levelup' : 'hurt')
  p.image.destroy()
  p.ring.destroy()
  applyFieldPickup(scene, p.def)
  // 横幅由 UIScene 渲染
  scene.events.emit('field-collected', {
    emoji: p.def.emoji,
    name: p.def.name,
    desc: p.def.desc,
    polarity: p.def.polarity,
  })
  for (const m of scene.members) {
    if (!m.alive) continue
    m.image.setTint(color)
    scene.time.delayedCall(300, () => {
      if (m.alive) m.image.clearTint()
    })
  }
}

function fadeEntity(p: FieldPickupEntity): void {
  const scene = p.image.scene
  scene.tweens.add({
    targets: [p.image, p.ring],
    alpha: 0,
    duration: 250,
    onComplete: () => {
      p.image.destroy()
      p.ring.destroy()
    },
  })
}

/** 同 id 只刷新计时不叠加 */
export function applyFieldPickup(scene: ArcadeBattleScene, def: FieldPickupDef): void {
  scene.battleMods = scene.battleMods.filter((m) => m.id !== def.id)
  scene.battleMods.push({
    id: def.id,
    emoji: def.emoji,
    polarity: def.polarity,
    until: scene.elapsedMs + def.durationMs,
    totalMs: def.durationMs,
    fx: def.fx,
  })
  refoldBattleFx(scene)
}

/** 每帧 update 开头调 */
export function refoldBattleFx(scene: ArcadeBattleScene): void {
  const now = scene.elapsedMs
  const live = scene.battleMods.filter((m) => m.until > now)
  scene.battleMods = live
  scene.battleFx =
    live.length === 0 ? { ...BATTLE_FX_IDENTITY } : foldBattleEffects(live.map((m) => m.fx))
}

export function attachCarrierAura(
  scene: ArcadeBattleScene,
  enemy: ImageObj,
  polarity: Polarity,
): Phaser.GameObjects.Arc {
  const color = POLARITY_COLOR[polarity]
  const aura = scene.add
    .circle(enemy.x, enemy.y, FIELD.auraRadiusU * UNIT, color, 0.18)
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
  scene.carrierCount += 1
  return aura
}

/** 携带者死亡或消散时都须调，回收计数 */
export function detachCarrierAura(scene: ArcadeBattleScene, a: Enemy): void {
  if (!a.aura) return
  a.aura.destroy()
  a.aura = undefined
  scene.carrierCount = Math.max(0, scene.carrierCount - 1)
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

function pickPolarity(
  pool: readonly FieldPickupDef[],
  polarity: Polarity,
  rand: () => number,
): FieldPickupDef | undefined {
  const sub = pool.filter((d) => d.polarity === polarity)
  if (sub.length === 0) return undefined
  return sub[Math.floor(rand() * sub.length) % sub.length]
}

/** 乘区相乘、crit 相加，再封顶/保底 */
export function foldBattleEffects(parts: readonly Partial<BattleEffects>[]): BattleEffects {
  const fx = { ...BATTLE_FX_IDENTITY }
  for (const p of parts) {
    if (p.moveSpeedMul !== undefined) fx.moveSpeedMul *= p.moveSpeedMul
    if (p.teamDamageMul !== undefined) fx.teamDamageMul *= p.teamDamageMul
    if (p.teamCooldownMul !== undefined) fx.teamCooldownMul *= p.teamCooldownMul
    if (p.critAdd !== undefined) fx.critAdd += p.critAdd
    if (p.enemySlowMul !== undefined) fx.enemySlowMul *= p.enemySlowMul
  }
  fx.moveSpeedMul = clamp(fx.moveSpeedMul, 0.35, 2.2)
  fx.teamDamageMul = clamp(fx.teamDamageMul, 0.35, 2.5)
  fx.teamCooldownMul = clamp(fx.teamCooldownMul, 0.4, 2.2)
  fx.critAdd = clamp(fx.critAdd, 0, 0.5)
  fx.enemySlowMul = clamp(fx.enemySlowMul, 0.4, 2.2)
  return fx
}
/** 固定数量，非概率 */
export function waveCarrierBudget(wave: number, isBoss: boolean): { buff: number; debuff: number } {
  const cb = CARRIER_BUDGET
  if (isBoss) return { buff: cb.boss.buff, debuff: cb.boss.debuff }
  for (const t of cb.waveTiers) if (wave <= t.upToWave) return { buff: t.buff, debuff: t.debuff }
  return { buff: cb.fallback.buff, debuff: cb.fallback.debuff }
}
/** 可重复抽中同一拾取 */
export function rollWaveCarriers(
  mapId: MapId,
  wave: number,
  isBoss: boolean,
  rand: () => number,
): FieldPickupDef[] {
  const budget = waveCarrierBudget(wave, isBoss)
  const pool = POOLS[mapId]
  const out: FieldPickupDef[] = []
  for (let i = 0; i < budget.buff; i++) {
    const d = pickPolarity(pool, 'buff', rand)
    if (d) out.push(d)
  }
  for (let i = 0; i < budget.debuff; i++) {
    const d = pickPolarity(pool, 'debuff', rand)
    if (d) out.push(d)
  }
  return out
}
