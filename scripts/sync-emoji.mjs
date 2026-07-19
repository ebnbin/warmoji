// 构建前把 twemoji-svg（jdecked/twemoji 官方资产的转打包，已抽样 hash 验证一致）
// 打包为两份资源（生成物不进 git）：
//   src/assets/emoji/index.json —— Unicode 官方索引（CLDR 顺序）与 twemoji
//     的交集：key/字符/英文名/分组 + 全库统一 header；行序即打包文件行序
//   src/assets/emoji/pack.txt   —— 每行一个去 header 的 SVG 正文
// 一切以官方数据为准：Unicode 索引按需从 unicode.org 官方地址拉取
//（缓存在 scripts/data/，不进 git），twemoji 形态逐文件实测。所有例外（header 变体/换行/引用）显式处理，
// 未知情况直接报错退出，不做静默假设。
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// 脚本行为变更时 bump，强制重新生成
const GENERATOR = 4

const root = new URL('..', import.meta.url).pathname
const srcDir = join(root, 'node_modules/twemoji-svg/dist')
const twemojiVersion = JSON.parse(
  readFileSync(join(root, 'node_modules/twemoji-svg/package.json'), 'utf8'),
).version
// 资源随构建走：代码经 ?url 引用产出带内容 hash 的构建资产，代码与
// emoji 数据严格同版本原子部署（PreloadScene 门禁预加载），无新旧偏斜问题
const destDir = join(root, 'src/assets/emoji')
const indexPath = join(destDir, 'index.json')
const packPath = join(destDir, 'pack.txt')

// 幂等：产物存在且由同版本脚本生成则跳过
if (existsSync(indexPath) && existsSync(packPath)) {
  try {
    const prev = JSON.parse(readFileSync(indexPath, 'utf8'))
    if (prev.generator === GENERATOR && prev.twemojiVersion === twemojiVersion) process.exit(0)
  } catch {
    // 产物损坏则重建
  }
}

// ── 1. 解析 Unicode 官方索引（fully-qualified，CLDR 顺序；component 是
//       肤色/发色零件而非独立形象，不收） ────────────────────────
// 索引不进 git：按需从官方地址拉取，缓存在 scripts/data/（gitignore）。
// 版本固定（latest 会随 Unicode 发布漂移，构建必须可重现），与 twemoji-svg
// 依赖同代——升级 twemoji 时同步改这里。路径是 17.0 起的 UCD 布局
//（16.0 及以前在 /Public/emoji/<版本>/ 下）
const EMOJI_TEST_VERSION = '17.0'
const EMOJI_TEST_URL = `https://unicode.org/Public/${EMOJI_TEST_VERSION}.0/emoji/emoji-test.txt`
const emojiTestPath = join(root, 'scripts/data/emoji-test.txt')

const versionOf = (text) => /^# Version: (.+)$/m.exec(text)?.[1]?.trim()

async function loadEmojiTest() {
  if (existsSync(emojiTestPath)) {
    const cached = readFileSync(emojiTestPath, 'utf8')
    if (versionOf(cached) === EMOJI_TEST_VERSION) return cached
    // 版本不符（URL 已升级而缓存是旧代）：重新下载覆盖
  }
  console.log(`下载 Unicode emoji 索引：${EMOJI_TEST_URL}`)
  const res = await fetch(EMOJI_TEST_URL)
  if (!res.ok) throw new Error(`emoji-test.txt 下载失败：HTTP ${res.status}（${EMOJI_TEST_URL}）`)
  const text = await res.text()
  const got = versionOf(text)
  if (got !== EMOJI_TEST_VERSION) {
    throw new Error(`emoji-test.txt 版本不符：期望 ${EMOJI_TEST_VERSION}，得到 ${String(got)}`)
  }
  mkdirSync(join(root, 'scripts/data'), { recursive: true })
  writeFileSync(emojiTestPath, text)
  return text
}

