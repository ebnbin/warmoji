import { playSfx } from '../audio/sfx'
import { CAPTAINS, CHARACTERS, MEMBER, TEAM, loadoutFor } from '../characters/registry'
import { memberMaxHp } from '../characters/stats'
import { emojiImage } from '../emoji/textures'
import {
  upgradeTiers,
  aggregateCharacterEffects,
  aggregateTeamEffects,
  COIN,
  ITEMS,
  resolveAbilityDef,
} from '../items/registry'
import { UNIT } from '../lib/units'
import { norm } from '../lib/vec'
import { CHEST, rollChestLoot } from '../run/chest'
import { createAbility } from '../abilities/create'
import { KNOCKBACK } from '../abilities/registry'
import { circleBody } from './arcade'
import { toPx } from './px'
import type { ArcadeBody, BaseArenaScene, ImageObj } from './BaseArenaScene'

// 拾取经济：金币/宝箱的生成、磁吸、入账与开箱即时生效，外加击杀碎裂的
// 经验珠视觉。宝箱与金币同组同管线（data 标记分流）；世界差异（钳制/
// 回收/闲置漂移）全部经场景钩子（constrainCoinPos/cullCoin/coinIdleVelocity）。

export function spawnCoins(scene: BaseArenaScene, x: number, y: number, count: number): void {
  for (let i = 0; i < count; i++) {
    // 多枚时散开一点，便于看清数量
    const jx = count > 1 ? (scene.rng.next() - 0.5) * 0.6 * UNIT : 0
    const jy = count > 1 ? (scene.rng.next() - 0.5) * 0.6 * UNIT : 0
    const pos = scene.constrainCoinPos({ x: x + jx, y: y + jy })
    const coin = emojiImage(scene, pos.x, pos.y, COIN.emoji, COIN.size * UNIT, 'player').setDepth(3)
    scene.physics.add.existing(coin)
    circleBody(coin, COIN.radius * UNIT)
    scene.coins.add(coin)
    // 掉落弹出
    const base = coin.scaleX
    coin.setScale(base * 0.3)
    scene.tweens.add({ targets: coin, scale: base, duration: 160, ease: 'Back.easeOut' })
  }
}

export function magnetCoins(scene: BaseArenaScene): void {
  // 金币拾取是团队能力：以队伍中心为基点磁吸并入账（成员碰到也能捡，见 overlap）。
  // 磁力回旋镖（frameAttractors）优先：镖旁的金币直接入账，省去飞回中心的路程
  const magnetRadius = COIN.magnetRadius * UNIT * scene.teamFx.magnetMul
  const r2 = magnetRadius * magnetRadius
  const collect2 = COIN.collectRadius * UNIT * (COIN.collectRadius * UNIT)
  const idle = scene.coinIdleVelocity()
  for (const c of scene.coins.getChildren() as ImageObj[]) {
    if (!c.active) continue
    // 世界回收（河流：漂出下游即被冲走）
    if (scene.cullCoin(c)) {
      c.destroy()
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
      body.setVelocity(dir.x * COIN.magnetSpeed * UNIT + idle.x, dir.y * COIN.magnetSpeed * UNIT + idle.y)
    } else {
      body.setVelocity(idle.x, idle.y)
    }
  }
}

export function collectCoin(scene: BaseArenaScene, coin: ImageObj): void {
  if (!coin.active) return
  if (coin.getData('chest')) {
    openChest(scene, coin)
    return
  }
  scene.coinBurst.explode(4, coin.x, coin.y)
  playSfx('coin')
  coin.destroy()
  scene.run.coins += 1
}

/** 宝箱走金币的磁吸/回收/拾取管线（同组 + data 标记分流） */
export function spawnChest(scene: BaseArenaScene, x: number, y: number): void {
  const pos = scene.constrainCoinPos({ x, y })
  const chest = emojiImage(scene, pos.x, pos.y, CHEST.emoji, CHEST.size * UNIT, 'player').setDepth(4)
  chest.setData('chest', true)
  scene.physics.add.existing(chest)
  circleBody(chest, CHEST.radius * UNIT)
  scene.coins.add(chest)
  const base = chest.scaleX
  chest.setScale(base * 0.3)
  scene.tweens.add({ targets: chest, scale: base, duration: 220, ease: 'Back.easeOut' })
}

/** 开箱：抽 1 件当前阵容用得上的道具，免费入包并立即生效 */
function openChest(scene: BaseArenaScene, chest: ImageObj): void {
  const { x, y } = chest
  chest.destroy()
  scene.coinBurst.explode(12, x, y)
  playSfx('levelup')
  const loot = rollChestLoot(
    scene.run.roster,
    scene.run.memberItems,
    scene.run.captainItems,
    () => scene.rng.next(),
  )
  if (!loot) {
    scene.run.coins += CHEST.fallbackCoins
    return
  }
  let owner: string
  if (loot.slot < 0) {
    scene.run.captainItems.push(loot.itemId)
    // 队长道具全部经 teamFx 实时读取，重算即生效
    scene.teamFx = aggregateTeamEffects(scene.run.captainItems)
    scene.stats.moveSpeed = TEAM.moveSpeed * UNIT * scene.teamFx.moveSpeedMul
    owner = `队长${CAPTAINS[scene.run.captainId].name}`
  } else {
    scene.run.memberItems[loot.slot]?.push(loot.itemId)
    refreshMemberItems(scene, loot.slot)
    owner = CHARACTERS[scene.run.roster[loot.slot]!]?.name ?? ''
  }
  const item = ITEMS[loot.itemId]
  scene.events.emit('chest-open', {
    emoji: item.emoji,
    name: item.name,
    rarity: item.rarity,
    owner,
  })
}

/** 开箱即时生效：按最新道具重算派生属性并热重建能力（升级卡质变/
 * 射程弹速类立即可见）。每波开局 createMember 整体重建，这里只覆盖本波剩余 */
function refreshMemberItems(scene: BaseArenaScene, slot: number): void {
  const m = scene.members[slot]
  const id = scene.run.roster[slot]
  if (!m || !id) return
  const owned = scene.run.memberItems[slot] ?? []
  const fx = aggregateCharacterEffects(owned)
  // 原地覆写：能力 ctx 闭包读的就是这个对象（伤害/攻速/暴击/击退实时生效）
  Object.assign(m.fx, fx)
  const maxHp = memberMaxHp(fx.hpAdd)
  if (m.alive) m.hp = Math.max(1, Math.min(maxHp, m.hp + Math.max(0, maxHp - m.maxHp)))
  else m.hp = Math.min(m.hp, maxHp)
  m.maxHp = maxHp
  m.shownHpRatio = -1
  m.iframesMs = MEMBER.iframesMs + fx.iframesAddMs
  m.reviveMs = Math.max(1000, TEAM.reviveMs + fx.reviveAddMs)
  m.regenPerSec = fx.regenPerSec
  m.thorns = fx.thorns
  m.killHeal = fx.killHeal
  for (const w of m.abilities) w.destroy()
  m.abilities = loadoutFor(CHARACTERS[id], upgradeTiers(id, owned)).map((w, i) =>
    createAbility(toPx(resolveAbilityDef(w, m.fx)), m.ctx, 200 + i * 230),
  )
  if (!m.alive) for (const w of m.abilities) w.setVisible(false)
}

/** 击杀碎裂：敌人纹理四分为碎片抛散淡出（对象池复用，见 scene.shardPool） */
export function spawnShards(scene: BaseArenaScene, enemy: ImageObj, flingVx: number, flingVy: number): void {
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
