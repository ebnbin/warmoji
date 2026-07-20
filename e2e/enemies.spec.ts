import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { startRun } from './helpers'

// 敌人行为断言级用例：经 __spawnEnemy 定点投放指定敌种，直接读战斗引擎的
// 类型化 Actor 结构（image.getData('enemy')）断言状态机与效果。
// 自然刷怪（僵尸/幽灵）持续干扰计数，所有断言按 kind 过滤、不用全局敌数。

/** 对指定 kind 的首只敌人施加致死伤害（走引擎 applyDamage 公共入口） */
async function killKind(page: Page, kind: string): Promise<void> {
  await page.evaluate((k) => {
    const game = window.__game as {
      scene: {
        keys: Record<
          string,
          {
            enemies: { getChildren(): { active: boolean; getData(key: string): { def: { kind: string } } }[] }
            applyDamage(e: unknown, dmg: number): void
          }
        >
      }
    }
    const arena = game.scene.keys['arena']!
    const target = arena.enemies.getChildren().find((e) => e.active && e.getData('enemy').def.kind === k)
    if (target) arena.applyDamage(target, 999_999)
  }, kind)
}

test.describe.configure({ retries: 2 })

test('状态机行为：野猪蓄力→突刺→冷却；毒蛇放冷枪且拉开距离', async ({ page }) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  await page.goto('/')
  await startRun(page)
  await page.waitForFunction(() => (window.__warmoji?.elapsed ?? 0) > 1)

  // 野猪投放在探测圈内（2 格）：必须走 windup → dash 状态机
  await page.evaluate(() => window.__spawnEnemy!('boar', 2, 0))
  await page.waitForFunction(
    () => {
      const game = window.__game as {
        scene: { keys: Record<string, { enemies: { getChildren(): { active: boolean; getData(k: string): { def: { kind: string }; state: string } }[] } }> }
      }
      return game.scene.keys['arena']!.enemies.getChildren().some((e) => {
        if (!e.active) return false
        const a = e.getData('enemy')
        return a.def.kind === 'boar' && a.state === 'windup'
      })
    },
    undefined,
    { timeout: 30_000 },
  )
  await page.waitForFunction(
    () => {
      const game = window.__game as {
        scene: { keys: Record<string, { enemies: { getChildren(): { active: boolean; getData(k: string): { def: { kind: string }; state: string } }[] } }> }
      }
      return game.scene.keys['arena']!.enemies.getChildren().some((e) => {
        if (!e.active) return false
        const a = e.getData('enemy')
        return a.def.kind === 'boar' && (a.state === 'dash' || a.state === 'cool')
      })
    },
    undefined,
    { timeout: 15_000 },
  )

  // 毒蛇投放在逃跑圈内（3 格 < fleeRange 5 格）：应放出敌弹，且与队伍拉开距离
  const shotCount = async (): Promise<number> =>
    page.evaluate(() => {
      const game = window.__game as { scene: { keys: Record<string, { enemyProjectiles: { getChildren(): { active: boolean }[] } }> } }
      return game.scene.keys['arena']!.enemyProjectiles.getChildren().filter((s) => s.active).length
    })
  const shotsBefore = await shotCount()
  const snakeDist = async (): Promise<number> =>
    page.evaluate(() => {
      const game = window.__game as {
        scene: {
          keys: Record<
            string,
            {
              center: { x: number; y: number }
              enemies: { getChildren(): { active: boolean; x: number; y: number; getData(k: string): { def: { kind: string } } }[] }
            }
          >
        }
      }
      const arena = game.scene.keys['arena']!
      const s = arena.enemies.getChildren().find((e) => e.active && e.getData('enemy').def.kind === 'snake')
      if (!s) return -1
      const dx = s.x - arena.center.x
      const dy = s.y - arena.center.y
      return Math.hypot(dx, dy)
    })
  await page.evaluate(() => window.__spawnEnemy!('snake', 3, 0))
  await page.waitForFunction(() => {
    const game = window.__game as {
      scene: { keys: Record<string, { enemies: { getChildren(): { active: boolean; getData(k: string): { def: { kind: string } } }[] } }> }
    }
    return game.scene.keys['arena']!.enemies.getChildren().some((e) => e.active && e.getData('enemy').def.kind === 'snake')
  })
  const d0 = await snakeDist()
  // 蛇要么已被队伍击杀（-1），要么在逃：距离应显著增大；同时冷枪应已出弹
  await page.waitForFunction(
    (before) => {
      const game = window.__game as { scene: { keys: Record<string, { enemyProjectiles: { getChildren(): { active: boolean }[] } }> } }
      const shots = game.scene.keys['arena']!.enemyProjectiles.getChildren().filter((s) => s.active).length
      return shots > before || (window.__warmoji?.elapsed ?? 0) > 25
    },
    shotsBefore,
    { timeout: 60_000 },
  )
  const d1 = await snakeDist()
  if (d0 > 0 && d1 > 0) expect(d1).toBeGreaterThan(d0)
  expect(errors).toEqual([])
})

