import * as components from './components'
import { columnFill, resizeColumn } from './components'
import type { Column } from './components'
import * as store from './store'
import { INITIAL_CAPACITY } from './world'

let capacity = INITIAL_CAPACITY

const STORE = Object.values(store) as unknown[][]

function eachColumn(fn: (fields: Record<string, unknown>, key: string, col: Column) => void): void {
  for (const comp of Object.values(components)) {
    if (typeof comp !== 'object' || Array.isArray(comp)) continue
    const fields = comp as Record<string, unknown>
    for (const key of Object.keys(fields)) {
      const col = fields[key]
      if (col instanceof Float32Array || col instanceof Int32Array || col instanceof Uint32Array || col instanceof Uint8Array) {
        fn(fields, key, col)
      }
    }
  }
}

interface Columns {
  f32: Float32Array[]
  u32: Uint32Array[]
  u8: Uint8Array[]
  i32: Int32Array[]
  i32Fill: number[]
}

function collectColumns(): Columns {
  const out: Columns = { f32: [], u32: [], u8: [], i32: [], i32Fill: [] }
  eachColumn((_fields, _key, col) => {
    if (col instanceof Float32Array) out.f32.push(col)
    else if (col instanceof Uint32Array) out.u32.push(col)
    else if (col instanceof Uint8Array) out.u8.push(col)
    else {
      out.i32.push(col)
      out.i32Fill.push(columnFill(col))
    }
  })
  return out
}

let columns = collectColumns()

function resize(length: number): void {
  eachColumn((fields, key, col) => {
    fields[key] = resizeColumn(col, length)
  })
  columns = collectColumns()
  for (const arr of STORE) {
    if (length < arr.length) arr.length = length
    while (arr.length < length) arr.push(undefined)
  }
  capacity = length
}

export function ensureCapacity(eid: number): void {
  if (eid < capacity) return
  let length = capacity * 2
  while (length <= eid) length *= 2
  resize(length)
}

export function clearEntity(eid: number): void {
  const c = columns
  for (let i = 0; i < c.f32.length; i++) c.f32[i]![eid] = 0
  for (let i = 0; i < c.u32.length; i++) c.u32[i]![eid] = 0
  for (let i = 0; i < c.u8.length; i++) c.u8[i]![eid] = 0
  for (let i = 0; i < c.i32.length; i++) c.i32[i]![eid] = c.i32Fill[i]!
  for (let i = 0; i < STORE.length; i++) STORE[i]![eid] = undefined
}

export function resetEntityStorage(): void {
  if (capacity !== INITIAL_CAPACITY) resize(INITIAL_CAPACITY)
  for (const arr of STORE) arr.fill(undefined)
}
