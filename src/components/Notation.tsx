import type { ReactNode } from 'react'
import type { Item, Note } from '@/lib/rhythm'

// 音価ボタンやプリセットに出す小さな譜例。符頭・符幹・連桁・付点・連符の数字だけを描く
const H = 40
const HEAD_Y = 31
const STEM_TOP = 12
const BEAM_H = 3
const BEAM_GAP = 5
const STEP = 13
const DOT_W = 5
const GROUP_GAP = 4
const PAD = 4

type Placed = { x: number; den: number; dotted: boolean; rest: boolean }
type Group = { notes: Placed[]; tuplet?: number }

// 付点は n=3（3/8 = 付点 4 分）として表す
function shape(n: Note): { den: number; dotted: boolean } {
  return n.dur.n === 3 ? { den: n.dur.d / 2, dotted: true } : { den: n.dur.d, dotted: false }
}

// 8 分は 1 本、16 分は 2 本、32 分は 3 本
const beamCount = (den: number) => (den >= 32 ? 3 : den >= 16 ? 2 : den >= 8 ? 1 : 0)
const stemX = (p: Placed) => p.x + 3.9

function layout(items: Item[]): { groups: Group[]; width: number } {
  const groups: Group[] = []
  let x = PAD + 5
  const place = (n: Note): Placed => {
    const { den, dotted } = shape(n)
    const p = { x, den, dotted, rest: n.rest }
    x += STEP + (dotted ? DOT_W : 0)
    return p
  }
  for (const item of items) {
    if (item.kind === 'tuplet') {
      if (groups.length) x += GROUP_GAP
      groups.push({ notes: item.notes.map(place), tuplet: item.actual })
      x += GROUP_GAP
    } else {
      const last = groups[groups.length - 1]
      if (last && !last.tuplet) last.notes.push(place(item))
      else groups.push({ notes: [place(item)] })
    }
  }
  return { groups, width: x - STEP + 9 + PAD }
}

// 連桁でつなぐ範囲（8 分以下が 2 つ以上続くところ）
function beamRuns(notes: Placed[]): Placed[][] {
  const runs: Placed[][] = []
  let run: Placed[] = []
  for (const n of [...notes, null]) {
    if (n && beamCount(n.den) > 0 && !n.rest) {
      run.push(n)
    } else {
      if (run.length) runs.push(run)
      run = []
    }
  }
  return runs
}

function Beams({ run }: { run: Placed[] }) {
  const out: ReactNode[] = []
  const first = stemX(run[0])
  const last = stemX(run[run.length - 1])
  out.push(<rect key="b1" x={first - 0.6} y={STEM_TOP} width={last - first + 1.2} height={BEAM_H} />)
  // 2 本目以降の桁。同じ本数以上の音が隣り合うところはつなぎ、単独の音は短い桁を内側に向ける
  const levels = Math.max(...run.map((n) => beamCount(n.den)))
  for (let level = 2; level <= levels; level++) {
    const y = STEM_TOP + BEAM_GAP * (level - 1)
    const has = (n: Placed | undefined) => !!n && beamCount(n.den) >= level
    run.forEach((n, i) => {
      if (!has(n)) return
      const next = run[i + 1]
      const prev = run[i - 1]
      if (has(next)) {
        out.push(
          <rect
            key={`b${level}-${i}`}
            x={stemX(n) - 0.6}
            y={y}
            width={stemX(next) - stemX(n) + 1.2}
            height={BEAM_H}
          />,
        )
      } else if (!has(prev)) {
        // 付点 8 分＋16 分のような単独の 16 分
        const len = 5
        const x = next ? stemX(n) - 0.6 : stemX(n) - len + 0.6
        out.push(<rect key={`b${level}-${i}`} x={x} y={y} width={len} height={BEAM_H} />)
      }
    })
  }
  return <>{out}</>
}

function Flags({ n }: { n: Placed }) {
  const sx = stemX(n)
  return (
    <>
      {Array.from({ length: beamCount(n.den) }, (_, i) => (
        <path
          key={i}
          d={`M ${sx} ${STEM_TOP + i * 5} c 0.5 3, 5.5 3.5, 5 8.5`}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        />
      ))}
    </>
  )
}

function Head({ n }: { n: Placed }) {
  const open = n.den <= 2
  return (
    <>
      <ellipse
        cx={n.x}
        cy={HEAD_Y}
        rx={4.4}
        ry={3.1}
        transform={`rotate(-20 ${n.x} ${HEAD_Y})`}
        fill={open ? 'none' : 'currentColor'}
        stroke="currentColor"
        strokeWidth={open ? 1.3 : 0}
      />
      {n.den >= 2 && (
        <line x1={stemX(n)} y1={HEAD_Y - 1} x2={stemX(n)} y2={STEM_TOP} stroke="currentColor" strokeWidth={1.2} />
      )}
      {n.dotted && <circle cx={n.x + 8.5} cy={HEAD_Y - 1} r={1.4} />}
    </>
  )
}

function TupletMark({ group, beamed }: { group: Group; beamed: boolean }) {
  const x0 = stemX(group.notes[0])
  const x1 = stemX(group.notes[group.notes.length - 1])
  const mid = (x0 + x1) / 2
  const y = 8
  return (
    <>
      {!beamed && (
        <path
          d={`M ${x0 - 4} ${y + 3} V ${y} H ${mid - 5} M ${mid + 5} ${y} H ${x1 + 1} V ${y + 3}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
        />
      )}
      <text x={mid} y={y + 3} fontSize={10} fontStyle="italic" textAnchor="middle">
        {group.tuplet}
      </text>
    </>
  )
}

export function Notation({ items, height = 32 }: { items: Item[]; height?: number }) {
  const { groups, width } = layout(items)
  return (
    <svg
      viewBox={`0 0 ${width} ${H}`}
      // Button が子の svg を size-4 に揃えるので、インラインで上書きする
      style={{ height, width: (width * height) / H }}
      fill="currentColor"
      aria-hidden
      className="shrink-0 overflow-visible"
    >
      {groups.map((g, gi) => {
        const runs = beamRuns(g.notes)
        const beamed = new Set(runs.filter((r) => r.length > 1).flat())
        return (
          <g key={gi}>
            {g.notes.map((n, i) => (
              <g key={i} opacity={n.rest ? 0.35 : 1}>
                <Head n={n} />
                {!beamed.has(n) && !n.rest && <Flags n={n} />}
              </g>
            ))}
            {runs.filter((r) => r.length > 1).map((r, i) => (
              <Beams key={i} run={r} />
            ))}
            {g.tuplet && (
              <TupletMark group={g} beamed={g.notes.every((n) => beamed.has(n))} />
            )}
          </g>
        )
      })}
    </svg>
  )
}
