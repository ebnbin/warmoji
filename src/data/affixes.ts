import affixesJson from '../assets/affixes.json'
import { fromJson } from './json'
import { toPx } from './px'
import { keysOf, mapValues } from '../util/record'
import type { AffixDef, AffixId } from '../types/affixes'

export const AFFIXES: Readonly<Record<AffixId, AffixDef>> = mapValues(fromJson<Record<AffixId, AffixDef>>(affixesJson), (a) => toPx(a))
export const AFFIX_IDS: readonly AffixId[] = keysOf(AFFIXES)
