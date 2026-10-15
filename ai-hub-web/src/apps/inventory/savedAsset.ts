export function findSavedAsset<T extends { assetNo: string }>(results: Record<string, T>, aliases: string[]) {
  const key = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const wanted = new Set(aliases.map(key).filter(Boolean))
  return Object.entries(results).find(([id, result]) => wanted.has(key(id)) || wanted.has(key(result.assetNo)))
}
