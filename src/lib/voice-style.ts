import type { Accent } from './rhythm'

// 声部ごとの色。1 段目はアクセントカラー、2 段目は聞き分けと同じく別の色にする
export const VOICE_STYLE: {
  accent: Record<Accent, string>
  active: string
  dot: string
  frame: string
  // 音符ボタンにマウスを乗せたときの、置かれる位置の仮表示
  ghost: string
}[] = [
  {
    accent: {
      downbeat: 'bg-primary/75 hover:bg-primary/85',
      beat: 'bg-primary/50 hover:bg-primary/60',
      sub: 'bg-foreground/20 hover:bg-foreground/30',
    },
    active: 'bg-primary hover:bg-primary',
    dot: 'bg-primary',
    frame: 'border-primary',
    ghost: 'border-primary/80 bg-primary/10',
  },
  {
    accent: {
      downbeat: 'bg-amber-500/85 hover:bg-amber-500/95',
      beat: 'bg-amber-500/60 hover:bg-amber-500/70',
      sub: 'bg-amber-500/25 hover:bg-amber-500/35',
    },
    active: 'bg-amber-400 hover:bg-amber-400',
    dot: 'bg-amber-500',
    frame: 'border-amber-500',
    ghost: 'border-amber-500/80 bg-amber-500/10',
  },
]
