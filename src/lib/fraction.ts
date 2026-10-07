// 音価は「全音符を 1 とした分数」で持つ。3 連符などで浮動小数の誤差を溜めないため
export type Frac = { n: number; d: number }

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b)
}

export function frac(n: number, d = 1): Frac {
  const g = gcd(n, d) || 1
  const sign = d < 0 ? -1 : 1
  return { n: (sign * n) / g, d: (sign * d) / g }
}

export const ZERO = frac(0)

export function add(a: Frac, b: Frac): Frac {
  return frac(a.n * b.d + b.n * a.d, a.d * b.d)
}

export function mul(a: Frac, b: Frac): Frac {
  return frac(a.n * b.n, a.d * b.d)
}

export function toNumber(a: Frac): number {
  return a.n / a.d
}

export function sub(a: Frac, b: Frac): Frac {
  return frac(a.n * b.d - b.n * a.d, a.d * b.d)
}

export function div(a: Frac, b: Frac): Frac {
  return frac(a.n * b.d, a.d * b.n)
}

export function compare(a: Frac, b: Frac): number {
  return a.n * b.d - b.n * a.d
}
