import { playSfx } from '../audio/sfx'
import { CAPTAINS, MEMBER, TEAM } from '../characters/registry'
import { prodigyDamage, SKILL } from '../characters/skill'
import { emojiImage } from '../emoji/textures'
import { UNIT } from '../lib/units'
import { waveAt } from '../run/waves'
import { viewport } from '../screen/apply'
import type { BaseArenaScene, ImageObj } from './BaseArenaScene'
import { enemyOf } from './enemies'
import { spawnCoins } from './pickups'

// 队长主动技能的战斗内实现：castCaptainSkill 收口就绪/弹药校验、扣豆、分派；
// 五个效果函数各自为政——每加一个队长在此长一段（与武器运行时同种的内容形状）。
// 宿主就是 BaseArenaScene（仅类型引用；效果读写场景的公开战斗状态）。

/** 释放主动技能（UIScene 按钮/E 键触发） */
export function castCaptainSkill(scene: BaseArenaScene): boolean {
  if (scene.over || scene.stress || scene.run.skillCdMs > 0 || scene.run.beans <= 0) return false
  const id = scene.run.captainId
  scene.run.beans -= 1
  scene.run.skillCdMs = CAPTAINS[id].skill.cdMs
  playSfx('levelup')
  scene.events.emit('skill-cast', CAPTAINS[id].skill.name)
  switch (id) {
    case 'angel':
      skillAngel(scene)
      break
    case 'moneybags':
      skillMoneybags(scene)
      break
    case 'party':
      skillParty(scene)
      break
    case 'scholar':
      skillScholar(scene)
      break
    case 'prodigy':
      skillProdigy(scene)
      break
  }
  return true
}

/** 圣光降临：阵亡者满血复活、存活者回血、全队短暂无敌。
 * 无敌走受击无敌帧通道（把「上次受击」推到未来），挡接触与敌弹；
 * 毒液池/毒雾走独立计时，不受无敌保护 */
function skillAngel(scene: BaseArenaScene): void {
  for (const m of scene.members) {
    if (!m.alive) scene.reviveMember(m)
    else m.hp = Math.min(m.maxHp, m.hp + m.maxHp * SKILL.angel.healRatio)
    m.lastHitMs = scene.elapsedMs + SKILL.angel.invulnMs - m.iframesMs
    m.image.setTint(0xffe082)
    scene.time.delayedCall(320, () => {
      if (m.alive) m.image.clearTint()
    })
  }
  const ring = scene.add
    .circle(scene.center.x, scene.center.y, (TEAM.ringRadius + MEMBER.radius) * UNIT, 0xfff59d, 0.3)
    .setStrokeStyle(4, 0xffe082, 0.9)
    .setDepth(20)
    .setScale(0.4)
  scene.tweens.add({
    targets: ring,
    scale: 3,
    alpha: 0,
    duration: 550,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy(),
  })
}

/** 天降横财：金袋逐个砸向离队伍最近的 N 个敌人——伤害 + 强击退 +
 * 每袋落地掉金币（砸死的敌人尸体照常掉落，两份都拿） */
function skillMoneybags(scene: BaseArenaScene): void {
  const nearest = (scene.enemies.getChildren() as ImageObj[])
    .filter((e) => e.active && !enemyOf(e).dormant)
    .map((e) => {
      const d = scene.worldDelta(scene.center, e)
      return { e, d2: d.x * d.x + d.y * d.y }
    })
    .sort((a, b) => a.d2 - b.d2)
    .slice(0, SKILL.moneybags.targets)
  nearest.forEach(({ e }, i) => {
    const bag = emojiImage(scene, e.x, e.y - 3 * UNIT, '💰', 0.75 * UNIT, 'player')
      .setDepth(30)
      .setAlpha(0)
    scene.tweens.add({
      targets: bag,
      y: e.y,
      alpha: 1,
      duration: 180,
      delay: i * 60,
      ease: 'Quad.easeIn',
      onComplete: () => {
        bag.destroy()
        if (!e.active || scene.over) return
        scene.coinBurst.explode(6, e.x, e.y)
        playSfx('coin')
        spawnCoins(scene, e.x, e.y, SKILL.moneybags.coinsPerHit)
        scene.applyDamage(e, SKILL.moneybags.damage, SKILL.moneybags.knockback * UNIT, scene.center.x, scene.center.y)
      },
    })
  })
}

/** 全场蹦迪：全场敌人（含 Boss）定身跳舞；正在蓄力/冲刺的直接打断；
 * 舞会窗口内新落地的敌人也要跳（materializeEnemy 补标）。
 * 跳舞的逐帧表现（速度清零 + 摇摆 + 粉染色）在 steerEnemies 的舞蹈分支 */
function skillParty(scene: BaseArenaScene): void {
  scene.danceEndsAt = scene.elapsedMs + SKILL.party.danceMs
  for (const e of scene.enemies.getChildren() as ImageObj[]) {
    if (!e.active) continue
    const a = enemyOf(e)
    a.danceUntil = scene.danceEndsAt
    if (a.state === 'windup' || a.state === 'dash') {
      a.state = a.boss ? 'chase' : 'wander'
      e.clearTint()
    }
  }
}

/** 弱点讲义：限时全队增伤（经 stats.damageMul 流入所有武器伤害链） */
function skillScholar(scene: BaseArenaScene): void {
  scene.stats.damageMul = SKILL.scholar.damageMul
  scene.skillBuffUntil = scene.elapsedMs + SKILL.scholar.durationMs
  for (const m of scene.members) {
    if (!m.alive) continue
    m.image.setTint(0x80d8ff)
    scene.time.delayedCall(350, () => {
      if (m.alive) m.image.clearTint()
    })
  }
}

/** 降维打击：全场活跃敌人吃一次大额伤害（随波次强度缩放，Boss 折减）+ 全屏白闪 */
function skillProdigy(scene: BaseArenaScene): void {
  const hpMul = waveAt((scene.run.combatMs + scene.elapsedMs) / 1000).hpMultiplier
  const flash = scene.add
    .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 6000, 6000, 0xffffff, 0.55)
    .setScrollFactor(0)
    .setDepth(200)
  scene.tweens.add({ targets: flash, alpha: 0, duration: 380, onComplete: () => flash.destroy() })
  playSfx('boom')
  // 击杀会边遍历边销毁，先复制快照
  for (const e of [...(scene.enemies.getChildren() as ImageObj[])]) {
    if (!e.active) continue
    const a = enemyOf(e)
    if (a.dormant) continue
    scene.applyDamage(e, prodigyDamage(hpMul, a.boss), 0)
  }
}
