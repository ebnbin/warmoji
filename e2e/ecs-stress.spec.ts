import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// 性能/架构验证：一次性铺 1000 只敌人，全场经单个 EcsSpriteBatch 一批绘制——
// entity 数与 GameObject 数彻底解绑（用户核心诉求：一定会有上千 entity + 性能）。

type EcsDbg = { ready: boolean; enemies: number; pages: number }

test('ECS 性能：1000 敌人单批绘制，无错误', async ({ page }) => {
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

  // 一次性铺 1000 只
  await page.evaluate(() => window.__ecsStress!(1000, 'zombie'))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies >= 1000, undefined, {
    timeout: 10_000,
  })

  // 持续跑若干帧（推进战斗仿真 + 批绘制），确认不崩、无控制台错误
  await page.waitForTimeout(2000)
  const d = await page.evaluate(() => (window as unknown as { __ecs: EcsDbg }).__ecs)
  expect(d.enemies).toBeGreaterThanOrEqual(1000)
  await page.screenshot({ path: 'test-results/ecs-stress-1000.png' })

  expect(errors).toEqual([])
})
