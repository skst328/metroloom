import { Eraser, Trash2, Volume2, VolumeX } from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { VOICE_STYLE } from '@/lib/voice-style'
import { Notation } from '@/components/Notation'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { add, compare, type Frac, frac, mul, sub, toNumber, ZERO } from '@/lib/fraction'
import { BEAT_PATTERNS, PALETTE } from '@/lib/presets'
import {
  BEAT,
  contentLength,
  effectiveAccent,
  inBeats,
  type Item,
  itemLength,
  itemNotes,
  type Measure,
  measureEvents,
  measureLength,
  type Note,
  noteKey,
  splitNote,
  tripletWithNext,
  voice,
  type Voice,
} from '@/lib/rhythm'

const NOTE_NAMES: Record<string, string> = {
  '1/1': '全',
  '1/2': '2分',
  '3/8': '付点4分',
  '1/4': '4分',
  '3/16': '付点8分',
  '1/8': '8分',
  '1/16': '16分',
  '1/32': '32分',
  '3/32': '付点16分',
}

function noteName(n: Note): string {
  return NOTE_NAMES[`${n.dur.n}/${n.dur.d}`] ?? `${n.dur.n}/${n.dur.d}`
}

function itemName(item: Item): string {
  if (item.kind === 'note') return noteName(item)
  return item.normal === 2 && item.notes.every((n) => n.dur.d === 4)
    ? '2拍3連'
    : `${item.actual}連`
}


// グリッドに並べる 1 音。item は声部内の何番目の要素か、sub は連符内の何番目か
type Block = { key: string; item: number; sub: number; start: Frac; dur: Frac; rest: boolean }
type Group = { item: number; start: Frac; len: Frac; label: string }

function layoutVoice(v: Voice): { blocks: Block[]; groups: Group[] } {
  const blocks: Block[] = []
  const groups: Group[] = []
  let pos = ZERO
  v.items.forEach((item, i) => {
    const start = pos
    itemNotes(item).forEach((n, j) => {
      blocks.push({ key: noteKey(v.id, i, j), item: i, sub: j, start: pos, dur: n.dur, rest: n.rest })
      pos = add(pos, n.dur)
    })
    if (item.kind === 'tuplet') groups.push({ item: i, start, len: sub(pos, start), label: String(item.actual) })
  })
  return { blocks, groups }
}

function toggleRest(item: Item, sub: number): Item {
  if (item.kind === 'note') return { ...item, rest: !item.rest }
  return {
    ...item,
    notes: item.notes.map((n, j) => (j === sub ? { ...n, rest: !n.rest } : n)),
  }
}

// 追加される音の、段の中での位置と長さ
function ghostNotes(from: Frac, items: Item[]): { start: Frac; dur: Frac }[] {
  let pos = from
  return items.flatMap(itemNotes).map((n) => {
    const g = { start: pos, dur: n.dur }
    pos = add(pos, n.dur)
    return g
  })
}

// ブロックのメニュー。できない操作は押せなくする
function NoteMenu({
  items,
  note,
  onChange,
}: {
  items: Item[]
  note: { item: number; sub: number; rest: boolean }
  onChange: (items: Item[]) => void
}) {
  const ref = { item: note.item, sub: note.sub }
  const inTuplet = items[note.item].kind === 'tuplet'
  const entries: { label: string; next: Item[] | null; destructive?: boolean }[] = [
    { label: '2つに割る', next: splitNote(items, ref, 2) },
    { label: '3連に割る', next: splitNote(items, ref, 3) },
    { label: '右の音とまとめて3連にする', next: tripletWithNext(items, ref) },
    {
      label: note.rest ? '音に戻す' : '休符にする',
      next: items.map((it, k) => (k === note.item ? toggleRest(it, note.sub) : it)),
    },
    {
      // 連符の中の 1 音だけ消すと連符の長さが崩れるので、連符ごと消す
      label: inTuplet ? `${itemName(items[note.item])}ごと削除` : '削除',
      next: items.filter((_, k) => k !== note.item),
      destructive: true,
    },
  ]
  return (
    <div className="flex flex-col">
      {entries.map((e) => (
        <Button
          key={e.label}
          variant="ghost"
          size="sm"
          disabled={!e.next}
          className={cn('justify-start', e.destructive && 'text-destructive hover:text-destructive')}
          onClick={() => e.next && onChange(e.next)}
        >
          {e.label}
        </Button>
      ))}
    </div>
  )
}

