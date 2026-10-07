import { add, compare, div, type Frac, frac, mul, toNumber, ZERO } from './fraction'

export type Note = { kind: 'note'; dur: Frac; rest: boolean }

// actual 個の音符を normal 個分の長さに詰める（3 連符なら actual=3, normal=2）
export type Tuplet = {
  kind: 'tuplet'
  actual: number
  normal: number
  notes: Note[]
}

export type Item = Note | Tuplet

// 1 拍 = 4 分音符
export const BEAT = frac(1, 4)

export const DEFAULT_BEATS = 4

// 小節内で同時に鳴らすリズムの 1 段。muted は小節ごと・段ごとのミュート
export type Voice = { id: string; items: Item[]; muted?: boolean }

// 声部はどれも同じ長さ（拍数）の中で同時に鳴る
export type Measure = { id: string; voices: Voice[] }

// 1 小節の拍数はパターン全体で共通
export type Pattern = { beats: number; measures: Measure[] }

// 小節の頭 > 拍（4 分音符）の頭 > それ以外
export type Accent = 'downbeat' | 'beat' | 'sub'

// 小節の頭を強くしない設定のときは、ほかの拍の頭と同じ扱いにする
export function effectiveAccent(accent: Accent, accentDownbeat: boolean): Accent {
  return accent === 'downbeat' && !accentDownbeat ? 'beat' : accent
}

// 再生用に平坦化した 1 音。start はパターン先頭からの位置（全音符単位）
export type RhythmEvent = {
  key: string
  start: Frac
  rest: boolean
  accent: Accent
  voice: number
  voiceId: string
  measure: number
  // 小節内で何拍目か（0 始まり）
  beat: number
  // 小節の拍数からはみ出した音。表示はするが鳴らさない
  overflow: boolean
}

export function note(d: number, n = 1, rest = false): Note {
  return { kind: 'note', dur: frac(n, d), rest }
}

export function tuplet(actual: number, normal: number, notes: Note[]): Tuplet {
  return { kind: 'tuplet', actual, normal, notes }
}

export function voice(items: Item[] = []): Voice {
  return { id: crypto.randomUUID(), items }
}

// 小節は最初からリズム1・2 の 2 段を持つ。リズム2 は空で始まる
export function measure(items: Item[]): Measure {
  return { id: crypto.randomUUID(), voices: [voice(items), voice()] }
}

export function noteKey(voiceId: string, item: number, sub = 0): string {
  return `${voiceId}:${item}:${sub}`
}

// 連符は中の音符を実際の長さに縮めて返す
export function itemNotes(item: Item): Note[] {
  if (item.kind === 'note') return [item]
  const scale = frac(item.normal, item.actual)
  return item.notes.map((n) => ({ ...n, dur: mul(n.dur, scale) }))
}

export function itemLength(item: Item): Frac {
  return itemNotes(item).reduce((sum, n) => add(sum, n.dur), ZERO)
}

// 拍数で決まる小節の長さ
export function measureLength(beats: number): Frac {
  return mul(BEAT, frac(beats))
}

// 並べた音符の合計の長さ。拍数と一致するとは限らない
export function contentLength(v: Voice): Frac {
  return v.items.reduce((sum, item) => add(sum, itemLength(item)), ZERO)
}

// 小節内の各音を、全声部まとめて時間順に返す。start は小節の頭からの位置
export function measureEvents(m: Measure, beats: number, index = 0): RhythmEvent[] {
  const events: RhythmEvent[] = []
  const length = measureLength(beats)
  m.voices.forEach((v, vi) => {
    let pos = ZERO
    v.items.forEach((item, i) => {
      itemNotes(item).forEach((n, j) => {
        const inBeats = div(pos, BEAT)
        events.push({
          key: noteKey(v.id, i, j),
          start: pos,
          rest: n.rest,
          accent: pos.n === 0 ? 'downbeat' : inBeats.d === 1 ? 'beat' : 'sub',
          voice: vi,
          voiceId: v.id,
          measure: index,
          beat: Math.floor(inBeats.n / inBeats.d),
          overflow: compare(pos, length) >= 0,
        })
        pos = add(pos, n.dur)
      })
    })
  })
  return events.sort((a, b) => compare(a.start, b.start) || a.voice - b.voice)
}

