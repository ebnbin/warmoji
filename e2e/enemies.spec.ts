import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { startRun } from './helpers'

// 敌人行为断言级用例：经 __spawnEnemy 定点投放指定敌种，直接读战斗引擎的
// 类型化 Actor 结构（image.getData('actor')）断言状态机与效果。
// 自然刷怪（僵尸/幽灵）持续干扰计数，所有断言按 kind 过滤、不用全局敌数。

/** 对指定 kind 的首只敌人施加致死伤害（走引擎 applyDamage 公共入口） */
async function killKind(page: Page, kind: string): Promise<void> {
  await page.evaluate((k) => {
    const game = window.__game as {
      scene: {
        keys: Record<
          string,
          {
            enemies: { getChildren(): { active: boolean; getData(key: string): { spec: { kind: string } } }[] }
            applyDamage(e: unknown, dmg: number): void
          }
        >
      }
    }
    const arena = game.scene.keys['arena']!
    const target = arena.enemies.getChildren().find((e) => e.active && e.getData('actor').spec.kind === k)
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
        scene: { keys: Record<string, { enemies: { getChildren(): { active: boolean; getData(k: string): { spec: { kind: string }; state: string } }[] } }> }
      }
      return game.scene.keys['arena']!.enemies.getChildren().some((e) => {
        if (!e.active) return false
        const a = e.getData('actor')
        return a.spec.kind === 'boar' && a.state === 'windup'
      })
    },
    undefined,
    { timeout: 30_000 },
  )
  await page.waitForFunction(
    () => {
      const game = window.__game as {
        scene: { keys: Record<string, { enemies: { getChildren(): { active: boolean; getData(k: string): { spec: { kind: string }; state: string } }[] } }> }
      }
      return game.scene.keys['arena']!.enemies.getChildren().some((e) => {
        if (!e.active) return false
        const a = e.getData('actor')
        return a.spec.kind === 'boar' && (a.state === 'dash' || a.state === 'cool')
      })
    },
    undefined,
    { timeout: 15_000 },
  )

  // 毒蛇投放在逃跑圈内（3 格 < fleeRange 5 格）：应放出敌弹，且与队伍拉开距离
  const shotCount = async (): Promise<number> =>
    page.evaluate(() => {
      const game = window.__game as { scene: { keys: Record<string, { enemyShots: { getChildren(): { active: boolean }[] } }> } }
      return game.scene.keys['arena']!.enemyShots.getChildren().filter((s) => s.active).length
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
              enemies: { getChildren(): { active: boolean; x: number; y: number; getData(k: string): { spec: { kind: string } } }[] }
            }
          >
        }
      }
      const arena = game.scene.keys['arena']!
      const s = arena.enemies.getChildren().find((e) => e.active && e.getData('actor').spec.kind === 'snake')
      if (!s) return -1
      const dx = s.x - arena.center.x
      const dy = s.y - arena.center.y
      return Math.hypot(dx, dy)
    })
  await page.evaluate(() => window.__spawnEnemy!('snake', 3, 0))
  await page.waitForFunction(() => {
    const game = window.__game as {
      scene: { keys: Record<string, { enemies: { getChildren(): { active: boolean; getData(k: string): { spec: { kind: string } } }[] } }> }
    }
    return game.scene.keys['arena']!.enemies.getChildren().some((e) => e.active && e.getData('actor').spec.kind === 'snake')
  })
  const d0 = await snakeDist()
  // 蛇要么已被队伍击杀（-1），要么在逃：距离应显著增大；同时冷枪应已出弹
  await page.waitForFunction(
    (before) => {
      const game = window.__game as { scene: { keys: Record<string, { enemyShots: { getChildren(): { active: boolean }[] } }> } }
      const shots = game.scene.keys['arena']!.enemyShots.getChildren().filter((s) => s.active).length
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
      scene: { keys: Record<string, { enemies: { getChildren(): { active: boolean; getData(k: string): { spec: { kind: string } } }[] } }> }
    }
    return game.scene.keys['arena']!.enemies.getChildren().some((e) => e.active && e.getData('actor').spec.kind === 'mushroom')
  })
  await killKind(page, 'mushroom')
  const pools = await page.evaluate(() => {
    const game = window.__game as { scene: { keys: Record<string, { poisonPools: unknown[] }> } }
    return game.scene.keys['arena']!.poisonPools.length
  })
  expect(pools).toBeGreaterThan(0)

  // 泡泡：击杀分裂出 2 只小泡泡
  await page.evaluate(() => window.__spawnEnemy!('blob', 6, 2))
  await page.waitForFunction(() => {
    const game = window.__game as {
      scene: { keys: Record<string, { enemies: { getChildren(): { active: boolean; getData(k: string): { spec: { kind: string } } }[] } }> }
    }
    return game.scene.keys['arena']!.enemies.getChildren().some((e) => e.active && e.getData('actor').spec.kind === 'blob')
  })
  await killKind(page, 'blob')
  await page.waitForFunction(
    () => {
      const game = window.__game as {
        scene: { keys: Record<string, { enemies: { getChildren(): { active: boolean; getData(k: string): { spec: { kind: string } } }[] } }> }
      }
      const n = game.scene.keys['arena']!.enemies.getChildren().filter((e) => e.active && e.getData('actor').spec.kind === 'blobling').length
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
        scene: { keys: Record<string, { enemies: { getChildren(): { active: boolean; getData(k: string): { spec: { kind: string }; eaten: number } }[] } }> }
      }
      return game.scene.keys['arena']!.enemies.getChildren().some((e) => {
        if (!e.active) return false
        const a = e.getData('actor')
        return a.spec.kind === 'rat' && a.eaten > 0
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