const testTxt = await loadEmojiTest()
const unicodeVersion = versionOf(testTxt)
if (!unicodeVersion) throw new Error('emoji-test.txt 缺少 Version 行')

/** twemoji 文件名规则（与 src/core/emoji.ts 的 emojiCodepoints 一致）：
 * 码点小写十六进制以 - 连接；不含 ZWJ 的序列去掉 FE0F */
const keyOf = (points) => {
  const hasZwj = points.includes(0x200d)
  return points
    .filter((p) => hasZwj || p !== 0xfe0f)
    .map((p) => p.toString(16))
    .join('-')
}

const groups = []
const unicodeEntries = []
{
  let groupIdx = -1
  for (const line of testTxt.split('\n')) {
    const g = /^# group: (.+)$/.exec(line)
    if (g) {
      groups.push(g[1].trim())
      groupIdx = groups.length - 1
      continue
    }
    const m = /^([0-9A-F ]+?)\s*;\s*fully-qualified\s*#\s*(\S+)\s+E[\d.]+\s+(.+)$/.exec(line)
    if (!m) continue
    const points = m[1].trim().split(/\s+/).map((h) => parseInt(h, 16))
    unicodeEntries.push({ key: keyOf(points), emoji: m[2], name: m[3].trim(), group: groupIdx })
  }
}
if (unicodeEntries.length === 0) throw new Error('emoji-test.txt 未解析出任何 fully-qualified 条目')

// ── 2. twemoji 实测形态处理 ─────────────────────────────────────
const STD_HEADER = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36">'
const STD_VIEWBOX = [0, 0, 36, 36]
const files = new Set(readdirSync(srcDir).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)))

const fmtNum = (n) => {
  const r = Math.round(n * 10000) / 10000
  return Object.is(r, -0) ? '0' : String(r)
}

const stats = { std: 0, headerVariant: 0, normalized: 0, newlineFixed: 0 }

