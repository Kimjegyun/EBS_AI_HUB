import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getImportJob, startImportJob } from '../server/src/lib/importProgramJob'

test('admin job runs the actual folder check and rejects concurrent jobs', async () => {
  const job = startImportJob('check', '')
  assert.equal(job.status, 'running')
  assert.throws(() => startImportJob('build', ''), /IMPORT_BUSY/)
  const deadline = Date.now() + 15000
  while (getImportJob()?.status === 'running' && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.equal(getImportJob()?.status, 'completed')
  assert.ok(getImportJob()?.results.some((row) => row.id === 'import-example' && row.status === 'checked'))
  assert.ok(getImportJob()?.finishedAt)
})
