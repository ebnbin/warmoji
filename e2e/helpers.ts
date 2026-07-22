import type { Page } from '@playwright/test'

/** 逻辑坐标 → canvas CSS 坐标（canvas CSS 尺寸 = 窗口尺寸） */
async function cssPoint(page: Page, logical: { x: number; y: number }): Promise<{ x: number; y: number }> {
  return page.evaluate(({ x, y }) => {
    const k = window.innerWidth / window.__warmoji!.viewW
    return { x: Math.round(x * k), y: Math.round(y * k) }
  }, logical)
}

/** 标题页点「组建队伍」→ 地图选择页 */
export async function enterMap(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__warmoji?.scene === 'menu' && !!window.__warmoji.menu)
  const s = await page.evaluate(() => window.__warmoji!.menu!.start)
  await page.locator('#game canvas').click({ position: await cssPoint(page, { x: s.x, y: s.y }) })
  await page.waitForFunction(() => window.__warmoji?.scene === 'map' && !!window.__warmoji.map)
}

/** 地图页点击某张地图（单选） */
export async function clickMap(page: Page, id: string): Promise<void> {
  const r = await page.evaluate(
    (mid) => window.__warmoji!.map!.items.find((x) => x.id === mid)!,
    id,
  )
  await page
    .locator('#game canvas')
    .click({ position: await cssPoint(page, { x: r.x + r.w / 2, y: r.y + r.h / 2 }) })
  await page.waitForFunction((mid) => window.__warmoji?.map?.selected === mid, id)
}

/** 地图页确认 → 队长选择页 */
export async function confirmMap(page: Page): Promise<void> {
  const s = await page.evaluate(() => window.__warmoji!.map!.start)
  await page.locator('#game canvas').click({ position: await cssPoint(page, { x: s.x, y: s.y }) })
  await page.waitForFunction(
    () => window.__warmoji?.scene === 'captain' && !!window.__warmoji.captain,
  )
}

/** 地图页 → 勾选「测试模式」→ 确认，用该图直接进入沙盒竞技场（跳过队长/组队） */
export async function enterLab(page: Page, mapId = 'forest'): Promise<void> {
  await clickMap(page, mapId)
  // 勾上测试模式勾选框
  const chk = await page.evaluate(() => window.__warmoji!.map!.test)
  await page.locator('#game canvas').click({ position: await cssPoint(page, { x: chk.x, y: chk.y }) })
  await page.waitForFunction(() => window.__warmoji?.map?.test.on === true)
  // 确认 → 直接进竞技场
  const s = await page.evaluate(() => window.__warmoji!.map!.start)
  await page.locator('#game canvas').click({ position: await cssPoint(page, { x: s.x, y: s.y }) })
  await page.waitForFunction(() => window.__warmoji?.scene === 'arena')
}

/** 标题页 → 地图确认（沿用记忆选择）→ 队长选择页 */
export async function enterCaptain(page: Page): Promise<void> {
  await enterMap(page)
  await confirmMap(page)
}

/** 队长页点击某个队长行（单选） */
export async function clickCaptain(page: Page, id: string): Promise<void> {
  const r = await page.evaluate(
    (cid) => window.__warmoji!.captain!.items.find((x) => x.id === cid)!,
    id,
  )
  await page
    .locator('#game canvas')
    .click({ position: await cssPoint(page, { x: r.x + r.w / 2, y: r.y + r.h / 2 }) })
  await page.waitForFunction((cid) => window.__warmoji?.captain?.selected === cid, id)
}

/** 队长页确认 → 整编页（开局组队 = 第一次强制整编） */
export async function confirmCaptain(page: Page): Promise<void> {
  const s = await page.evaluate(() => window.__warmoji!.captain!.start)
  await page.locator('#game canvas').click({ position: await cssPoint(page, { x: s.x, y: s.y }) })
  await page.waitForFunction(
    () => window.__warmoji?.scene === 'promote' && !!window.__warmoji.promote,
  )
}

/** 把整编页走完：招募环节把空位点满（依次取未选的候选）后整批确认；
 * 队形环节确认即出发。循环直到离开整编页 */
export async function completePromote(page: Page): Promise<void> {
  for (let step = 0; step < 40; step++) {
    const st = await page.evaluate(() => ({
      scene: window.__warmoji!.scene,
      mode: window.__warmoji!.promote?.mode,
      due: window.__warmoji!.promote?.due ?? 0,
      picked: window.__warmoji!.promote?.picked ?? [],
      items: (window.__warmoji!.promote?.items ?? []).map((x) => ({ id: x.id, state: x.state })),
    }))
    if (st.scene !== 'promote') return
    if (st.mode === 'formation') {
      // 队形环节确认即离开整编页
      await clickPromoteConfirm(page)
      await page.waitForFunction(() => window.__warmoji?.scene !== 'promote', undefined, {
        timeout: 15_000,
      })
      return
    }
    if (st.picked.length < st.due) {
      // 命定卡池三态：只点可选（open）的牌
      const next = st.items.find(
        (x) => (x.state ?? 'open') === 'open' && !st.picked.includes(x.id),
      )
      if (!next) throw new Error('completePromote: 已解锁候选不足以点满名额')
      await clickPromoteItem(page, next.id)
      continue
    }
    // 名额点满：整批入队，之后要么离开、要么进入首满员的阵型页
    await clickPromoteConfirm(page)
    await page.waitForFunction(
      () =>
        window.__warmoji?.scene !== 'promote' ||
        window.__warmoji.promote?.mode === 'formation',
      undefined,
      { timeout: 15_000 },
    )
  }
}

