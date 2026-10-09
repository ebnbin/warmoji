import affixesJson from '../assets/affixes.json'
import { fromJson } from './json'
import { keysOf } from '../util/record'
import type { AffixDef, AffixId } from '../types/affixes'

/** 精英词缀表：长度以格为单位，挂到身体上时再换算 */
export const AFFIXES: Readonly<Record<AffixId, AffixDef>> = fromJson<Record<AffixId, AffixDef>>(affixesJson)
export const AFFIX_IDS: readonly AffixId[] = keysOf(AFFIXES)