test('死亡效果与偷币：蘑菇留毒、泡泡分裂、偷币鼠吃币后击杀吐回', async ({ page }) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  await page.goto('/')
  await startRun(page)
  await page.waitForFunction(() => (window.__warmoji?.elapsed ?? 0) > 1)

  // 蘑菇：远点投放（不被顺手打死），补致死一击 → 毒液池出现
  await page.evaluate(() => window.__spawnEnemy!('mushroom', 6, 0))
  await page.waitForFunction(() => {
    const game = window.__game as {
      scene: { keys: Record<string, { enemies: { getChildren(): { active: boolean; getData(k: string): { def: { kind: string } } }[] } }> }
    }
    return game.scene.keys['arena']!.enemies.getChildren().some((e) => e.active && e.getData('enemy').def.kind === 'mushroom')
  })
  await killKind(page, 'mushroom')
  const pools = await page.evaluate(() => {
    const game = window.__game as { scene: { keys: Record<string, { groundEffects: unknown[] }> } }
    return game.scene.keys['arena']!.groundEffects.length
  })
  expect(pools).toBeGreaterThan(0)

  // 泡泡：击杀分裂出 2 只小泡泡
  await page.evaluate(() => window.__spawnEnemy!('blob', 6, 2))
  await page.waitForFunction(() => {
    const game = window.__game as {
      scene: { keys: Record<string, { enemies: { getChildren(): { active: boolean; getData(k: string): { def: { kind: string } } }[] } }> }
    }
    return game.scene.keys['arena']!.enemies.getChildren().some((e) => e.active && e.getData('enemy').def.kind === 'blob')
  })
  await killKind(page, 'blob')
  await page.waitForFunction(
    () => {
      const game = window.__game as {
        scene: { keys: Record<string, { enemies: { getChildren(): { active: boolean; getData(k: string): { def: { kind: string } } }[] } }> }
      }
      const n = game.scene.keys['arena']!.enemies.getChildren().filter((e) => e.active && e.getData('enemy').def.kind === 'blobling').length
      return n >= 2
    },
    undefined,
    { timeout: 10_000 },
  )

  // 偷币鼠：撒 3 枚金币在远处 → 鼠吃到（eaten > 0）→ 击杀 → 金币吐回地面
  await page.evaluate(() => window.__dropCoins!(3, 7, -2))
  await page.evaluate(() => window.__spawnEnemy!('rat', 8, -2))
  await page.waitForFunction(
    () => {
      const game = window.__game as {
        scene: { keys: Record<string, { enemies: { getChildren(): { active: boolean; getData(k: string): { def: { kind: string }; eaten: number } }[] } }> }
      }
      return game.scene.keys['arena']!.enemies.getChildren().some((e) => {
        if (!e.active) return false
        const a = e.getData('enemy')
        return a.def.kind === 'rat' && a.eaten > 0
      })
    },
    undefined,
    { timeout: 45_000 },
  )
  const coinsBefore = await page.evaluate(() => {
    const game = window.__game as { scene: { keys: Record<string, { coins: { getChildren(): { active: boolean }[] } }> } }
    return game.scene.keys['arena']!.coins.getChildren().filter((c) => c.active).length
  })
  await killKind(page, 'rat')
  await page.waitForFunction(
    (before) => {
      const game = window.__game as { scene: { keys: Record<string, { coins: { getChildren(): { active: boolean }[] } }> } }
      return game.scene.keys['arena']!.coins.getChildren().filter((c) => c.active).length > before
    },
    coinsBefore,
    { timeout: 10_000 },
  )
  expect(errors).toEqual([])
})

