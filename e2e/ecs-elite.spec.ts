import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P4（精英）：精英怪金边 + 体质放大（体型/血/伤/速）。此处验证体型放大（ELITE.sizeMul）。

type EcsDbg = { ready: boolean; enemies: number }

test('ECS 精英：金边精英体型大于素怪', async ({ page }) => {
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

  // 素僵尸尺寸
  await page.evaluate(() => window.__ecsSpawnEnemy!('zombie', 2, 0, false))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies >= 1)
  const base = await page.evaluate(() => window.__ecsNearestEnemySize!())
  await page.evaluate(() => window.__ecsHurtEnemy!(9999)) // 清掉，便于测精英
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies === 0)

  // 精英僵尸尺寸：应显著更大（ELITE.sizeMul > 1）
  await page.evaluate(() => window.__ecsSpawnEnemy!('zombie', 2, 0, true))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies >= 1)
  const elite = await page.evaluate(() => window.__ecsNearestEnemySize!())

  expect(elite).toBeGreaterThan(base)

  expect(errors).toEqual([])
})