/** 读取并把一个 SVG 处理成「能在标准 header 中原样呈现」的单行正文 */
function extractBody(key) {
  const text = readFileSync(join(srcDir, `${key}.svg`), 'utf8')
  const open = /<svg\b[^>]*>/.exec(text)?.[0]
  if (!open) throw new Error(`${key}.svg: 无 <svg> 开标签`)
  const closeIdx = text.lastIndexOf('</svg>')
  if (closeIdx < 0) throw new Error(`${key}.svg: 无 </svg> 闭合`)
  let body = text.slice(text.indexOf(open) + open.length, closeIdx).trim()

  // 自包含校验：正文内的 url(#x) 引用必须在正文内定义
  const ids = new Set([...body.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))
  for (const [, ref] of body.matchAll(/url\(#([^)]+)\)/g)) {
    if (!ids.has(ref)) throw new Error(`${key}.svg: 引用了正文外的 id "#${ref}"`)
  }
  if (/href=/.test(body)) throw new Error(`${key}.svg: 含 href 外部引用，需人工确认`)
  // id 命名空间化：多个正文可被拼进同一张网格大 SVG，短 id（如 "a"）会互相污染
  if (ids.size > 0) {
    body = body
      .replace(/\bid="([^"]+)"/g, (_, v) => `id="${key}-${v}"`)
      .replace(/url\(#([^)]+)\)/g, (_, v) => `url(#${key}-${v})`)
  }

  // 换行压平（打包格式一行一个；SVG 中行内空白等价）
  if (/[\r\n]/.test(body)) {
    body = body.replace(/\s*[\r\n]+\s*/g, ' ')
    stats.newlineFixed++
  }

  if (open === STD_HEADER) {
    stats.std++
    return body
  }

  // header 变体：解析属性，决定能否安全归一
  const attrs = {}
  for (const [, k, v] of open.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[k] = v
  const known = new Set(['xmlns', 'viewBox', 'xml:space', 'width', 'height', 'xmlns:xlink'])
  for (const k of Object.keys(attrs)) {
    if (!known.has(k)) throw new Error(`${key}.svg: header 含未知属性 ${k}="${attrs[k]}"，需人工确认`)
  }
  // xml:space 只影响 <text> 空白；确认无 text 后可安全丢弃
  if (attrs['xml:space'] && /<text\b/.test(body)) {
    throw new Error(`${key}.svg: xml:space 变体含 <text>，不能丢弃该属性`)
  }
  const vb = (attrs.viewBox ?? '0 0 36 36').trim().split(/[\s,]+/).map(Number)
  if (vb.length !== 4 || vb.some((n) => !Number.isFinite(n))) {
    throw new Error(`${key}.svg: viewBox 无法解析 "${attrs.viewBox}"`)
  }
  if (vb.every((v, i) => v === STD_VIEWBOX[i])) {
    stats.headerVariant++
    return body
  }
  // viewBox 不同：等比缩放 + 居中平移，使原内容在 36 格里呈现一致
  const [x, y, w, h] = vb
  if (w <= 0 || h <= 0) throw new Error(`${key}.svg: viewBox 尺寸非法 "${attrs.viewBox}"`)
  const s = 36 / Math.max(w, h)
  const tx = -x * s + (36 - w * s) / 2
  const ty = -y * s + (36 - h * s) / 2
  stats.normalized++
  return `<g transform="translate(${fmtNum(tx)} ${fmtNum(ty)}) scale(${fmtNum(s)})">${body}</g>`
}

// ── 3. 交集匹配 + 产出 ─────────────────────────────────────────
// 文件名查找：主规则（= 运行时 emojiCodepoints 输出，索引 key 恒用它）→
// 个别历史特例 fallback（如 👁️‍🗨️ 含 ZWJ 却全去 FE0F 的 1f441-200d-1f5e8）
const fileOf = (key) => {
  if (files.has(key)) return key
  const stripped = key
    .split('-')
    .filter((seg) => seg !== 'fe0f')
    .join('-')
  return files.has(stripped) ? stripped : null
}

const emojis = []
const packLines = []
let missUnicode = 0
let fallbackHits = 0
const usedKeys = new Set()
for (const e of unicodeEntries) {
  const file = fileOf(e.key)
  if (!file) {
    missUnicode++
    continue
  }
  if (file !== e.key) fallbackHits++
  const body = extractBody(file)
  if (/[\r\n]/.test(body)) throw new Error(`${e.key}: 正文仍含换行`)
  emojis.push({ c: e.key, e: e.emoji, n: e.name, g: e.group })
  packLines.push(body)
  usedKeys.add(file)
}
const orphans = files.size - usedKeys.size

if (emojis.length === 0) throw new Error('交集为空，检查数据源')

rmSync(join(root, 'public/emoji'), { recursive: true, force: true }) // 旧输出位置的残留
rmSync(destDir, { recursive: true, force: true })
mkdirSync(destDir, { recursive: true })
const indexJson = JSON.stringify({
  format: 'warmoji-emoji@1',
  generator: GENERATOR,
  unicodeVersion,
  twemojiVersion,
  header: STD_HEADER,
  groups,
  emojis,
})
const packText = packLines.join('\n')
writeFileSync(indexPath, indexJson)
writeFileSync(packPath, packText)


const kb = (p) => Math.round(readFileSync(p).length / 1024)
console.log(
  `emoji 打包：Unicode ${unicodeVersion} ∩ twemoji ${twemojiVersion} = ${emojis.length} 条 → ` +
    `index.json ${kb(indexPath)}KB + pack.txt ${kb(packPath)}KB\n` +
    `  标准 header ${stats.std} · 变体归一 ${stats.headerVariant} · viewBox 缩放 ${stats.normalized} · ` +
    `换行修复 ${stats.newlineFixed} · 文件名特例 ${fallbackHits}\n` +
    `  丢弃：Unicode 有而 twemoji 无 ${missUnicode} · twemoji 孤儿（区域字母/组件等） ${orphans}`,
)
