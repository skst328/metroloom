import { toNumber } from './fraction'
import { type Accent, effectiveAccent, flatten, type Pattern, type RhythmEvent } from './rhythm'
import { playSound, type SoundId } from './sounds'

// 先読みスケジューラ。setInterval で定期的に起き、少し先までの音を
// AudioContext の時刻で予約する。発音タイミングはオーディオクロックが保証する
const TICK_MS = 25
const LOOKAHEAD_SEC = 0.1
const START_DELAY_SEC = 0.05

// 今鳴っている位置。keys は声部ごとに直近で鳴った音
export type Position = { keys: string[]; measure: number; beat: number }

type Scheduled = Pick<RhythmEvent, 'key' | 'voice' | 'measure' | 'beat'> & { time: number }

export class Metronome {
  private ctx: AudioContext | null = null
  private timer: number | undefined
  private events: RhythmEvent[] = []
  private length = 0
  private pending: Pattern | null = null
  private index = 0
  private nextTime = 0
  private queue: Scheduled[] = []
  private position: Position | null = null
  private bpm = 120
  private accentDownbeat = false
  private muted = new Set<string>()
  // 声部（リズム1・2）ごとの音量。0〜1
  private volumes: number[] = []
  // 声部（リズム1・2）ごとの音色
  private sounds: SoundId[] = []

  get playing(): boolean {
    return this.timer !== undefined
  }

  // 音を出す仕組みを先に起動しておく。初回の起動には時間がかかることがあり、
  // 再生ボタンを押してから作ると最初の音が遅れるため。ブラウザの決まりで、ユーザーの操作の中で呼ぶ必要がある
  warmUp(): Promise<void> {
    this.ctx ??= new AudioContext()
    return this.ctx.resume()
  }

  async start(pattern: Pattern): Promise<void> {
    if (this.playing) return
    await this.warmUp()
    const ctx = this.ctx!
    this.load(pattern)
    this.pending = null
    this.index = 0
    this.nextTime = ctx.currentTime + START_DELAY_SEC
    this.queue = []
    this.position = null
    this.timer = window.setInterval(() => this.tick(), TICK_MS)
    this.tick()
  }

  stop(): void {
    window.clearInterval(this.timer)
    this.timer = undefined
    this.queue = []
    this.position = null
  }

  // 次に予約する音から反映される
  setBpm(bpm: number): void {
    this.bpm = bpm
  }

  setAccentDownbeat(on: boolean): void {
    this.accentDownbeat = on
  }

  // 次に予約する音から反映される
  setVolumes(volumes: number[]): void {
    this.volumes = volumes
  }

  setSounds(sounds: SoundId[]): void {
    this.sounds = sounds
  }

  // 設定画面で音色を選んだときの試し鳴らし。再生中でなくても鳴らす
  async preview(sound: SoundId, volume: number): Promise<void> {
    this.ctx ??= new AudioContext()
    await this.ctx.resume()
    playSound(this.ctx, this.ctx.destination, sound, this.ctx.currentTime + 0.01, 'beat', volume)
  }

  // ミュートした声部の id。パターンの変更と違ってループの切れ目を待たず、次に予約する音から反映する
  setMuted(muted: Set<string>): void {
    this.muted = muted
  }

  // 再生中の変更はループの切れ目で反映する。途中で差し替えると位置がずれるため
  setPattern(pattern: Pattern): void {
    if (!this.playing) {
      this.load(pattern)
    } else if (this.events.length === 0) {
      this.load(pattern)
      this.index = 0
      this.nextTime = this.ctx!.currentTime + START_DELAY_SEC
    } else {
      this.pending = pattern
    }
  }

  // 今鳴っている位置。描画ループから毎フレーム呼ぶ。変化がなければ同じオブジェクトを返す
  current(): Position | null {
    if (!this.ctx || !this.playing) return null
    const now = this.ctx.currentTime
    let next = this.position
    while (this.queue.length > 0 && this.queue[0].time <= now) {
      const ev = this.queue.shift()!
      // 小節が変わったら前の小節の音は消す
      const keys = next && next.measure === ev.measure ? [...next.keys] : []
      keys[ev.voice] = ev.key
      next = { keys, measure: ev.measure, beat: ev.beat }
    }
    this.position = next
    return next
  }

  private load(pattern: Pattern): void {
    const { events, length } = flatten(pattern)
    this.events = events
    this.length = toNumber(length)
  }

  private tick(): void {
    const ctx = this.ctx!
    while (this.events.length > 0 && this.nextTime < ctx.currentTime + LOOKAHEAD_SEC) {
      const ev = this.events[this.index]
      // ミュート中も再生位置の表示は続けるので、鳴らさないだけで queue には積む
      const volume = this.volumes[ev.voice] ?? 1
      if (!ev.rest && !this.muted.has(ev.voiceId) && volume > 0) this.click(this.nextTime, effectiveAccent(ev.accent, this.accentDownbeat), ev.voice, volume)
      this.queue.push({ time: this.nextTime, key: ev.key, voice: ev.voice, measure: ev.measure, beat: ev.beat })

      const next = this.events[this.index + 1]
      const gap = (next ? toNumber(next.start) : this.length) - toNumber(ev.start)
      // 全音符 = 4 拍。BPM は 4 分音符基準
      this.nextTime += gap * (240 / this.bpm)
      this.index++

      if (this.index >= this.events.length) {
        this.index = 0
        if (this.pending) {
          this.load(this.pending)
          this.pending = null
        }
      }
    }
  }

  private click(time: number, accent: Accent, voice: number, volume: number): void {
    const ctx = this.ctx!
    playSound(ctx, ctx.destination, this.sounds[voice] ?? 'beep-high', time, accent, volume)
  }
}
