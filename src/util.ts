export function compact<T>(a: (T | undefined)[]): T[] {
  // eslint-disable-next-line unicorn/prefer-native-coercion-functions
  return a.filter((a): a is T => Boolean(a))
}
