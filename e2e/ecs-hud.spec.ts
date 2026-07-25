import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P4（HUD）：ECS 战斗场景复用旧的 UIScene——经 HudHost 契约供数（顶栏读数/技能/性能面板），
// UIScene 自探测到 ecsArena 即挂上。验证 HUD 起来了、读数跟着战斗走、无控制台错误。

type EcsDbg = { ready: boolean; enemies: number; kills: number; coins: number }

test('ECS HUD：UIScene 挂上 ECS 场景，顶栏读数跟随战斗', async ({ page }) => {
  test.setTimeout(120_000)
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

  // UIScene 已跟随 ECS 场景启动
  const uiUp = await page.evaluate(() => {
    type G = { scene: { isActive(k: string): boolean } }
    return (window.__game as unknown as G).scene.isActive('ui')
  })
  expect(uiUp).toBe(true)

  // HudHost 供数可用且自洽
  const snap = await page.evaluate(() => {
    type Host = {
      hudSnapshot(): { level: number; wave: number; coins: number; kills: number; bossMaxHp: number }
      skillSnapshot(): { name: string; cdMs: number }
      perfSnapshot(): { enemies: number; objects: number }
    }
    type G = { scene: { getScene(k: string): Host } }
    const s = (window.__game as unknown as G).scene.getScene('ecsArena')
    return { hud: s.hudSnapshot(), skill: s.skillSnapshot(), perf: s.perfSnapshot() }
  })
  expect(snap.hud.level).toBeGreaterThanOrEqual(1)
  expect(snap.hud.wave).toBeGreaterThanOrEqual(1)
  expect(snap.hud.bossMaxHp).toBeGreaterThan(0)
  expect(snap.skill.name.length).toBeGreaterThan(0)
  expect(snap.skill.cdMs).toBeGreaterThan(0)

  // 击杀 → HUD 的 kills 跟着涨（读数确实接在战斗上，不是常量）
  await page.evaluate(() => window.__ecsSpawnEnemy!('zombie', 3, 0))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies >= 1)
  await page.evaluate(() => window.__ecsHurtEnemy!(9999))
  await page.waitForFunction(
    () => {
      type Host = { hudSnapshot(): { kills: number } }
      type G = { scene: { getScene(k: string): Host } }
      return (window.__game as unknown as G).scene.getScene('ecsArena').hudSnapshot().kills >= 1
    },
    undefined,
    { timeout: 8000 },
  )

  await page.screenshot({ path: 'test-results/ecs-hud.png' })
  expect(errors).toEqual([])
})
