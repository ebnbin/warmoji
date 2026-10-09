/** 标记里只能存数：把定义对象按身份编成号，同一个对象永远同一个号，0 表示没有 */
export class Interned<T extends object> {
  private readonly list: T[] = []
  private readonly ids = new Map<T, number>()

  id(value: T): number {
    let i = this.ids.get(value)
    if (i === undefined) {
      this.list.push(value)
      i = this.list.length
      this.ids.set(value, i)
    }
    return i
  }

  get(id: number): T | undefined {
    return id > 0 ? this.list[id - 1] : undefined
  }
}
