import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P3（亡语·分裂）：泡泡被击破 → 原地分裂成 2 只小泡泡（split onDeath）。

type EcsDbg = { ready: boolean; enemies: number }

test('ECS 亡语：泡泡击破分裂成两只小泡泡', async ({ page }) => {
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
  await page.evaluate(() => window.__ecsLabRoster!(['troll'])) // 近战单人：不会远程秒掉分裂出的小泡泡
  await enterMap(page)
  await startTestBattle(page, 'forest')
  await page.waitForFunction(() => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true, undefined, {
    timeout: 20_000,
  })

  // 远处投放泡泡(hp 70)，一击致死(80 伤)触发分裂
  await page.evaluate(() => window.__ecsSpawnEnemy!('blob', 7, 0))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies === 1)
  await page.evaluate(() => window.__ecsHurtEnemy!(80))

  // 分裂：泡泡消失 → 2 只小泡泡入场
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies === 2, undefined, {
    timeout: 6000,
  })

  expect(errors).toEqual([])
})
