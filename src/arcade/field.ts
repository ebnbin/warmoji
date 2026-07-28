import type Phaser from 'phaser'
import { UNIT } from '../util/units'
import { emojiImage } from '../emoji/textures'
import { playSfx } from '../audio/sfx'
import { BATTLE_FX_IDENTITY, CARRIER_BUDGET, FIELD, POLARITY_COLOR, POOLS } from '../data/battlefield'
import type { BattleEffects, FieldPickupDef, Polarity } from '../types/battlefield'
import type { ArcadeBattleScene, ImageObj } from './ArcadeBattleScene'
import type { Enemy } from './enemy/enemies'
import type { MapId } from '../types/maps'

// 战场拾取运行时：地面待拾实体（不磁吸，靠走位拾取）+ 已激活的限时战斗层
// （battleMods → battleFx，逐帧重折）+ 携带者极性光环。金币在 pickups/，
// 与此分道：那两者磁吸入账（永久经济），此处不磁吸、短时、可趋可避（战术层）。

/** 地面待拾实体：光圈 + 图标，队伍中心进入 grabRadius 即收 */
export interface FieldPickupEntity {
  def: FieldPickupDef
  image: ImageObj
  ring: Phaser.GameObjects.Arc
  /** 落点（固定，拾取判定用；image.y 的上下浮动只是视觉） */
  x: number
  y: number
  /** 地面到期时刻（无人拾取则淡出） */
  until: number
  grabbed: boolean
}

/** 掉一枚地面拾取（携带者死亡处 / 注入器）：不磁吸，静置待走位拾取 */
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
  // 待拾脉冲：光圈呼吸 + 图标缓浮，读得出「这里有东西可拾」
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

/** 逐帧：拾取（队伍中心进圈即收，不磁吸）+ 地面到期淡出 */
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
  // 到手横幅：告诉玩家拿到了什么（名字 + 效果说明 + 极性），UIScene 渲染
  scene.events.emit('field-collected', {
    emoji: p.def.emoji,
    name: p.def.name,
    desc: p.def.desc,
    polarity: p.def.polarity,
  })
  // 到手反馈：全队闪一下极性色
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

/** 施加一层限时效果：同 id 只刷新计时不叠加，随即重折 battleFx */
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

/** 剔除到期项后重折 battleFx（update 开头每帧调，保证乘区实时） */
export function refoldBattleFx(scene: ArcadeBattleScene): void {
  const now = scene.elapsedMs
  const live = scene.battleMods.filter((m) => m.until > now)
  scene.battleMods = live
  scene.battleFx =
    live.length === 0 ? { ...BATTLE_FX_IDENTITY } : foldBattleEffects(live.map((m) => m.fx))
}

/** 给携带者敌人挂极性光环（绿=增益/红=减益），随敌逐帧跟位 */
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

/** 携带者离场（死亡/消散）：销毁光环并回收计数 */
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

// 限时战斗层的规则：多来源效果折叠、按波次分配携带者预算与抽取。
// 只被两套战斗实现消费。

/** 叠加多个限时片段：乘区相乘、crit 相加，最终封顶/保底防叠飞。 */
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
/** 本波携带者预算（固定数量，非概率）：随波次上探，Boss 波偏减益施压。分档表见 battlefield 数据 */
export function waveCarrierBudget(wave: number, isBoss: boolean): { buff: number; debuff: number } {
  const cb = CARRIER_BUDGET
  if (isBoss) return { buff: cb.boss.buff, debuff: cb.boss.debuff }
  for (const t of cb.waveTiers) if (wave <= t.upToWave) return { buff: t.buff, debuff: t.debuff }
  return { buff: cb.fallback.buff, debuff: cb.fallback.debuff }
}
/** 本波所有携带者背的拾取（buff/debuff 数由预算表定，从本图池随机抽，可重复） */
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