// 拍番号。各拍の線の右に小さく出す
function BeatNumbers({ beats, pct }: { beats: number; pct: (len: Frac) => string }) {
  return (
    <div aria-hidden className="relative h-6">
      {Array.from({ length: beats }, (_, k) => (
        <span
          key={k}
          className="absolute top-0.5 pl-1.5 text-xs text-muted-foreground tabular-nums"
          style={{ left: pct(mul(BEAT, frac(k))) }}
        >
          {k + 1}
        </span>
      ))}
    </div>
  )
}

// 拍の線。ブロックの手前に引いて、拍をまたぐ音でも位置が分かるようにする
function BeatLines({ beats, pct }: { beats: number; pct: (len: Frac) => string }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {Array.from({ length: beats + 1 }, (_, k) => (
        <div
          key={k}
          className="absolute inset-y-0 border-l border-foreground/30"
          style={{ left: pct(mul(BEAT, frac(k))) }}
        />
      ))}
    </div>
  )
}

// 音符ボタン。押せないものは枠を消してかなり薄くし、押せるものとの差をはっきりさせる
const PALETTE_BUTTON =
  'h-11 px-2.5 disabled:border-transparent disabled:bg-transparent disabled:opacity-25 dark:disabled:border-transparent dark:disabled:bg-transparent'

type Props = {
  measure: Measure
  beats: number
  accentDownbeat: boolean
  index: number
  // 小節が複数あるとき。見出しに番号を付ける
  numbered: boolean
  activeKeys: string[]
  playing: boolean
  // どれかの小節に声部が 2 つあるとき。声部の名前とミュートを全小節に出す
  canRemove: boolean
  onChange: (m: Measure) => void
  onRemove: () => void
}

