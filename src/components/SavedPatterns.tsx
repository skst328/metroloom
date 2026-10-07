import { Pencil, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { SavedPattern } from '@/lib/saved-patterns'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  list: SavedPattern[]
  onSave: (name: string) => void
  onOverwrite: (id: string) => void
  onLoad: (entry: SavedPattern) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

// 上書きと削除は元に戻せないので、その行で確かめてから実行する
type Confirm = { id: string; kind: 'overwrite' | 'delete' }

export function SavedPatterns({
  open,
  onOpenChange,
  list,
  onSave,
  onOverwrite,
  onLoad,
  onRename,
  onDelete,
}: Props) {
  const [name, setName] = useState('')
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)

  // 段の名前（リズム1・2）と紛らわしくないよう「パターン」にする
  const defaultName = `パターン${list.length + 1}`
  const save = () => {
    onSave(name.trim() || defaultName)
    setName('')
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        // 閉じたら、途中だった確認や名前の変更は取り消す
        if (!o) {
          setConfirm(null)
          setRenaming(null)
        }
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>リズムパターン</DialogTitle>
          <DialogDescription>今設定されているリズムパターンを保存します。</DialogDescription>
        </DialogHeader>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <Input
            aria-label="保存する名前"
            placeholder={defaultName}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" className="shrink-0">
            <Save />
            保存
          </Button>
        </form>

        {list.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">まだ保存したリズムパターンはありません</p>
        ) : (
          <ul className="-mx-1 flex max-h-[50vh] flex-col divide-y overflow-y-auto px-1">
            {list.map((e) => (
              // 狭い画面では、名前（確認の文）とボタンを 2 行に分ける
              <li key={e.id} className="flex min-h-12 flex-col gap-2 py-2 sm:flex-row sm:items-center">
                {confirm?.id === e.id ? (
                  <>
                    <p className="min-w-0 flex-1 text-sm">
                      {confirm.kind === 'delete'
                        ? `「${e.name}」を削除しますか？`
                        : `「${e.name}」を今のリズムパターンで上書きしますか？`}
                    </p>
                    <div className="flex shrink-0 items-center justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setConfirm(null)}>
                        やめる
                      </Button>
                      <Button
                        variant={confirm.kind === 'delete' ? 'destructive' : 'default'}
                        size="sm"
                        onClick={() => {
                          if (confirm.kind === 'delete') onDelete(e.id)
                          else onOverwrite(e.id)
                          setConfirm(null)
                        }}
                      >
                        {confirm.kind === 'delete' ? '削除' : '上書き'}
                      </Button>
                    </div>
                  </>
                ) : renaming?.id === e.id ? (
                  <form
                    className="flex flex-1 gap-2"
                    onSubmit={(ev) => {
                      ev.preventDefault()
                      if (renaming.name.trim()) onRename(e.id, renaming.name.trim())
                      setRenaming(null)
                    }}
                  >
                    <Input
                      aria-label="新しい名前"
                      autoFocus
                      value={renaming.name}
                      onChange={(ev) => setRenaming({ id: e.id, name: ev.target.value })}
                    />
                    <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setRenaming(null)}>
                      やめる
                    </Button>
                    <Button type="submit" size="sm" className="h-8">
                      変更
                    </Button>
                  </form>
                ) : (
                  <>
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">{e.name}</p>
                    <div className="flex shrink-0 items-center justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => onLoad(e)}>
                        呼び出す
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`「${e.name}」を今のリズムパターンで上書き`}
                        title="今のリズムパターンで上書き"
                        onClick={() => setConfirm({ id: e.id, kind: 'overwrite' })}
                      >
                        上書き
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`「${e.name}」の名前を変える`}
                        title="名前を変える"
                        onClick={() => setRenaming({ id: e.id, name: e.name })}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`「${e.name}」を削除`}
                        title="削除"
                        onClick={() => setConfirm({ id: e.id, kind: 'delete' })}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
