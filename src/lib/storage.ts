// GitHub Pages では、同じドメインに置いたほかのアプリと localStorage を共有する
// （URL のパスではなく、ドメイン単位で分かれるため）。ぶつからないよう、キーの頭にアプリ名を付ける
export function storageKey(name: string): string {
  return `metroloom:${name}`
}

// アプリ名を付ける前のキーに保存されていれば、新しいキーへ移して読む。
// 読み書きできないとき（プライベートウィンドウなど）は呼び出し側で扱う
export function readMigrated(name: string, legacyKey: string): string | null {
  const key = storageKey(name)
  const value = localStorage.getItem(key)
  if (value !== null) return value
  const legacy = localStorage.getItem(legacyKey)
  if (legacy !== null) {
    localStorage.setItem(key, legacy)
    localStorage.removeItem(legacyKey)
  }
  return legacy
}
