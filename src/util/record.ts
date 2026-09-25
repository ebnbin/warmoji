export function keysOf<K extends string>(obj: Readonly<Partial<Record<K, unknown>>>): K[] {
  return Object.keys(obj) as K[]
}

export function mapValues<K extends string, A, B>(obj: Readonly<Record<K, A>>, fn: (a: A) => B): Record<K, B> {
  return Object.fromEntries(Object.entries<A>(obj).map(([k, a]) => [k, fn(a)])) as Record<K, B>
}
