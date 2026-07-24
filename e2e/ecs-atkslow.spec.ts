import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P3（onContact·黏滞）：黏黏怪蹭到队员施加攻速惩罚（attackSlow 接触积木）。

type EcsDbg = { ready: boolean; enemies: number }

test('ECS 黏滞：黏黏怪接触施加攻速惩罚', async ({ page }) => {
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

  // 贴身投放黏黏怪：追上队员接触即施加攻速惩罚
  await page.evaluate(() => window.__ecsSpawnEnemy!('slime', 1, 0))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies >= 1)

  await page.waitForFunction(() => window.__ecsMemberAtkSlowed!() === true, undefined, { timeout: 10_000 })

  expect(errors).toEqual([])
})
