import { playSfx } from '../audio/sfx'
import { CAPTAINS } from '../data/captains'
import { emojiKey } from '../emoji/textures'
import { UNIT } from '../util/units'
import { norm } from '../util/vec'
import { PICKUP, PICKUPS } from '../data/pickups'
import { KNOCKBACK } from '../data/abilities'
import { acquirePooled, releasePooled } from './pool'
import type { ArcadeBody, ArcadeBattleScene, ImageObj } from './ArcadeBattleScene'

export function spawnCoins(scene: ArcadeBattleScene, x: number, y: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const jx = count > 1 ? (scene.rng.next() - 0.5) * 0.6 * UNIT : 0
    const jy = count > 1 ? (scene.rng.next() - 0.5) * 0.6 * UNIT : 0
    const pos = scene.constrainCoinPos({ x: x + jx, y: y + jy })
    const coin = acquirePooled(scene, scene.coins, pos.x, pos.y, emojiKey(PICKUPS.coin.emoji, 'player'), PICKUPS.coin.size * UNIT, PICKUPS.coin.radius * UNIT)
    coin.setDepth(3)
    const base = coin.scaleX
    coin.setScale(base * 0.3)
    scene.tweens.add({ targets: coin, scale: base, duration: 160, ease: 'Back.easeOut' })
  }
}

export function magnetCoins(scene: ArcadeBattleScene): void {
  const magnetRadius = CAPTAINS[scene.run.captainId].coinMagnet * UNIT * scene.teamFx.magnetMul
  const r2 = magnetRadius * magnetRadius
  const collect2 = PICKUP.collectRadius * UNIT * (PICKUP.collectRadius * UNIT)
  const idle = scene.coinIdleVelocity()
  for (const c of scene.coins.getChildren() as ImageObj[]) {
    if (!c.active) continue
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

export function spawnShards(scene: ArcadeBattleScene, enemy: ImageObj, flingVx: number, flingVy: number): void {
  const tex = enemy.texture
  if (!tex.has('shard0')) {
    const sw = tex.source[0]!.width
    const sh = tex.source[0]!.height
    tex.add('shard0', 0, 0, 0, sw / 2, sh / 2)
    tex.add('shard1', 0, sw / 2, 0, sw / 2, sh / 2)
    tex.add('shard2', 0, 0, sh / 2, sw / 2, sh / 2)
    tex.add('shard3', 0, sw / 2, sh / 2, sw / 2, sh / 2)
    // Texture.add 会把 firstFrame 改指向新 frame，须拨回基础帧
    tex.firstFrame = '__BASE'
  }
  const dw = enemy.displayWidth / 2
  const dh = enemy.displayHeight / 2
  const t = KNOCKBACK.deathSlideMs / 1000
  for (let i = 0; i < 4; i++) {
    const shard = scene.shardPool[scene.shardPoolIdx]!
    scene.shardPoolIdx = (scene.shardPoolIdx + 1) % scene.shardPool.length
    scene.tweens.killTweensOf(shard)
    // 本体翻转时碎片同步镜像
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
