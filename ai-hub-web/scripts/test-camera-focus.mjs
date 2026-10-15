import test from 'node:test'
import assert from 'node:assert/strict'
import { createCameraFocus } from '../src/apps/inventory/cameraFocus.ts'

function camera(modes, rejectPoint = false) {
  const calls = []
  return {
    calls,
    getRunningTrackCapabilities: () => ({ focusMode: modes }),
    async applyVideoConstraints({ advanced: [request] }) {
      calls.push(request)
      if (rejectPoint && request.pointsOfInterest) throw new Error('No metering points')
    },
  }
}

test('continuous autofocus starts without requiring zoom or torch APIs', async () => {
  const device = camera(['continuous'])
  const focus = createCameraFocus(device)
  assert.equal(await focus.start(), true)
  assert.equal(device.calls[0].focusMode, 'continuous')
  await focus.refocus({ x: 0.5, y: 0.5 })
  assert.equal(device.calls[1].focusMode, 'continuous')
  focus.dispose()
})

test('tap focus restores continuous autofocus; closing cancels pending work', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  const device = camera(['single-shot', 'continuous'])
  const focus = createCameraFocus(device)
  await focus.start()
  await focus.refocus({ x: 0.2, y: 0.8 })
  assert.equal(device.calls.at(-1).focusMode, 'single-shot')
  t.mock.timers.tick(800)
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(device.calls.at(-1).focusMode, 'continuous')
  assert.deepEqual(device.calls.at(-1).pointsOfInterest, [{ x: 0.2, y: 0.8 }])
  focus.dispose()
  const count = device.calls.length
  await focus.refocus()
  t.mock.timers.tick(10000)
  assert.equal(device.calls.length, count)
})

test('focus is applied once at start and never re-applied on a timer', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  const device = camera(['single-shot'])
  const focus = createCameraFocus(device)
  await focus.start()
  t.mock.timers.tick(20000)
  assert.equal(device.calls.length, 1)
  focus.dispose()
})

test('unsupported cameras keep their default focus without invalid constraints', async () => {
  const device = camera(undefined)
  const focus = createCameraFocus(device)
  assert.equal(await focus.start(), false)
  assert.equal(await focus.refocus({ x: 0.5, y: 0.5 }), false)
  await focus.refocus()
  assert.deepEqual(device.calls, [])
  focus.dispose()
})

test('unsupported metering points fall back to focus mode alone', async () => {
  const device = camera(['continuous'], true)
  const focus = createCameraFocus(device)
  await focus.start()
  await focus.refocus({ x: 0.5, y: 0.5 })
  assert.deepEqual(device.calls.at(-1), { focusMode: 'continuous' })
  focus.dispose()
})

test('camera closure during startup does not schedule more focus requests', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  const device = camera(['single-shot'])
  let finish
  device.applyVideoConstraints = () => new Promise((resolve) => { finish = resolve })
  const focus = createCameraFocus(device)
  const starting = focus.start()
  focus.dispose()
  finish()
  assert.equal(await starting, false)
  t.mock.timers.tick(10000)
})

test('refocus is skipped while the scanner is hidden', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  let visible = true
  const device = camera(['continuous', 'single-shot'])
  const focus = createCameraFocus(device, () => visible)
  await focus.start()
  t.mock.timers.tick(7000)
  assert.equal(device.calls.length, 1)
  visible = false
  assert.equal(await focus.refocus({ x: 0.5, y: 0.5 }), false)
  assert.equal(device.calls.length, 1)
  focus.dispose()
})

test('latest tap waits for busy autofocus and keeps its selected point', async () => {
  const device = camera(['continuous'])
  const focus = createCameraFocus(device)
  await focus.start()
  let release
  const apply = device.applyVideoConstraints.bind(device)
  device.applyVideoConstraints = async (constraints) => {
    await apply(constraints)
    if (!release) await new Promise(resolve => { release = resolve })
  }
  const busy = focus.refocus()
  const first = focus.refocus({ x: 0.1, y: 0.2 })
  const latest = focus.refocus({ x: 0.8, y: 0.6 })
  assert.equal(await first, false)
  await Promise.resolve()
  release()
  assert.equal(await busy, true)
  assert.equal(await latest, true)
  assert.deepEqual(device.calls.at(-1).pointsOfInterest, [{ x: 0.8, y: 0.6 }])
  focus.dispose()
})

test('Safari-style silent constraint acceptance must not report unsupported tap focus as applied', async () => {
  const device = camera(undefined)
  const focus = createCameraFocus(device)
  assert.equal(await focus.refocus({ x: 0.3, y: 0.7 }), false)
  assert.deepEqual(device.calls, [])
  focus.dispose()
})
