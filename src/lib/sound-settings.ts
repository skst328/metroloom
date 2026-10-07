import { useEffect, useState } from 'react'
import { type SoundId, SOUNDS } from './sounds'

// 音色と音量だけ、リロードしても残るよう localStorage に保存する
const STORAGE_KEY = 'soundSettings'

export type SoundSettings = { sounds: SoundId[]; volumes: number[] }

// 初期値は今までの音（電子音の高・低）と、100% の音量
const DEFAULT: SoundSettings = { sounds: ['beep-high', 'beep-low'], volumes: [1, 1] }

const SOUND_IDS = new Set<string>(SOUNDS.map((s) => s.id))

// 保存した値が壊れている・形が古いときは、その項目だけ初期値に戻す
function readSettings(): SoundSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT
    const { sounds, volumes } = parsed as Partial<Record<keyof SoundSettings, unknown>>
    return {
      sounds: DEFAULT.sounds.map((d, i) =>
        Array.isArray(sounds) && SOUND_IDS.has(sounds[i]) ? (sounds[i] as SoundId) : d,
      ),
      volumes: DEFAULT.volumes.map((d, i) => {
        const v = Array.isArray(volumes) ? volumes[i] : undefined
        return typeof v === 'number' && v >= 0 && v <= 1 ? v : d
      }),
    }
  } catch {
    // プライベートウィンドウなどでは読めないことがある
    return DEFAULT
  }
}

export function useSoundSettings() {
  const [settings, setSettings] = useState(readSettings)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // 保存できなくても、このページを開いている間は設定どおりに鳴る
    }
  }, [settings])

  return {
    sounds: settings.sounds,
    volumes: settings.volumes,
    setSounds: (sounds: SoundId[]) => setSettings((s) => ({ ...s, sounds })),
    setVolumes: (volumes: number[]) => setSettings((s) => ({ ...s, volumes })),
  }
}
