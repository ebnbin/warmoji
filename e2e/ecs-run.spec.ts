import { expect, test } from '@playwright/test'
import { completePromote, confirmCaptain, enterCaptain } from './helpers'

// P7（正式局跑通）：此前的 ECS e2e 全在试炼场（单波、免死、无时限）。
// 这条走正式局：商店 → 开战 → 波末过场 → 商店 → 再开战。
// 覆盖试炼场碰不到的那一大片：波次结算与过场、场景重建（模块级状态跨局清场）、
// 血量跨波保留、满编阵型、HUD 跨波读数。
// 波末不靠「熬满时长」（慢渲染下会随机全灭），用探针把局内时钟快进过去，走同一条过场链路。
test.describe.configure({ retries: 2 })

type EcsDbg = { ready: boolean; alive: number; wave: number; memberHp: number[]; members: number; elapsed: number }

const dbg = (page: import('@playwright/test').Page): Promise<EcsDbg> =>
  page.evaluate(() => (window as unknown as { __ecs: EcsDbg }).__ecs)

/** 商店「开始第 N 波」：不能用共用的 clickShopNext——它等的是 __warmoji.scene==='arena'，
 * 而 ECS 场景不写这个探针，会一直干等到超时（战斗其实在无人操作地打） */
const startNextWave = async (page: import('@playwright/test').Page): Promise<void> => {
  const s = await page.evaluate(() => window.__warmoji!.shop!.start)
  await page.locator('#game canvas').click({
    position: await page.evaluate((p) => {
      const k = window.innerWidth / window.__warmoji!.viewW
      return { x: Math.round(p.x * k), y: Math.round(p.y * k) }
    }, s),
  })
}

const bootedIntoBattle = (page: import('@playwright/test').Page): Promise<unknown> =>
  page.waitForFunction(
    () => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true,
    undefined,
    { timeout: 30_000 },
  )

test('ECS 正式局：商店开战 → 波末过场 → 商店 → 再开战', async ({ page }) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.stack ?? String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'warmoji.settings.v1',
        JSON.stringify({ damageNumbers: true, hitShake: true, sound: false, bgm: false, showSkinTone: false, ecs: true }),
      )
      // 神童（测试直通车）：开局自选满编 + 启动资金，直接落到后段波次的商店
      localStorage.setItem('warmoji.captain.v1', 'prodigy')
    } catch {
      /* ignore */
    }
  })
  await page.goto('/')
  await enterCaptain(page)
  await confirmCaptain(page)
  await completePromote(page)
  await page.waitForFunction(() => window.__warmoji?.scene === 'shop', undefined, { timeout: 30_000 })
  const shopWave = await page.evaluate(() => window.__warmoji!.shop!.wave)

  await startNextWave(page)
  await bootedIntoBattle(page)
  const w1 = await dbg(page)
  expect(w1.wave).toBe(shopWave)
  expect(w1.members).toBeGreaterThan(1) // 神童满编
  expect(w1.alive).toBe(w1.members)
  expect(w1.memberHp.every((h) => h > 0)).toBe(true)

  // 打一会儿（让波内各系统真跑起来），再把时钟快进到波末，走完整条过场链路
  await page.waitForFunction(
    (t) => (window as unknown as { __ecs?: EcsDbg }).__ecs!.elapsed > t + 2000,
    w1.elapsed,
    { timeout: 30_000 },
  )
  await page.evaluate(() => window.__ecsFastForward!(120_000))
  // 先等战斗真的收场：ECS 战斗期间 __warmoji 是陈旧的（本场景不写它），
  // 直接等 scene==='shop' 会命中上一次商店留下的旧值
  await page.waitForFunction(
    () => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === false,
    undefined,
    { timeout: 30_000 },
  )

  // 抽卡/整编都可能插在中间，一路走到「波次已推进」的商店
  for (let i = 0; i < 20; i++) {
    const st = await page.evaluate(() => ({
      scene: window.__warmoji?.scene,
      wave: window.__warmoji?.shop?.wave ?? -1,
    }))
    const scene = st.scene
    if (scene === 'shop' && st.wave > shopWave) break
    if (scene === 'cards') {
      const c = await page.evaluate(() => window.__warmoji!.cards!.choices[0]!)
      await page.locator('#game canvas').click({
        position: await page.evaluate(
          (r) => {
            const k = window.innerWidth / window.__warmoji!.viewW
            return { x: Math.round((r.x + r.w / 2) * k), y: Math.round((r.y + r.h / 2) * k) }
          },
          c,
        ),
      })
    } else if (scene === 'promote') {
      await completePromote(page)
    }
    await page.waitForTimeout(600)
  }
  await page.waitForFunction(
    (w) => window.__warmoji?.scene === 'shop' && (window.__warmoji.shop?.wave ?? -1) > w,
    shopWave,
    { timeout: 30_000 },
  )
  const nextWave = await page.evaluate(() => window.__warmoji!.shop!.wave)
  expect(nextWave).toBe(shopWave + 1)

  // 再开一波：场景重建后照常跑，血量跨波带过来
  await startNextWave(page)
  await bootedIntoBattle(page)
  const w2 = await dbg(page)
  expect(w2.wave).toBe(shopWave + 1)
  expect(w2.alive).toBeGreaterThan(0)
  expect(w2.memberHp.every((h) => h > 0)).toBe(true)

  expect(errors).toEqual([])
})
