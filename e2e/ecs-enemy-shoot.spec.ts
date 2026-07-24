import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P3e（敌人持械）：炮龟(chase + projectile 能力)蓄够首发延迟后朝队员抛硬壳弹，
// 敌弹入场（eprojectiles>0）且队员被削（接触/中弹使 memberHp 下降）。

type EcsDbg = { ready: boolean; enemies: number; eprojectiles: number; memberHp: number[] }

test('ECS 敌人持械：炮龟开火（敌弹入场）+ 队员受创', async ({ page }) => {
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
  await page.evaluate(() => window.__ecsLabRoster!(['troll'])) // 近战单人：血厚炮龟活得够久走完首发
  await enterMap(page)
  await startTestBattle(page, 'forest')
  await page.waitForFunction(() => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true, undefined, {
    timeout: 20_000,
  })

  await page.evaluate(() => window.__ecsSpawnEnemy!('turtle', 3, 0))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.enemies === 1)

  // 首发延迟(1500ms 游戏时)后开火：敌弹入场
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.eprojectiles >= 1, undefined, {
    timeout: 15_000,
  })

  // 队员被削（近身接触 + 中弹）
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.memberHp[0]! < 100, undefined, {
    timeout: 15_000,
  })

  expect(errors).toEqual([])
})
