import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P3（locomotion·dash）：野猪探测触发状态机——蓄力(windup=2) → 冲刺(dash=3)。

type EcsDbg = { ready: boolean; enemies: number }

test('ECS dash：野猪蓄力→冲刺状态机', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.stack ?? String(e)))

  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'warmoji.settings.v1',
        JSON.stringify({ damageNumbers: true, hitShake: true, sound: false, bgm: false, showSkinTone: false, ecs: true }),
      )
    } catch {
      /* ignore */
    }
  })
  await page.goto('/')
  await page.evaluate(() => window.__ecsLabRoster!(['troll'], [], false)) // 近战单人，野猪够久活着走完蓄力→冲刺；关无敌以观察真实扣血
  await enterMap(page)
  await startTestBattle(page, 'forest')
  await page.waitForFunction(() => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true, undefined, {
    timeout: 20_000,
  })

  // 在探测圈内(3 格 < range 4)投放野猪：应立即蓄力
  await page.evaluate(() => window.__ecsSpawnEnemy!('boar', 3, 0))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies === 1)

  // 蓄力态
  await page.waitForFunction(() => window.__ecsNearestEnemyState!() === 2, undefined, { timeout: 6000 })
  // 冲刺态
  await page.waitForFunction(() => window.__ecsNearestEnemyState!() === 3, undefined, { timeout: 6000 })

  expect(errors).toEqual([])
})
