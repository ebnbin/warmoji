import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P4（Boss）：本图 Boss 作普通 materialize 管线的 boss 标记实体（金边/HUD），
// 复用全部战斗系统；击败置 bossDown（正常模式据此走通关结算）。

type EcsDbg = { ready: boolean; enemies: number }

test('ECS Boss：树妖登场、受击、击败置通关标记', async ({ page }) => {
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

  // 投放森林 Boss 树妖(hp 6500)
  await page.evaluate(() => window.__ecsSpawnEnemy!('treant', 4, 0))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies >= 1)
  expect(await page.evaluate(() => window.__ecsBossDown!())).toBe(false)
  await page.screenshot({ path: 'test-results/ecs-boss.png' })

  // 一击致死(> 6500)→ 击败置通关标记
  await page.evaluate(() => window.__ecsHurtEnemy!(7000))
  await page.waitForFunction(() => window.__ecsBossDown!() === true, undefined, { timeout: 4000 })

  expect(errors).toEqual([])
})
