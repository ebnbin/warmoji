import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P4（locomotion·coinThief）：偷币鼠直奔金币、逐枚吞掉（偷走不入账）。

type EcsDbg = { ready: boolean; enemies: number }

test('ECS 偷币鼠：直奔金币逐枚吞', async ({ page }) => {
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

  // 远处(9 格，超出磁吸)落一堆金币 + 在币堆里投放偷币鼠：鼠直奔并逐枚吞
  await page.evaluate(() => window.__ecsSpawnCoinsAt!(9, 0, 4))
  await page.evaluate(() => window.__ecsSpawnEnemy!('rat', 9, 0))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies >= 1)

  // 吞币计数增长（隔离于自然刷怪：只有偷币鼠会吞）
  await page.waitForFunction(() => window.__ecsMaxEaten!() >= 1, undefined, { timeout: 12_000 })

  expect(errors).toEqual([])
})