/** 走完整流程开局：标题页 → 队长确认 → 开局整编（默认招募）→ 战斗 */
export async function startRun(page: Page): Promise<void> {
  await enterCaptain(page)
  await confirmCaptain(page)
  await completePromote(page)
  await page.waitForFunction(() => window.__warmoji?.scene === 'arena')
}

/** 商店页点击某个角色的上架位（切换属性面板焦点） */
export async function clickShopSlot(page: Page, id: string): Promise<void> {
  const r = await page.evaluate(
    (cid) => window.__warmoji!.shop!.slots.find((x) => x.id === cid)!,
    id,
  )
  await page
    .locator('#game canvas')
    .click({ position: await cssPoint(page, { x: r.x + r.w / 2, y: r.y + r.h / 2 }) })
}

/** 商店页点击「购买」（作用于当前聚焦的上架位） */
export async function clickShopBuy(page: Page): Promise<void> {
  const b = await page.evaluate(() => window.__warmoji!.shop!.buy)
  await page.locator('#game canvas').click({ position: await cssPoint(page, { x: b.x, y: b.y }) })
}

/** 商店页点击「刷新」（作用于当前聚焦的上架位） */
export async function clickShopRefresh(page: Page): Promise<void> {
  const r = await page.evaluate(() => window.__warmoji!.shop!.refresh)
  await page.locator('#game canvas').click({ position: await cssPoint(page, { x: r.x, y: r.y }) })
}

/** 整编页点击网格中某个候选/队员 */
export async function clickPromoteItem(page: Page, key: string): Promise<void> {
  const r = await page.evaluate(
    (k) => window.__warmoji!.promote!.items.find((x) => x.id === k)!,
    key,
  )
  await page
    .locator('#game canvas')
    .click({ position: await cssPoint(page, { x: r.x + r.w / 2, y: r.y + r.h / 2 }) })
  await page.waitForFunction((k) => window.__warmoji?.promote?.selected === k, key)
}

/** 整编页点击确认按钮（招募/升级花 1 点；队形环节 = 出发） */
export async function clickPromoteConfirm(page: Page): Promise<void> {
  const b = await page.evaluate(() => window.__warmoji!.promote!.confirm)
  await page.locator('#game canvas').click({ position: await cssPoint(page, { x: b.x, y: b.y }) })
}

/** 阵型页：点选某队员设为受保护中心（等待中心切换生效） */
export async function clickFormationMember(page: Page, id: string): Promise<void> {
  const r = await page.evaluate(
    (cid) => window.__warmoji!.promote!.items.find((x) => x.id === cid)!,
    id,
  )
  await page
    .locator('#game canvas')
    .click({ position: await cssPoint(page, { x: r.x + r.w / 2, y: r.y + r.h / 2 }) })
  await page.waitForFunction((cid) => window.__warmoji?.promote?.formation?.center === cid, id)
}

/** 若当前在升级抽卡页，逐次选第一张候选，直到抽完离开。
 * 不在抽卡页则为空操作——供跨波流程透明穿过战斗后的升级抽卡页 */
export async function drainCards(page: Page): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const scene = await page.evaluate(() => window.__warmoji?.scene)
    if (scene !== 'cards') return
    const c = await page.evaluate(() => window.__warmoji!.cards!)
    const before = c.remaining
    const ch = c.choices[0]
    if (!ch) return
    await page
      .locator('#game canvas')
      .click({ position: await cssPoint(page, { x: ch.x + ch.w / 2, y: ch.y + ch.h / 2 }) })
    await page.waitForFunction(
      (b) => window.__warmoji?.scene !== 'cards' || (window.__warmoji?.cards?.remaining ?? 0) < b,
      before,
    )
  }
}

/** 若当前在开箱页，把所有宝箱开完（有可用角色就应用第一个，否则丢弃），直到离开。
 * 不在开箱页则为空操作——供跨波流程透明穿过战斗后新增的开箱页 */
export async function drainChests(page: Page): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const scene = await page.evaluate(() => window.__warmoji?.scene)
    if (scene !== 'chests') return
    const c = await page.evaluate(() => window.__warmoji!.chests!)
    const before = c.remaining
    const t = c.targets[0]
    const pt = t ? { x: t.x + t.w / 2, y: t.y + t.h / 2 } : { x: c.discard.x, y: c.discard.y }
    await page.locator('#game canvas').click({ position: await cssPoint(page, pt) })
    await page.waitForFunction(
      (b) => window.__warmoji?.scene !== 'chests' || (window.__warmoji?.chests?.remaining ?? 0) < b,
      before,
    )
  }
}

/** 商店页点击「开始第 N 波」进入下一波 */
export async function clickShopNext(page: Page): Promise<void> {
  const s = await page.evaluate(() => window.__warmoji!.shop!.start)
  await page.locator('#game canvas').click({ position: await cssPoint(page, { x: s.x, y: s.y }) })
  await page.waitForFunction(() => window.__warmoji?.scene === 'arena')
}
