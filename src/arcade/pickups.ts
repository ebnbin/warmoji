import { playSfx } from '../audio/sfx'
import { CAPTAINS } from '../captains/registry'
import { emojiKey } from '../emoji/textures'
import { UNIT } from '../core/units'
import { norm } from '../core/vec'
import { PICKUP, PICKUPS } from '../pickups/registry'
import { KNOCKBACK } from '../abilities/registry'
import { acquirePooled, releasePooled } from './pool'
import type { ArcadeBody, ArcadeBattleScene, ImageObj } from './ArcadeBattleScene'

// 拾取经济：金币的生成、磁吸、入账，外加击杀碎裂的经验珠视觉。
// 世界差异（钳制/回收/闲置漂移）全部经场景钩子（constrainCoinPos/cullCoin/coinIdleVelocity）。

export function spawnCoins(scene: ArcadeBattleScene, x: number, y: number, count: number): void {
  for (let i = 0; i < count; i++) {
    // 多枚时散开一点，便于看清数量
    const jx = count > 1 ? (scene.rng.next() - 0.5) * 0.6 * UNIT : 0
    const jy = count > 1 ? (scene.rng.next() - 0.5) * 0.6 * UNIT : 0
    const pos = scene.constrainCoinPos({ x: x + jx, y: y + jy })
    const coin = acquirePooled(scene, scene.coins, pos.x, pos.y, emojiKey(PICKUPS.coin.emoji, 'player'), PICKUPS.coin.size * UNIT, PICKUPS.coin.radius * UNIT)
    coin.setDepth(3)
    // 掉落弹出
    const base = coin.scaleX
    coin.setScale(base * 0.3)
    scene.tweens.add({ targets: coin, scale: base, duration: 160, ease: 'Back.easeOut' })
  }
}

export function magnetCoins(scene: ArcadeBattleScene): void {
  // 金币拾取是团队能力：以队伍中心为基点磁吸并入账（成员碰到也能捡，见 overlap）。
  // 磁力回旋镖（frameAttractors）优先：镖旁的金币直接入账，省去飞回中心的路程
  const magnetRadius = CAPTAINS[scene.run.captainId].coinMagnet * UNIT * scene.teamFx.magnetMul
  const r2 = magnetRadius * magnetRadius
  const collect2 = PICKUP.collectRadius * UNIT * (PICKUP.collectRadius * UNIT)
  const idle = scene.coinIdleVelocity()
  for (const c of scene.coins.getChildren() as ImageObj[]) {
    if (!c.active) continue
    // 世界回收（河流：漂出下游即被冲走）
    if (scene.cullCoin(c)) {
      releasePooled(c)
      continue
    }
    if (scene.frameAttractors.length > 0) {
      let taken = false
      for (const a of scene.frameAttractors) {
        const ad = scene.worldDelta(c, a)
        if (ad.x * ad.x + ad.y * ad.y <= a.r2) {
          collectCoin(scene, c)
          taken = true
          break
        }
      }
      if (taken) continue
    }
    const d = scene.worldDelta(c, scene.center)
    const dist = d.x * d.x + d.y * d.y
    if (dist <= collect2) {
      collectCoin(scene, c)
      continue
    }
    const body = c.body as ArcadeBody
    if (dist < r2) {
      const dir = norm(d.x, d.y)
      body.setVelocity(dir.x * PICKUP.magnetSpeed * UNIT + idle.x, dir.y * PICKUP.magnetSpeed * UNIT + idle.y)
    } else {
      body.setVelocity(idle.x, idle.y)
    }
  }
}

export function collectCoin(scene: ArcadeBattleScene, coin: ImageObj): void {
  if (!coin.active) return
  scene.coinBurst.explode(4, coin.x, coin.y)
  playSfx('coin')
  releasePooled(coin)
  scene.run.coins += 1
}

/** 击杀碎裂：敌人纹理四分为碎片抛散淡出（对象池复用，见 scene.shardPool） */
export function spawnShards(scene: ArcadeBattleScene, enemy: ImageObj, flingVx: number, flingVy: number): void {
  const tex = enemy.texture
  if (!tex.has('shard0')) {
    const sw = tex.source[0]!.width
    const sh = tex.source[0]!.height
    tex.add('shard0', 0, 0, 0, sw / 2, sh / 2)
    tex.add('shard1', 0, sw / 2, 0, sw / 2, sh / 2)
    tex.add('shard2', 0, 0, sh / 2, sw / 2, sh / 2)
    tex.add('shard3', 0, sw / 2, sh / 2, sw / 2, sh / 2)
    // Texture.add 会把 firstFrame 改指向新 frame，导致此后按 key 默认创建的
    // 同类敌人渲染成左上角碎片——必须拨回基础帧
    tex.firstFrame = '__BASE'
  }
  const dw = enemy.displayWidth / 2
  const dh = enemy.displayHeight / 2
  const t = KNOCKBACK.deathSlideMs / 1000
  for (let i = 0; i < 4; i++) {
    const shard = scene.shardPool[scene.shardPoolIdx]!
    scene.shardPoolIdx = (scene.shardPoolIdx + 1) % scene.shardPool.length
    scene.tweens.killTweensOf(shard)
    // 翻转的敌人纹理左半显示在右侧：碎片同步镜像保证碎裂瞬间与本体无缝
    const col = i % 2 === 0 ? -1 : 1
    const ox = (enemy.flipX ? -col : col) * (dw / 2)
    const oy = (i < 2 ? -1 : 1) * (dh / 2)
    shard
      .setTexture(tex.key, `shard${i}`)
      .setDisplaySize(dw, dh)
      .setFlipX(enemy.flipX)
      .setPosition(enemy.x + ox, enemy.y + oy)
      .setRotation(0)
      .setAlpha(1)
      .setVisible(true)
    const dir = norm(ox, oy)
    // 散开幅度收紧 + 飞行中缩小到 ~1/5：碎裂足迹整体控制在原尺寸 ~1.5 倍内
    const scatter = 45 + scene.rng.next() * 65
    const vx = flingVx + dir.x * scatter
    const vy = flingVy + dir.y * scatter
    const end = scene.constrainShardTarget({ x: shard.x + vx * t, y: shard.y + vy * t })
    scene.tweens.add({
      targets: shard,
      x: end.x,
      y: end.y,
      scale: shard.scaleX * 0.2,
      rotation: (scene.rng.next() - 0.5) * 6,
      alpha: 0,
      duration: KNOCKBACK.deathSlideMs,
      onComplete: () => shard.setVisible(false),
    })
  }
}
