import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { type SoundId, SOUNDS } from '@/lib/sounds'
import { VOICE_STYLE } from '@/lib/voice-style'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  sounds: SoundId[]
  onSoundsChange: (sounds: SoundId[]) => void
  volumes: number[]
  onVolumesChange: (volumes: number[]) => void
  onPreview: (sound: SoundId, volume: number) => void
}

export function SoundSettings({
  open,
  onOpenChange,
  sounds,
  onSoundsChange,
  volumes,
  onVolumesChange,
  onPreview,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>音の設定</DialogTitle>
          <DialogDescription>リズムごとの音色と音量です。全部の小節に共通です。</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col divide-y">
          {sounds.map((sound, vi) => {
            const volume = volumes[vi]
            return (
              <section key={vi} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <span className={cn('size-2 rounded-full', VOICE_STYLE[vi].dot)} />
                  リズム{vi + 1}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {SOUNDS.map((s) => (
                    <Button
                      key={s.id}
                      variant="outline"
                      size="sm"
                      aria-pressed={s.id === sound}
                      className={cn(
                        s.id === sound &&
                          'border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground dark:border-primary dark:bg-primary dark:hover:bg-primary/90',
                      )}
                      onClick={() => {
                        onSoundsChange(sounds.map((x, k) => (k === vi ? s.id : x)))
                        onPreview(s.id, volume)
                      }}
                    >
                      {s.name}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-8 shrink-0 text-sm text-muted-foreground">音量</span>
                  <Slider
                    aria-label={`リズム${vi + 1}の音量`}
                    min={0}
                    max={100}
                    value={[Math.round(volume * 100)]}
                    onValueChange={(v) => {
                      const next = (Array.isArray(v) ? v[0] : v) / 100
                      onVolumesChange(volumes.map((x, k) => (k === vi ? next : x)))
                    }}
                  />
                  <span className="w-10 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
                    {Math.round(volume * 100)}%
                  </span>
                </div>
              </section>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
