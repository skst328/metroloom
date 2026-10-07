import type { Accent } from './rhythm'

// 音色はすべてブラウザ内で合成する。音源ファイルは使わない
export type SoundId = 'beep-high' | 'beep-low' | 'woodblock' | 'click' | 'cowbell'

export const SOUNDS: { id: SoundId; name: string }[] = [
  { id: 'beep-high', name: '電子音（高）' },
  { id: 'beep-low', name: '電子音（低）' },
  { id: 'woodblock', name: 'ウッドブロック' },
  { id: 'click', name: 'クリック' },
  { id: 'cowbell', name: 'カウベル' },
]

// 強さごとの音量（ピーク）と、音の高さの倍率。強い音ほど少し高くする
const LEVEL: Record<Accent, { gain: number; pitch: number }> = {
  downbeat: { gain: 0.9, pitch: 4 / 3 },
  beat: { gain: 0.6, pitch: 1 },
  sub: { gain: 0.25, pitch: 3 / 4 },
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>()

function noise(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseBuffers.get(ctx)
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    noiseBuffers.set(ctx, buf)
  }
  return buf
}

// peak から decay 秒で消える音量の山を作る
function envelope(ctx: BaseAudioContext, time: number, peak: number, decay: number): GainNode {
  const g = ctx.createGain()
  g.gain.setValueAtTime(peak, time)
  g.gain.exponentialRampToValueAtTime(0.001, time + decay)
  return g
}

function tone(
  ctx: BaseAudioContext,
  out: AudioNode,
  time: number,
  type: OscillatorType,
  freq: number,
  peak: number,
  decay: number,
) {
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.value = freq
  osc.connect(envelope(ctx, time, peak, decay)).connect(out)
  osc.start(time)
  osc.stop(time + decay + 0.01)
}

export function playSound(
  ctx: BaseAudioContext,
  out: AudioNode,
  id: SoundId,
  time: number,
  accent: Accent,
  volume: number,
) {
  const { gain, pitch } = LEVEL[accent]
  const peak = gain * volume
  switch (id) {
    case 'beep-high':
      tone(ctx, out, time, 'sine', 1320 * pitch, peak, 0.05)
      break
    case 'beep-low':
      // 電子音（高）の完全 5 度下
      tone(ctx, out, time, 'sine', 880 * pitch, peak, 0.05)
      break
    case 'woodblock': {
      // 短く減衰する高めの音に、ごく短いノイズで叩いた感じを足す
      tone(ctx, out, time, 'sine', 1000 * pitch, peak, 0.04)
      const src = ctx.createBufferSource()
      src.buffer = noise(ctx)
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 2000 * pitch
      bp.Q.value = 3
      src.connect(bp).connect(envelope(ctx, time, peak * 0.6, 0.012)).connect(out)
      src.start(time)
      src.stop(time + 0.02)
      break
    }
    case 'click': {
      // 高域だけ残したノイズを一瞬だけ鳴らす
      const src = ctx.createBufferSource()
      src.buffer = noise(ctx)
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 3000 * pitch
      src.connect(hp).connect(envelope(ctx, time, peak * 1.5, 0.015)).connect(out)
      src.start(time)
      src.stop(time + 0.025)
      break
    }
    case 'cowbell': {
      // 2 つの矩形波を帯域で絞る、よくある合成カウベル。余韻が長いぶん、ほかの音色と大きさがそろうよう控えめにする
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 800 * pitch
      bp.Q.value = 1.5
      bp.connect(out)
      for (const f of [540, 800]) tone(ctx, bp, time, 'square', f * pitch, peak * 0.33, 0.25)
      break
    }
  }
}
