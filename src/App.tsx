import { FolderOpen, Minus, Play, Plus, Settings, Square } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { MeasureEditor } from '@/components/MeasureEditor'
import { Notation } from '@/components/Notation'
import { SavedPatterns } from '@/components/SavedPatterns'
import { SoundSettings } from '@/components/SoundSettings'
import { ThemeToggle } from '@/components/ThemeToggle'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { useMetronome } from '@/hooks/useMetronome'
import { matchPreset, PRESETS } from '@/lib/presets'
import { copyPattern, type SavedPattern, snapshot, useSavedPatterns } from '@/lib/saved-patterns'
import { useSoundSettings } from '@/lib/sound-settings'
import { DEFAULT_BEATS, measure, type Pattern } from '@/lib/rhythm'
import { BPM_MAX, BPM_MIN } from '@/lib/tempo'

// 1 行目は基本形、2 行目はその変形
const PRESET_ROWS = [
  [0, 1, 2, 3, 4, 5],
  [6, 7, 8, 9, 10],
]

const BEATS_MIN = 1
const BEATS_MAX = 12

// 入力中・ボタン上のスペースはそちらに任せる
function isInteractive(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest('input, textarea, button, [role="slider"], [role="switch"], [role="alertdialog"], [role="dialog"]')
}

// 拍のドット。今鳴っている拍が光る
function BeatDots({
  beats,
  current,
  accentDownbeat,
  className,
}: {
  beats: number
  current: number | undefined
  accentDownbeat: boolean
  className?: string
}) {
  return (
    <div className={cn('flex h-4 items-center gap-2', className)} aria-hidden>
      {Array.from({ length: beats }, (_, i) => (
        <span
          key={i}
          className={cn(
            // ライトでは muted が背景の白とほぼ同じで見えないので、文字色を薄く混ぜた色にする
            'rounded-full bg-foreground/15 transition-colors duration-75 dark:bg-muted',
            i === 0 && accentDownbeat ? 'size-4' : 'size-3',
            current === i && 'bg-primary dark:bg-primary',
          )}
        />
      ))}
    </div>
  )
}

