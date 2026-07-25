import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P7（A/B 对拍）：同一套试炼场配置（同阵容/同勾选敌人/同密度难度/同图）下，
// 新旧两套战斗实现在**同样的局内时长**里产出的击杀数应当同量级。
// 这条不追求逐帧一致（两侧 rng 种子来源不同），而是守住「没有系统性偏差」——
// 任何一侧的 DPS、刷怪节奏、命中判定整体走样（快一倍/慢一半），这里都会翻车。

type Probe = { kills: number; elapsed: number }

/** 跑一局，等局内时钟推进到 targetMs，回报击杀数 */
const runOnce = async (page: import('@playwright/test').Page, ecs: boolean, targetMs: number): Promise<Probe> => {
  await page.addInitScript(
    (on) => {
      try {
        localStorage.setItem(
          'warmoji.settings.v1',
          JSON.stringify({ damageNumbers: false, hitShake: false, sound: false, bgm: false, showSkinTone: false, ecs: on }),
        )
      } catch {
        /* ignore */
      }
    },
    ecs,
  )
  await page.goto('/')
  // 同阵容 + 同勾选敌人；密度/难度/等级/无敌一律用试炼场缺省（两侧同源）
  await page.evaluate(() => window.__ecsLabRoster!(['juggler', 'unicorn', 'mage', 'snowman'], ['zombie']))
  await enterMap(page)
  await startTestBattle(page, 'forest')
  await page.waitForFunction(
    () =>
      (window as unknown as { __ecs?: { ready: boolean } }).__ecs?.ready === true ||
      window.__warmoji?.scene === 'arena',
    undefined,
    { timeout: 20_000 },
  )
  // 两侧探针的时间单位不同：__ecs.elapsed 是毫秒，__warmoji.elapsed 是秒
  await page.waitForFunction(
    (t) => {
      const e = (window as unknown as { __ecs?: Probe }).__ecs
      return (e ? e.elapsed : (window.__warmoji?.elapsed ?? 0) * 1000) >= t
    },
    targetMs,
    { timeout: 180_000 },
  )
  return page.evaluate(() => {
    const e = (window as unknown as { __ecs?: Probe }).__ecs
    return e
      ? { kills: e.kills, elapsed: e.elapsed }
      : { kills: window.__warmoji!.kills, elapsed: window.__warmoji!.elapsed * 1000 }
  })
}

test('ECS A/B 对拍：同配置同局内时长下，新旧两侧击杀数同量级', async ({ page }) => {
  test.setTimeout(300_000)
  const WINDOW_MS = 30_000
  const old = await runOnce(page, false, WINDOW_MS)
  const ecs = await runOnce(page, true, WINDOW_MS)

  // 两侧都真的在打（否则比值无意义）
  console.log(`AB old=${JSON.stringify(old)} ecs=${JSON.stringify(ecs)}`)
  expect(old.kills).toBeGreaterThan(1)
  expect(ecs.kills).toBeGreaterThan(1)
  // 没有系统性偏差：击杀数比值落在同量级区间内
  const ratio = ecs.kills / old.kills
  expect(ratio, `old=${old.kills} ecs=${ecs.kills}`).toBeGreaterThan(0.55)
  expect(ratio, `old=${old.kills} ecs=${ecs.kills}`).toBeLessThan(1.8)
})
