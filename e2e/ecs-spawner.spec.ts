import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P3（虫巢 spawner + baseOrbit）：虫巢周期生成小飞虫（护巢子敌，带巢引用）。
// broods 只数带巢引用的子敌，与自然刷怪的敌人（恒无巢）隔离，稳测虫巢机制本身。

type EcsDbg = { ready: boolean; enemies: number; broods: number }

test('ECS 虫巢：周期生成护巢子敌', async ({ page }) => {
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
  await page.evaluate(() => window.__ecsLabRoster!(['troll']))
  await enterMap(page)
  await startTestBattle(page, 'forest')
  await page.waitForFunction(() => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true, undefined, {
    timeout: 20_000,
  })

  // 远处投放虫巢（8 格）：不受自然刷怪干扰地观测其护巢子敌
  await page.evaluate(() => window.__ecsSpawnEnemy!('hive', 8, 0))

  // 首批生成（firstDelayMs 2000ms 游戏时 + count 2）：出现带巢引用的护巢子敌
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.broods >= 2, undefined, {
    timeout: 25_000,
  })

  expect(errors).toEqual([])
})