export function flatten(pattern: Pattern): { events: RhythmEvent[]; length: Frac } {
  const events: RhythmEvent[] = []
  let pos = ZERO
  pattern.measures.forEach((m, index) => {
    for (const ev of measureEvents(m, pattern.beats, index)) {
      if (!ev.overflow) events.push({ ...ev, start: add(pos, ev.start) })
    }
    pos = add(pos, measureLength(pattern.beats))
  })
  return { events, length: pos }
}

// 何拍分か（表示用）
export function inBeats(length: Frac): number {
  return toNumber(div(length, BEAT))
}

// 楽譜の音符 1 つで書ける長さか。32 分までで、付点は 1 つまで
function isNoteValue(f: Frac): boolean {
  const powerOfTwo = (f.d & (f.d - 1)) === 0
  return powerOfTwo && f.d <= 32 && (f.n === 1 || (f.n === 3 && f.d >= 4))
}

// 小節の段の中の 1 音を指す。sub は連符の中の何番目か（連符でなければ 0）
export type NoteRef = { item: number; sub: number }

function replaceItem(items: Item[], index: number, next: Item[]): Item[] {
  return [...items.slice(0, index), ...next, ...items.slice(index + 1)]
}

function halve(n: Note): Note | null {
  const dur = div(n.dur, frac(2))
  return isNoteValue(dur) ? { ...n, dur } : null
}

// 1 音を 2 つ、または 3 連に割る。できないときは null（細かくなりすぎる、連符の中の 3 連など）
export function splitNote(items: Item[], ref: NoteRef, parts: 2 | 3): Item[] | null {
  const item = items[ref.item]
  if (item.kind === 'note') {
    const h = halve(item)
    if (!h) return null
    // 3 連は、半分の音価 3 つを元の長さに詰める（4 分 → 8 分の 3 連）
    return replaceItem(items, ref.item, parts === 2 ? [h, { ...h }] : [tuplet(3, 2, [h, { ...h }, { ...h }])])
  }
  // 連符の中にさらに連符は作れない
  if (parts === 3) return null
  const h = halve(item.notes[ref.sub])
  if (!h) return null
  const notes = [...item.notes.slice(0, ref.sub), h, { ...h }, ...item.notes.slice(ref.sub + 1)]
  return replaceItem(items, ref.item, [{ ...item, notes }])
}

// 右隣の音と合わせた長さを、同じ長さの 3 音（3 連）にする。
// 8 分＋8 分なら普通の 8 分の 3 連、8 分＋付点 8 分（16 分 5 つ分）なら「16 分 3 つを 16 分 5 つ分で」の連符になる。
// どちらかが連符の中の音、右隣がない、などのときは null
export function tripletWithNext(items: Item[], ref: NoteRef): Item[] | null {
  const a = items[ref.item]
  const b = items[ref.item + 1]
  if (a.kind !== 'note' || !b || b.kind !== 'note') return null
  const total = add(a.dur, b.dur)
  const half = div(total, frac(2))
  let written: Frac
  let normal: number
  if (half.n === 1 && isNoteValue(half)) {
    // 合計の半分が音符 1 つで書けるなら、それを 3 つ 2 つ分に詰める（普通の 3 連）
    written = half
    normal = 2
  } else if (isNoteValue(frac(1, total.d))) {
    // それ以外は、合計の分母の音符 3 つを、その total.n 個分の長さに詰める
    written = frac(1, total.d)
    normal = total.n
  } else {
    return null
  }
  const n: Note = { kind: 'note', dur: written, rest: false }
  // 8 分＋4 分のように、ちょうど書ける音符 3 つになるなら連符にしない
  const three: Item[] = normal === 3 ? [n, { ...n }, { ...n }] : [tuplet(3, normal, [n, { ...n }, { ...n }])]
  return [...items.slice(0, ref.item), ...three, ...items.slice(ref.item + 2)]
}
