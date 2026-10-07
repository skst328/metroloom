import { type Item, measure, note, type Pattern, tuplet } from './rhythm'

const triplet8 = () => tuplet(3, 2, [note(8), note(8), note(8)])

function repeat(times: number, beat: () => Item[]): Item[] {
  return Array.from({ length: times }, beat).flat()
}

// 1 拍分のリズム。全体のプリセットと、小節への追加の両方で使う
export const BEAT_PATTERNS: { name: string; make: () => Item[] }[] = [
  { name: '4分', make: () => [note(4)] },
  { name: '8分', make: () => [note(8), note(8)] },
  { name: '3連', make: () => [triplet8()] },
  { name: '16分', make: () => [note(16), note(16), note(16), note(16)] },
  { name: '付点8分＋16分', make: () => [note(16, 3), note(16)] },
  { name: '16分＋付点8分', make: () => [note(16), note(16, 3)] },
  { name: '8分＋16分×2', make: () => [note(8), note(16), note(16)] },
  { name: '16分×2＋8分', make: () => [note(16), note(16), note(8)] },
  { name: '16分＋8分＋16分', make: () => [note(16), note(8), note(16)] },
  {
    name: '3連（16分×2＋8分×2）',
    make: () => [tuplet(3, 2, [note(16), note(16), note(8), note(8)])],
  },
  {
    name: '3連（8分×2＋16分×2）',
    make: () => [tuplet(3, 2, [note(8), note(8), note(16), note(16)])],
  },
]

type Preset = { name: string; icon: Item[]; build: (beats: number) => Pattern }

export const PRESETS: Preset[] = BEAT_PATTERNS.map((p) => ({
  name: p.name,
  icon: p.make(),
  // 1 拍分のリズムを、拍数ぶん並べた 1 小節
  build: (beats) => ({ beats, measures: [measure(repeat(beats, p.make))] }),
}))

// 今のパターンがちょうどプリセットどおりなら、その番号。手で編集して違っていれば -1
export function matchPreset(pattern: Pattern): number {
  if (pattern.measures.length !== 1) return -1
  // リズム2 以降に音符があればプリセットどおりではない
  const [first, ...others] = pattern.measures[0].voices
  if (others.some((v) => v.items.length > 0)) return -1
  const items = JSON.stringify(first.items)
  return BEAT_PATTERNS.findIndex(
    (p) => JSON.stringify(repeat(pattern.beats, p.make)) === items,
  )
}

// 小節に追加できる単独の音価
export const PALETTE: { label: string; make: () => Item }[] = [
  { label: '4分', make: () => note(4) },
  { label: '8分', make: () => note(8) },
  { label: '16分', make: () => note(16) },
  { label: '32分', make: () => note(32) },
  { label: '付点4分', make: () => note(8, 3) },
  { label: '付点8分', make: () => note(16, 3) },
  { label: '付点16分', make: () => note(32, 3) },
  { label: '2拍3連', make: () => tuplet(3, 2, [note(4), note(4), note(4)]) },
]
