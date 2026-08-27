export function compact<T>(a: Array<T | undefined>): T[] {
  return a.filter((a): a is T => Boolean(a))
}