function App() {
  // 開いたときは普通のメトロノームと同じく、4 分音符で拍ごとに鳴る状態から始める
  const [pattern, setPattern] = useState<Pattern>(() => PRESETS[0].build(DEFAULT_BEATS))
  const [bpm, setBpm] = useState(60)
  const [accentDownbeat, setAccentDownbeat] = useState(false)
  // リズム1・2 ごとの音色と音量。全小節に共通で、リロードしても残す
  const { sounds, volumes, setSounds, setVolumes } = useSoundSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)
  // 手で編集したパターンを上書きする前の確認待ちのプリセット
  // 編集したリズムを上書きする前の確認待ち。テンプレートと保存したリズムパターンの呼び出しで使う
  const [pendingReplace, setPendingReplace] = useState<{ name: string; apply: () => void } | null>(null)
  // 保存したリズムパターン
  const saved = useSavedPatterns()
  const [savedOpen, setSavedOpen] = useState(false)
  // 最後に保存・呼び出したときのリズム。ここから変わっていなければ、置き換えても確認しない
  const [cleanSnapshot, setCleanSnapshot] = useState<string | null>(null)
  const mutedVoices = useMemo(
    () => new Set(pattern.measures.flatMap((m) => m.voices.filter((v) => v.muted).map((v) => v.id))),
    [pattern],
  )
  const { playing, position, toggle, preview } = useMetronome(
    pattern,
    bpm,
    accentDownbeat,
    mutedVoices,
    volumes,
    sounds,
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isInteractive(e.target)) return
      e.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const setMeasures = (measures: Pattern['measures']) => setPattern({ ...pattern, measures })
  const selected = matchPreset(pattern)
  // テンプレートどおりでも空でもなく、保存・呼び出し後から変わっているとき
  const edited =
    selected < 0 &&
    pattern.measures.some((m) => m.voices.some((v) => v.items.length > 0)) &&
    snapshot(pattern) !== cleanSnapshot

  // プリセットどおりの間は、拍数を変えたらそのリズムで埋め直す
  const setBeats = (beats: number) =>
    setPattern(selected >= 0 ? PRESETS[selected].build(beats) : { ...pattern, beats })

  const applyPreset = (i: number) => setPattern(PRESETS[i].build(pattern.beats))
  const saveCurrent = (name: string) => {
    saved.add({ name, pattern: copyPattern(pattern), bpm, accentDownbeat })
    setCleanSnapshot(snapshot(pattern))
  }
  const overwriteSaved = (id: string) => {
    saved.update(id, { pattern: copyPattern(pattern), bpm, accentDownbeat, savedAt: Date.now() })
    setCleanSnapshot(snapshot(pattern))
  }
  const loadSaved = (entry: SavedPattern) => {
    const apply = () => {
      setPattern(copyPattern(entry.pattern))
      setBpm(entry.bpm)
      setAccentDownbeat(entry.accentDownbeat)
      setCleanSnapshot(snapshot(entry.pattern))
    }
    setSavedOpen(false)
    if (edited) setPendingReplace({ name: entry.name, apply })
    else apply()
  }

  const choosePreset = (i: number) => {
    if (i === selected) return
    if (edited) setPendingReplace({ name: `${PRESETS[i].name}の1小節`, apply: () => applyPreset(i) })
    else applyPreset(i)
  }

  return (
    <>
      {/* 再生ボタンなどは常に画面の上端に固定する。不透明にして、中身はこの帯の下に見えるようにする */}
      <header className="sticky top-0 z-40 border-b bg-background">
        {/* スマホでもはみ出さないよう、狭い画面では詰めて並べる */}
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2 sm:gap-4 sm:px-8">
          <Button className="w-20 shrink-0 sm:w-24" title="スペースキーでも再生・停止できます" onClick={toggle}>
            {playing ? <Square /> : <Play />}
            {playing ? '停止' : '再生'}
          </Button>
          <span className="flex shrink-0 items-baseline gap-1.5">
            <span className="font-heading text-2xl font-bold tabular-nums">{bpm}</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">BPM</span>
          </span>
          {/* 拍数が多いと 1 行に収まらないので、折り返せるようにする */}
          <BeatDots
            className="h-auto min-w-0 flex-wrap gap-1.5 sm:gap-2"
            beats={pattern.beats}
            current={position?.beat}
            accentDownbeat={accentDownbeat}
          />
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Button
              variant="outline"
              size="icon"
              className="size-9 sm:size-10 [&_svg:not([class*=size-])]:size-5"
              aria-label="リズムパターン"
              title="リズムパターンの保存・呼び出し"
              onClick={() => setSavedOpen(true)}
            >
              <FolderOpen />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-9 sm:size-10 [&_svg:not([class*=size-])]:size-5"
              aria-label="音の設定"
              title="音の設定"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings />
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-8">
        <h1 className="flex items-baseline gap-2 font-heading text-xl font-bold">
          Metroloom
          <span className="text-sm font-normal text-muted-foreground tabular-nums">v{__APP_VERSION__}</span>
        </h1>
        <Card>
          <CardContent className="flex flex-col items-center gap-5 py-4">
            <div className="flex flex-col items-center">
              <span className="text-xs font-medium tracking-widest text-muted-foreground">BPM</span>
              <span className="font-heading text-7xl font-bold tabular-nums">{bpm}</span>
            </div>

            <div className="flex w-full items-center justify-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="rounded-full"
                aria-label="BPMを下げる"
                disabled={bpm <= BPM_MIN}
                onClick={() => setBpm(Math.max(BPM_MIN, bpm - 1))}
              >
                <Minus />
              </Button>
              <Slider
                aria-label="BPM"
                min={BPM_MIN}
                max={BPM_MAX}
                value={[bpm]}
                onValueChange={(v) => setBpm(Array.isArray(v) ? v[0] : v)}
                // 付属の Slider は細いので、トラックとつまみを太くする
                className="max-w-xl min-w-0 flex-1 [&_[data-slot=slider-thumb]]:size-5 [&_[data-slot=slider-track]]:data-horizontal:h-2"
              />
              <Button
                variant="outline"
                size="icon"
                className="rounded-full"
                aria-label="BPMを上げる"
                disabled={bpm >= BPM_MAX}
                onClick={() => setBpm(Math.min(BPM_MAX, bpm + 1))}
              >
                <Plus />
              </Button>
            </div>

            {/* 設定は「左にラベル、右に操作」の行で揃える */}
            <div className="w-full max-w-xl divide-y border-y text-sm">
              <div className="flex h-12 items-center justify-between">
                <span>拍</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="rounded-full"
                    aria-label="拍を減らす"
                    disabled={pattern.beats <= BEATS_MIN}
                    onClick={() => setBeats(pattern.beats - 1)}
                  >
                    <Minus />
                  </Button>
                  <span className="w-6 text-center text-base font-semibold tabular-nums">
                    {pattern.beats}
                  </span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="rounded-full"
                    aria-label="拍を増やす"
                    disabled={pattern.beats >= BEATS_MAX}
                    onClick={() => setBeats(pattern.beats + 1)}
                  >
                    <Plus />
                  </Button>
                </div>
              </div>
              <label className="flex h-12 cursor-pointer items-center justify-between">
                <span>小節の頭を強く鳴らす</span>
                <Switch checked={accentDownbeat} onCheckedChange={setAccentDownbeat} />
              </label>
              <div className="flex flex-col gap-2 py-3">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  テンプレート
                  <span className="text-xs text-muted-foreground">全拍で繰り返す</span>
                </span>
                {PRESET_ROWS.map((row) => (
                  <div key={row[0]} className="flex flex-wrap justify-center gap-1">
                    {row.map((i) => (
                      <Button
                        key={i}
                        variant="ghost"
                        title={PRESETS[i].name}
                        aria-label={PRESETS[i].name}
                        aria-pressed={i === selected}
                        className={cn(
                          'h-12 w-20',
                          i === selected &&
                            'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground dark:hover:bg-primary/90',
                        )}
                        onClick={() => choosePreset(i)}
                      >
                        <Notation items={PRESETS[i].icon} height={32} />
                      </Button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {pattern.measures.map((m, i) => (
          <MeasureEditor
            key={m.id}
            measure={m}
            beats={pattern.beats}
            accentDownbeat={accentDownbeat}
            index={i}
            numbered={pattern.measures.length > 1}
            activeKeys={position?.keys ?? []}
            playing={playing}
            canRemove={pattern.measures.length > 1}
            onChange={(next) => setMeasures(pattern.measures.map((x) => (x.id === m.id ? next : x)))}
            onRemove={() => setMeasures(pattern.measures.filter((x) => x.id !== m.id))}
          />
        ))}

        <Button variant="outline" onClick={() => setMeasures([...pattern.measures, measure([])])}>
          <Plus />
          小節を追加
        </Button>

        <SavedPatterns
          open={savedOpen}
          onOpenChange={setSavedOpen}
          list={saved.list}
          onSave={saveCurrent}
          onOverwrite={overwriteSaved}
          onLoad={loadSaved}
          onRename={(id, name) => saved.update(id, { name })}
          onDelete={saved.remove}
        />

        <SoundSettings
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          sounds={sounds}
          onSoundsChange={setSounds}
          volumes={volumes}
          onVolumesChange={setVolumes}
          onPreview={preview}
        />

        <AlertDialog
          open={pendingReplace !== null}
          onOpenChange={(open) => !open && setPendingReplace(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>編集したリズムパターンを置き換えますか？</AlertDialogTitle>
              <AlertDialogDescription>
                保存していない今のリズムパターンは消えて、「{pendingReplace?.name}」に置き換わります。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>やめる</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  pendingReplace?.apply()
                  setPendingReplace(null)
                }}
              >
                置き換える
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </>
  )
}

export default App
