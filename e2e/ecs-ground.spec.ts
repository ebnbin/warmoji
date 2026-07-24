import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P3（地面效果）：蘑菇亡语在死亡点留一块毒液区（onDeath ground → 地面效果入场）。

type EcsDbg = { ready: boolean; enemies: number }

test('ECS 地面效果：蘑菇亡语留毒液区', async ({ page }) => {
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

  const zones0 = await page.evaluate(() => window.__ecsGroundZones!())

  // 蘑菇(hp 50)：击破触发 onDeath ground → 死亡点生成毒液区
  await page.evaluate(() => window.__ecsSpawnEnemy!('mushroom', 4, 0))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies === 1)
  await page.evaluate(() => window.__ecsHurtEnemy!(200))

  // 亡语重放（次帧）→ 地面效果区增加
  await page.waitForFunction((z0) => window.__ecsGroundZones!() > z0, zones0, { timeout: 6000 })

  expect(errors).toEqual([])
})
