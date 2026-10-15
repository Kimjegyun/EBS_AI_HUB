import test from 'node:test'
import assert from 'node:assert/strict'
import { findSavedAsset } from '../src/apps/inventory/savedAsset.ts'
import { reserveCamera, settleCameraOperation } from '../src/apps/inventory/cameraLease.ts'

test('barcode and QR formatting resolve to the same saved result', () => {
  const result = { assetNo: 'QQ00012-0240-000', confirmed: true }
  assert.equal(findSavedAsset({ [result.assetNo]: result }, ['qq000120240000'])?.[1], result)
  assert.equal(findSavedAsset({ [result.assetNo]: result }, ['QQ999999999']) , undefined)
})

test('master or ERP old asset alias resolves to previously saved canonical number', () => {
  const result = { assetNo: 'QQ00012-0240-000', confirmed: true }
  assert.equal(findSavedAsset({ saved: result }, ['AB123456789', result.assetNo])?.[1], result)
})

test('rapid camera reopen waits until previous instance releases its camera', async () => {
  const first = reserveCamera()
  const second = reserveCamera()
  let opened = false
  void second.ready.then(() => { opened = true })
  await first.ready
  await Promise.resolve()
  assert.equal(opened, false)
  first.release()
  first.release()
  await second.ready
  assert.equal(opened, true)
  second.release()
})

test('a stuck camera stop cannot block release indefinitely', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let finished = false
  const stopping = settleCameraOperation(new Promise(() => {})).then(() => { finished = true })
  t.mock.timers.tick(1500)
  await stopping
  assert.equal(finished, true)
})
