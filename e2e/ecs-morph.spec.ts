import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P3（状态·魔尘变形）：变羊——敌人被变形为无害绵羊替身（缴械/无害/缓速），到期复原。

type EcsDbg = { ready: boolean; enemies: number }

test('ECS 魔尘：敌人变形（缴械无害）后到期复原', async ({ page }) => {
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

  await page.evaluate(() => window.__ecsSpawnEnemy!('boar', 3, 0))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies === 1)

  // 变形 1.2s（游戏时）：立即进入变形态
  await page.evaluate(() => window.__ecsMorphEnemy!(1200))
  expect(await page.evaluate(() => window.__ecsNearestEnemyMorphed!())).toBe(true)
  // 变形期打断状态机：不在蓄力/冲刺（state 归 0）
  expect(await page.evaluate(() => window.__ecsNearestEnemyState!())).toBe(0)

  // 到期复原（1.2s 游戏时 ≈ 墙钟 3-4s，headless 节流）
  await page.waitForFunction(() => window.__ecsNearestEnemyMorphed!() === false, undefined, { timeout: 12_000 })

  expect(errors).toEqual([])
})