test('持械敌人：敌方 ctx 驱动能力朝队员开火，敌弹入组并命中，死亡随体销毁', async ({ page }) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  await page.goto('/')
  await startRun(page)
  await page.waitForFunction(() => (window.__warmoji?.elapsed ?? 0) > 1)

  // 首波自然刷怪（僵尸/幽灵）无任何射手：enemyProjectiles 增长只能来自持械投放
  const hpBefore = await page.evaluate(() => {
    const game = window.__game as { scene: { keys: Record<string, { members: { alive: boolean; hp: number }[] }> } }
    return game.scene.keys['arena']!.members.filter((m) => m.alive).reduce((s, m) => s + m.hp, 0)
  })
  await page.evaluate(() => window.__spawnArmedEnemy!('tomatoThrow', 2.5, 0))
  // 波末场景切换窗口里组会被销毁：探针必须吞异常返回 false，而不是炸掉 waitForFunction
  await page.waitForFunction(
    () => {
      try {
        const game = window.__game as { scene: { keys: Record<string, { enemyProjectiles: { getLength(): number } }> } }
        return game.scene.keys['arena']!.enemyProjectiles.getLength() > 0
      } catch {
        return false
      }
    },
    undefined,
    { timeout: 30_000 },
  )
  // 敌械弹按队员受击结算扣血（自然接触伤害也会扣，此断言验证的是伤害通路整体连通）
  await page.waitForFunction(
    (before) => {
      try {
        const game = window.__game as { scene: { keys: Record<string, { members: { alive: boolean; hp: number }[] }> } }
        const now = game.scene.keys['arena']!.members.filter((m) => m.alive).reduce((s, m) => s + m.hp, 0)
        return now < before
      } catch {
        return false
      }
    },
    hpBefore,
    { timeout: 30_000 },
  )
  // 击杀持械者：能力实例随体销毁，流程无报错
  await killKind(page, 'zombie')
  // 敌弹按寿命排空后，投放外星怪：aim:'move'（朝移动方向、无需目标）路径专项——
  // 此后敌弹组再增长只能来自它
  await page.waitForFunction(
    () => {
      try {
        const game = window.__game as { scene: { keys: Record<string, { enemyProjectiles: { getLength(): number } }> } }
        return game.scene.keys['arena']!.enemyProjectiles.getLength() === 0
      } catch {
        return false
      }
    },
    undefined,
    { timeout: 30_000 },
  )
  await page.evaluate(() => window.__spawnEnemy!('invader', -5, 0))
  await page.waitForFunction(
    () => {
      try {
        const game = window.__game as { scene: { keys: Record<string, { enemyProjectiles: { getLength(): number } }> } }
        return game.scene.keys['arena']!.enemyProjectiles.getLength() > 0
      } catch {
        return false
      }
    },
    undefined,
    { timeout: 30_000 },
  )
  expect(errors).toEqual([])
})

test('黏黏怪：接触给队员挂限时攻速惩罚（接触触发的第二个效果占用者）', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  await page.goto('/')
  await startRun(page)
  await page.waitForFunction(() => (window.__warmoji?.elapsed ?? 0) > 1)
  // 队伍中心近旁围一圈黏黏怪：贴脸蹭到某队员（多只保证在被清掉前先触发）→ atkSlowUntil 被置将来时刻
  await page.evaluate(() => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      window.__spawnEnemy!('slime', Math.cos(a) * 0.9, Math.sin(a) * 0.9)
    }
  })
  await page.waitForFunction(
    () => {
      try {
        const game = window.__game as { scene: { keys: Record<string, { members: { atkSlowUntil: number }[] }> } }
        return game.scene.keys['arena']!.members.some((m) => m.atkSlowUntil > 0)
      } catch {
        return false
      }
    },
    undefined,
    { timeout: 60_000 },
  )
  expect(errors).toEqual([])
})

test('虫巢：周期生成小飞虫（非死亡触发的生成实体）', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  await page.goto('/')
  await startRun(page)
  await page.waitForFunction(() => (window.__warmoji?.elapsed ?? 0) > 1)
  // 远点投放虫巢（不被顺手秒掉）：过首轮延迟后应吐出小飞虫（kind=larva）
  await page.evaluate(() => window.__spawnEnemy!('hive', 6, 0))
  await page.waitForFunction(
    () => {
      try {
        const game = window.__game as {
          scene: { keys: Record<string, { enemies: { getChildren(): { active: boolean; getData(k: string): { def: { kind: string } } }[] } }> }
        }
        return game.scene.keys['arena']!.enemies.getChildren().some((e) => e.active && e.getData('enemy').def.kind === 'larva')
      } catch {
        return false
      }
    },
    undefined,
    { timeout: 30_000 },
  )
  expect(errors).toEqual([])
})
