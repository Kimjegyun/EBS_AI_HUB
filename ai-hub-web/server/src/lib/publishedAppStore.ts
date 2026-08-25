import { all, run } from '../config/database'

const DEFAULT_PUBLISHED_APP_IDS = [
  'calendar',
  'my-llm',
  'email-writer',
  'codex',
  'inventory',
  'quick-actions',
  'pending-tasks',
  'recent-messages',
  'notes',
  'bookmarks',
]

export async function listPublishedAppIds(): Promise<string[]> {
  const rows = await all('SELECT app_id FROM published_apps ORDER BY published_at DESC') as Array<{ app_id: string }>
  const ids = rows.map((row) => row.app_id).filter(Boolean)
  if (ids.length > 0) return ids
  await seedDefaultPublishedApps()
  return [...DEFAULT_PUBLISHED_APP_IDS]
}

async function seedDefaultPublishedApps(): Promise<void> {
  for (const appId of DEFAULT_PUBLISHED_APP_IDS) {
    await run(
      `
        INSERT INTO published_apps (app_id, published_at)
        VALUES (?, CURRENT_TIMESTAMP)
        ON CONFLICT(app_id) DO NOTHING
      `,
      [appId],
    )
  }
}

export async function setPublishedApp(appId: string, published: boolean): Promise<void> {
  const id = appId.trim()
  if (!id) throw new Error('app_id is required')
  if (published) {
    await run(
      `
        INSERT INTO published_apps (app_id, published_at)
        VALUES (?, CURRENT_TIMESTAMP)
        ON CONFLICT(app_id) DO UPDATE SET published_at = CURRENT_TIMESTAMP
      `,
      [id],
    )
    return
  }
  await run('DELETE FROM published_apps WHERE app_id = ?', [id])
}