export function MeasureEditor({
  measure,
  beats,
  accentDownbeat,
  index,
  numbered,
  activeKeys,
  playing,
  canRemove,
  onChange,
  onRemove,
}: Props) {
  const voices = measure.voices
  const multi = voices.length > 1
  // 音符ボタンで追加する先の声部
  const [targetState, setTarget] = useState(0)
  // 追加先を切り替えた直後だけ、その段を枠で囲んで知らせる
  const [flash, setFlash] = useState(false)
  // メニューを開いているブロックの key
  const [menuKey, setMenuKey] = useState<string | null>(null)
  // 直前にブロックを触った入力の種類（mouse / touch / pen）
  const lastPointer = useRef('mouse')
  // 音符ボタンにマウスを乗せている間、そのボタンで追加される音
  const [preview, setPreview] = useState<Item[] | null>(null)
  const flashTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(flashTimer.current), [])
  const target = Math.min(targetState, voices.length - 1)
  const selectTarget = (vi: number) => {
    if (vi === target) return
    setTarget(vi)
    setFlash(true)
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(false), 2000)
  }

  const setVoiceItems = (vi: number, items: Item[]) =>
    onChange({ ...measure, voices: voices.map((v, k) => (k === vi ? { ...v, items } : v)) })
  const addItems = (items: Item[]) => setVoiceItems(target, [...voices[target].items, ...items])
  // 小節を丸ごと最初の状態（リズム1・2 とも空の小節）に戻す
  const reset = () => {
    onChange({ ...measure, voices: [voice(), voice()] })
    setTarget(0)
  }
  const toggleMute = (vi: number) =>
    onChange({ ...measure, voices: voices.map((v, k) => (k === vi ? { ...v, muted: !v.muted } : v)) })

  const length = measureLength(beats)
  const events = new Map(measureEvents(measure, beats).map((ev) => [ev.key, ev]))
  // はみ出しているときは一番長い声部の中身全体を、足りないときは小節の長さを 100% とする
  const total = Math.max(toNumber(length), ...voices.map((v) => toNumber(contentLength(v))))
  const pct = (len: Frac) => `${(toNumber(len) / total) * 100}%`
  const overflow = total > toNumber(length)

  // 追加先の段の残りに収まるか。収まらない音符ボタンは押せなくして、小節からはみ出さないようにする
  const targetRemaining = sub(length, contentLength(voices[target]))
  const fits = (items: Item[]) =>
    compare(
      items.reduce((sum, item) => add(sum, itemLength(item)), ZERO),
      targetRemaining,
    ) <= 0

  const voiceLabel = (vi: number) => `リズム${vi + 1}`
  // カード内のどの行も、左のラベル列を同じ幅にして中身の左端をそろえる
  // 下の「1拍」「音符」の行のラベル列。広い画面では段のラベル列と同じ幅にして左端をそろえる
  const labelCol = 'w-10 sm:w-32'
  // 足りない・はみ出しを声部ごとに表示する。正なら足りない、負ならはみ出している
  const status = voices.map((v) => {
    const remaining = sub(length, contentLength(v))
    const units = Number(Math.abs(inBeats(remaining)).toFixed(2))
    if (compare(remaining, ZERO) < 0) return { over: true, text: `${units}拍はみ出し（鳴りません）` }
    if (compare(remaining, ZERO) > 0 && v.items.length > 0) return { over: false, text: `あと${units}拍` }
    return null
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-baseline gap-x-3">
          {/* 小節が 1 つだけのときに「1小節目」だと続きがあるように読めるので、番号を付けない */}
          {numbered ? `${index + 1}小節目` : '小節'}
          {status.map(
            (st, vi) =>
              st && (
                <span
                  key={vi}
                  className={cn('text-sm tabular-nums', st.over ? 'text-destructive' : 'text-muted-foreground')}
                >
                  {multi && `${voiceLabel(vi)}: `}
                  {st.text}
                </span>
              ),
          )}
        </CardTitle>
        <CardAction className="flex gap-1">
          <Button variant="ghost" size="sm" title="リズム1・2 とも空にする" onClick={reset}>
            リセット
          </Button>
          {canRemove && (
            <Button variant="ghost" size="icon" aria-label="小節を削除" onClick={onRemove}>
              <Trash2 />
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* 横位置と幅は小節全体に対する割合。左端が鳴る位置、幅が長さ。
            広い画面では「ラベル｜段｜空にする」の 1 行、狭い画面ではラベルの行の下に段を全幅で置く */}
        <div className="select-none">
          {/* 広い画面の拍番号。全段に共通で、左右の列のぶん内側に寄せて段と位置をそろえる */}
          <div className="hidden sm:block sm:pr-10 sm:pl-34">
            <div className="relative">
              <BeatNumbers beats={beats} pct={pct} />
              <BeatLines beats={beats} pct={pct} />
            </div>
          </div>

          {voices.map((v, vi) => {
            const { blocks, groups } = layoutVoice(v)
            const style = VOICE_STYLE[vi] ?? VOICE_STYLE[0]
            return (
              <Fragment key={v.id}>
                {vi > 0 && (
                  // 狭い画面では段が縦に長くなり、リズムの境目が分かりにくいので区切り線を入れる
                  <div aria-hidden className="my-3 border-t sm:hidden" />
                )}
                <div
                  className="relative grid grid-cols-[1fr_auto] gap-x-2 [grid-template-areas:'label_erase''lane_lane'] sm:grid-cols-[8rem_1fr_2rem] sm:[grid-template-areas:'label_lane_erase']"
                >
                  {multi && vi === target && (
                    // 追加先を切り替えた直後だけ、行ごと段の色の枠で囲む。再生中は出さない
                    <div
                      aria-hidden
                      className={cn(
                        'pointer-events-none absolute -inset-x-2 top-0 bottom-3.5 rounded-lg border-2 transition-opacity duration-500 sm:top-1.5',
                        VOICE_STYLE[vi].frame,
                        flash && !playing ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                  )}

                  {/* 声部の名前。押すとその声部が追加先になる */}
                  <div className="[grid-area:label] sm:pt-3">
                    <div
                      className={cn(
                        // 狭い画面ではラベルが横幅いっぱいに広がるので、背景は中身の幅までにする
                        'flex h-12 w-fit items-center gap-0.5 rounded-md pr-3 pl-0.5 text-xs sm:w-full sm:pr-2',
                        // 停止中は追加先の段のラベルを薄いグレーで示す。段の色で塗るとロールの色とかぶってうるさいため。
                        // 再生中は邪魔になるので出さない
                        vi === target && multi && !playing
                          // ライトでは accent がカードの白とほぼ同じで見えないので、文字色を薄く混ぜた色にする
                        ? 'bg-foreground/8 font-medium text-foreground dark:bg-accent'
                          : 'text-muted-foreground',
                      )}
                    >
                      {/* ミュートは左端、空にするボタンは右端に置いて押し間違えないようにする */}
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={v.muted ? `${voiceLabel(vi)}のミュートを解除` : `${voiceLabel(vi)}をミュート`}
                        aria-pressed={!!v.muted}
                        title={v.muted ? 'ミュート中（押すと鳴らす）' : '鳴らす（押すとミュート）'}
                        className={cn(
                          'mr-1.5 [&_svg:not([class*=size-])]:size-[18px]',
                          // ミュート中はアイコンだけ赤くする。枠や背景まで赤いと目立ちすぎるため
                          v.muted && 'text-destructive hover:text-destructive',
                        )}
                        onClick={() => toggleMute(vi)}
                      >
                        {v.muted ? <VolumeX /> : <Volume2 />}
                      </Button>
                      <button
                        type="button"
                        className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-left whitespace-nowrap"
                        title="音符ボタンの追加先にする"
                        onClick={() => selectTarget(vi)}
                      >
                        <span className={cn('size-2 shrink-0 rounded-full', VOICE_STYLE[vi].dot)} />
                        {voiceLabel(vi)}
                      </button>
                    </div>
                  </div>

                  {/* 段。拍の線は段ごとに引き、広い画面では上下の段で途切れずにつながるようにする */}
                  <div
                    className={cn(
                      'relative min-w-0 transition-opacity [grid-area:lane] sm:pt-3',
                      v.muted && 'opacity-35',
                    )}
                  >
                    {overflow && (
                      // はみ出した部分。音のブロックの後ろに敷く
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0 right-0 border-l-2 border-destructive/70 bg-destructive/10"
                        style={{ left: pct(length) }}
                      />
                    )}
                    {/* 狭い画面では段ごとに拍番号を出す。ラベルの行で上の拍番号から離れてしまうため */}
                    <div className="sm:hidden">
                      <BeatNumbers beats={beats} pct={pct} />
                    </div>
                    {/* 狭い画面では縦に詰める。横幅が広がったぶん、高さを抑えても押しやすさは保てる */}
                  <div className="relative h-8 sm:h-12" onClick={() => selectTarget(vi)}>
                      {blocks.length === 0 && (
                        <p className="absolute inset-0 z-10 flex items-center justify-center">
                          {/* 拍の線が文字に重ならないよう、背景を敷く */}
                          <span className="rounded-sm bg-card px-2 text-sm text-muted-foreground">
                            {vi === target ? '下のボタンで音符を追加' : '空'}
                          </span>
                        </p>
                      )}
                      {blocks.map((b) => {
                        const ev = events.get(b.key)
                        // ミュート中の段は鳴らないので、再生位置も光らせない
                        const active = !v.muted && activeKeys.includes(b.key)
                        const item = v.items[b.item]
                        return (
                          <div
                            key={b.key}
                            className="absolute inset-y-0 px-0.5"
                            style={{ left: pct(b.start), width: pct(b.dur) }}
                          >
                            {/* 色が半透明なので、下に不透明な地を敷く */}
                            <div aria-hidden className="absolute inset-y-0 inset-x-0.5 rounded-md bg-card" />
                            {/* クリックすると、割る・休符・削除のメニューを開く */}
                            <Popover
                              open={menuKey === b.key}
                              onOpenChange={(open) => setMenuKey(open ? b.key : null)}
                            >
                              <PopoverTrigger
                                render={
                                  <button
                                    type="button"
                                    onPointerDown={(e) => {
                                      lastPointer.current = e.pointerType
                                    }}
                                    // 右クリックはメニューを開かずにすぐ消す。連符の中の音なら連符ごと。
                                    // スマホの長押しも右クリック扱いになるが、誤って消えないようそちらでは消さない
                                    onContextMenu={(e) => {
                                      e.preventDefault()
                                      if (lastPointer.current === 'touch') return
                                      setMenuKey(null)
                                      setVoiceItems(
                                        vi,
                                        v.items.filter((_, k) => k !== b.item),
                                      )
                                    }}
                                    aria-label={`${noteName(item.kind === 'note' ? item : item.notes[b.sub])}${item.kind === 'tuplet' ? `（${itemName(item)}）` : ''}${b.rest ? 'の休符' : ''}`}
                                    className={cn(
                                      'relative size-full rounded-md transition-colors',
                                      b.rest
                                        ? 'border-2 border-dashed border-foreground/25 hover:border-foreground/40'
                                        : style.accent[effectiveAccent(ev?.accent ?? 'sub', accentDownbeat)],
                                      ev?.overflow && !b.rest && 'bg-destructive/40 hover:bg-destructive/50',
                                      active && (b.rest ? 'border-foreground/60' : style.active),
                                      // メニューを開いているブロックは枠で示す
                                      menuKey === b.key && 'ring-2 ring-foreground/70',
                                    )}
                                  />
                                }
                              />
                              <PopoverContent className="w-56 p-1" side="bottom" align="start">
                                <NoteMenu
                                  items={v.items}
                                  note={b}
                                  onChange={(items) => {
                                    setVoiceItems(vi, items)
                                    setMenuKey(null)
                                  }}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                        )
                      })}
                      {vi === target &&
                        preview &&
                        fits(preview) &&
                        // 押したときに置かれる位置を点線で仮表示する
                        ghostNotes(contentLength(v), preview).map((g, k) => (
                          <div
                            key={`ghost-${k}`}
                            aria-hidden
                            className="pointer-events-none absolute inset-y-0 px-0.5"
                            style={{ left: pct(g.start), width: pct(g.dur) }}
                          >
                            <div className={cn('size-full rounded-md border-2 border-dashed', VOICE_STYLE[vi].ghost)} />
                          </div>
                        ))}
                    </div>
                    {/* 連符の括弧と数字。数字は拍の線より手前に出す（2拍3連だと真ん中が拍の線に重なる） */}
                    <div className="relative h-5">
                      {groups.map((g) => (
                        <div
                          key={g.item}
                          aria-hidden
                          className="absolute top-1.5 h-2 rounded-b-sm border-x border-b border-muted-foreground/60"
                          style={{ left: `calc(${pct(g.start)} + 6px)`, width: `calc(${pct(g.len)} - 12px)` }}
                        >
                          <span className="absolute top-0 left-1/2 z-10 -translate-x-1/2 bg-card px-1 text-xs leading-none text-muted-foreground italic">
                            {g.label}
                          </span>
                        </div>
                      ))}
                    </div>
                    <BeatLines beats={beats} pct={pct} />
                  </div>

                  {/* 段を空にするボタン */}
                  <div className="flex h-12 items-center [grid-area:erase] sm:mt-3">
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={`${voiceLabel(vi)}を空にする`}
                      title={`${voiceLabel(vi)}を空にする`}
                      disabled={v.items.length === 0}
                      onClick={() => setVoiceItems(vi, [])}
                    >
                      <Eraser />
                    </Button>
                  </div>
                </div>
              </Fragment>
            )
          })}
        </div>

        {multi && (
          <div className="flex gap-2">
            <div className={cn('hidden shrink-0 sm:block', labelCol)} />
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              <p>ブロックをクリックすると、割る・休符・削除ができます（右クリックですぐ削除）。</p>
              <p>
                下のボタンは
                <span className="mx-1 inline-flex items-center gap-1 font-medium text-foreground">
                  <span className={cn('size-2 rounded-full', VOICE_STYLE[target].dot)} />
                  {voiceLabel(target)}
                </span>
                に追加されます
              </p>
            </div>
          </div>
        )}
        <div className="flex items-start gap-2">
          <span className={cn('shrink-0 pt-3 pl-2 text-xs text-muted-foreground', labelCol)}>1拍</span>
          <div className="flex flex-wrap gap-1">
            {BEAT_PATTERNS.map((p) => (
              <Button
                key={p.name}
                variant="outline"
                title={p.name}
                aria-label={`${p.name}を1拍追加`}
                className={PALETTE_BUTTON}
                disabled={!fits(p.make())}
                onClick={() => addItems(p.make())}
                onPointerEnter={() => setPreview(p.make())}
                onPointerLeave={() => setPreview(null)}
              >
                <Notation items={p.make()} height={30} />
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-start gap-2">
          <span className={cn('shrink-0 pt-3 pl-2 text-xs text-muted-foreground', labelCol)}>音符</span>
          <div className="flex flex-wrap gap-1">
            {PALETTE.map((p) => (
              <Button
                key={p.label}
                variant="outline"
                title={p.label}
                aria-label={`${p.label}を追加`}
                className={PALETTE_BUTTON}
                disabled={!fits([p.make()])}
                onClick={() => addItems([p.make()])}
                onPointerEnter={() => setPreview([p.make()])}
                onPointerLeave={() => setPreview(null)}
              >
                <Notation items={[p.make()]} height={30} />
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
