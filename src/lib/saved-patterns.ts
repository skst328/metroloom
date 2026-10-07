import { useEffect, useState } from 'react'
import { frac } from './fraction'
import { type Item, type Measure, type Note, type Pattern, voice } from './rhythm'
import { BPM_MAX, BPM_MIN } from './tempo'

// 作ったリズムに名前を付けて、ブラウザの localStorage に保存する
const STORAGE_KEY = 'savedPatterns'

export type SavedPattern = {
  id: string
  name: string
  savedAt: number
  // ミュートは pattern の各声部に入っている
  pattern: Pattern
  bpm: number
  accentDownbeat: boolean
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null
const isPositiveInt = (x: unknown): x is number => Number.isInteger(x) && (x as number) > 0

function readNote(x: unknown): Note | null {
  if (!isObject(x) || x.kind !== 'note' || !isObject(x.dur)) return null
  const { n, d } = x.dur
  if (!isPositiveInt(n) || !isPositiveInt(d)) return null
  return { kind: 'note', dur: frac(n, d), rest: x.rest === true }
}

function readItem(x: unknown): Item | null {
  if (isObject(x) && x.kind === 'tuplet') {
    if (!isPositiveInt(x.actual) || !isPositiveInt(x.normal) || !Array.isArray(x.notes)) return null
    const notes = x.notes.map(readNote)
    if (notes.length === 0 || notes.some((n) => !n)) return null
    return { kind: 'tuplet', actual: x.actual, normal: x.normal, notes: notes as Note[] }
  }
  return readNote(x)
}

// 保存した形が壊れていないか確かめながら読み直す。id は呼び出すたびに振り直す
function readPattern(x: unknown): Pattern | null {
  if (!isObject(x) || !isPositiveInt(x.beats) || x.beats > 12) return null
  if (!Array.isArray(x.measures) || x.measures.length === 0) return null
  const measures: Measure[] = []
  for (const m of x.measures) {
    if (!isObject(m) || !Array.isArray(m.voices)) return null
    const voices = []
    for (const v of m.voices.slice(0, 2)) {
      if (!isObject(v) || !Array.isArray(v.items)) return null
      const items = v.items.map(readItem)
      if (items.some((it) => !it)) return null
      voices.push({ ...voice(items as Item[]), muted: v.muted === true })
    }
    // 小節は常にリズム1・2 の 2 段を持つ
    while (voices.length < 2) voices.push(voice())
    measures.push({ id: crypto.randomUUID(), voices })
  }
  return { beats: x.beats, measures }
}

function readEntry(x: unknown): SavedPattern | null {
  if (!isObject(x) || typeof x.id !== 'string' || typeof x.name !== 'string') return null
  const pattern = readPattern(x.pattern)
  if (!pattern) return null
  const bpm = typeof x.bpm === 'number' && x.bpm >= BPM_MIN && x.bpm <= BPM_MAX ? Math.round(x.bpm) : 60
  return {
    id: x.id,
    name: x.name,
    savedAt: typeof x.savedAt === 'number' ? x.savedAt : 0,
    pattern,
    bpm,
    accentDownbeat: x.accentDownbeat === true,
  }
}

// 壊れたものだけ読み飛ばす
function readAll(): SavedPattern[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.map(readEntry).filter((e): e is SavedPattern => e !== null)
  } catch {
    // プライベートウィンドウなどでは読めないことがある
    return []
  }
}

// 呼び出したリズムを編集しても保存したものが変わらないよう、id を振り直した複製を返す
export function copyPattern(p: Pattern): Pattern {
  return readPattern(JSON.parse(JSON.stringify(p))) ?? p
}

// 編集されたかどうかの比較用。id は比較に含めない
export function snapshot(p: Pattern): string {
  return JSON.stringify({
    beats: p.beats,
    measures: p.measures.map((m) => m.voices.map((v) => ({ items: v.items, muted: !!v.muted }))),
  })
}

export function useSavedPatterns() {
  const [list, setList] = useState(readAll)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    } catch {
      // 保存できなくても、このページを開いている間は一覧を使える
    }
  }, [list])

  return {
    list,
    add: (entry: Omit<SavedPattern, 'id' | 'savedAt'>) =>
      setList((l) => [...l, { ...entry, id: crypto.randomUUID(), savedAt: Date.now() }]),
    update: (id: string, patch: Partial<Omit<SavedPattern, 'id'>>) =>
      setList((l) => l.map((e) => (e.id === id ? { ...e, ...patch } : e))),
    remove: (id: string) => setList((l) => l.filter((e) => e.id !== id)),
  }
}
