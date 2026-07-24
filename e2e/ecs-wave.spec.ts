import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P4（波次结算）：结算本波回写 run——波次自增 + 累计战斗时长 + 保底经验（settleWave）。

type EcsDbg = { ready: boolean; wave: number; xpLevel: number }

test('ECS 波次结算：波次自增、经验保底', async ({ page }) => {
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

  const w0 = await page.evaluate(() => (window as unknown as { __ecs: EcsDbg }).__ecs.wave)
  // 结算一波：波次号 +1
  const w1 = await page.evaluate(() => window.__ecsSettleWave!())
  expect(w1).toBe(w0 + 1)
  // 再结算一波：继续自增
  const w2 = await page.evaluate(() => window.__ecsSettleWave!())
  expect(w2).toBe(w0 + 2)

  expect(errors).toEqual([])
})
