import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P3e：波次刷怪节奏——森林自动刷怪，队员迎战，敌人来了又被清（自运行战斗）。

type EcsDbg = { ready: boolean; enemies: number; kills: number }

test('ECS 刷怪：森林自动刷怪，队员迎战并清怪', async ({ page }) => {
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
  await page.evaluate(() => window.__ecsLabRoster!(['juggler', 'unicorn', 'troll', 'cowboy']))
  await enterMap(page)
  await startTestBattle(page, 'forest')
  await page.waitForFunction(() => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true, undefined, {
    timeout: 20_000,
  })

  // 自动刷怪：无需手动投放，敌人陆续登场
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies > 0, undefined, {
    timeout: 25_000,
  })
  await page.screenshot({ path: 'test-results/ecs-p3-spawn.png' })

  // 队员迎战并清怪：击杀累计
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.kills > 0, undefined, {
    timeout: 25_000,
  })

  expect(errors).toEqual([])
})
