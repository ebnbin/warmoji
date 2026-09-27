import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

// 界面一律用 src/ui 组件库搭：库外不许直接建显示对象、接管指针、写颜色和字体样式。
// 战斗的 ECS、可独立成库的开发者工具与 emoji 纹理管线不属于界面。
const root = resolve('src')
const exempt = ['ui', 'ecs', 'devtools', 'emoji'].map((d) => join(root, d) + sep)

const RULES: readonly { readonly re: RegExp; readonly what: string }[] = [
  { re: /\.(add|make)\.\w+\s*\(|new Phaser\.GameObjects\.|\bemojiImage\s*\(/, what: '直接创建显示对象' },
  { re: /\.setInteractive\s*\(|GAMEOBJECT_POINTER|Input\.Events\.POINTER/, what: '直接接管指针' },
  { re: /\b0x[0-9a-fA-F]{6}\b|['"`]#[0-9a-fA-F]{3,8}['"`]/, what: '写死颜色' },
  { re: /\b(fontFamily|fontSize|fontStyle|strokeThickness|backgroundColor|wordWrap|lineSpacing)\s*:/, what: '写死字体样式' },
  { re: /\.set(Tint|TintFill|FillStyle|StrokeStyle|Color|Stroke|Shadow|FontSize|FontStyle|BackgroundColor)\s*\(/, what: '直接改样式' },
]

const files: string[] = []
const walk = (dir: string): void => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (!exempt.includes(p + sep)) walk(p)
    } else if (p.endsWith('.ts')) {
      files.push(p)
    }
  }
}
walk(root)

const errors: string[] = []
for (const file of files) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const rule of RULES) {
        if (rule.re.test(line)) errors.push(`${relative('.', file)}:${i + 1} ${rule.what}，改用 src/ui 组件库：${line.trim()}`)
      }
    })
}

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exit(1)
}
