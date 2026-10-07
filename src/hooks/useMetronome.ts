import { useEffect, useState } from 'react'
import { Metronome, type Position } from '@/lib/metronome'
import type { Pattern } from '@/lib/rhythm'
import type { SoundId } from '@/lib/sounds'

export function useMetronome(
  pattern: Pattern,
  bpm: number,
  accentDownbeat: boolean,
  muted: Set<string>,
  volumes: number[],
  sounds: SoundId[],
) {
  const [engine] = useState(() => new Metronome())
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState<Position | null>(null)

  useEffect(() => engine.setPattern(pattern), [engine, pattern])

  useEffect(() => engine.setBpm(bpm), [engine, bpm])

  useEffect(() => engine.setAccentDownbeat(accentDownbeat), [engine, accentDownbeat])

  useEffect(() => engine.setMuted(muted), [engine, muted])

  useEffect(() => engine.setVolumes(volumes), [engine, volumes])

  useEffect(() => engine.setSounds(sounds), [engine, sounds])

  useEffect(() => () => engine.stop(), [engine])

  // ページを最初に触った時点で音の仕組みを起動しておき、再生ボタンを押してからの遅れをなくす
  useEffect(() => {
    const warmUp = () => void engine.warmUp()
    window.addEventListener('pointerdown', warmUp, { once: true })
    window.addEventListener('keydown', warmUp, { once: true })
    return () => {
      window.removeEventListener('pointerdown', warmUp)
      window.removeEventListener('keydown', warmUp)
    }
  }, [engine])

  // 再生位置は描画フレームごとにオーディオクロックから引く
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const loop = () => {
      setPosition(engine.current())
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [engine, playing])

  async function toggle() {
    if (engine.playing) {
      engine.stop()
      setPlaying(false)
      setPosition(null)
    } else {
      await engine.start(pattern)
      setPlaying(true)
    }
  }

  const preview = (sound: SoundId, volume: number) => engine.preview(sound, volume)

  return { playing, position, toggle, preview }
}
