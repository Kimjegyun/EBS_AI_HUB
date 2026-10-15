import test from 'node:test'
import assert from 'node:assert/strict'
import { configureLabelCamera, exposureStep, labelVideoConstraints } from '../src/apps/inventory/labelCamera.ts'

test('mobile acquisition follows orientation without forcing a landscape aspect ratio', () => {
  const portrait = labelVideoConstraints(true)
  const landscape = labelVideoConstraints(false)
  assert.equal(portrait.width.ideal, landscape.height.ideal)
  assert.equal(portrait.height.ideal, landscape.width.ideal)
  assert.equal(portrait.aspectRatio, undefined)
  assert.deepEqual(portrait.facingMode, { ideal: 'environment' })
})

test('white-label profile uses supported negative exposure and automatic white balance', async () => {
  const applied = []
  let settings = {}
  const camera = {
    getRunningTrackCapabilities: () => ({ exposureMode: ['continuous'], whiteBalanceMode: ['continuous'], torch: true, exposureCompensation: { min: -2, max: 2, step: 1 / 3 } }),
    getRunningTrackSettings: () => settings,
    applyVideoConstraints: async ({ advanced: [value] }) => { applied.push(value); settings = value },
  }
  const profile = await configureLabelCamera(camera)
  assert.equal(applied[0].torch, false)
  assert.equal(profile.retained.whiteBalanceMode, 'continuous')
  assert.equal(profile.retained.exposureMode, 'continuous')
  assert.ok(Math.abs(profile.exposureEV + 2 / 3) < 0.00001)
  assert.equal(profile.retained.torch, undefined, 'Later autofocus must not turn off a user-enabled torch')
})

test('optional white balance failure does not stop exposure correction', async () => {
  const camera = {
    getRunningTrackCapabilities: () => ({ whiteBalanceMode: ['continuous'], exposureCompensation: { min: -1, max: 1, step: 0.5 } }),
    getRunningTrackSettings: () => ({}),
    applyVideoConstraints: async ({ advanced: [value] }) => { if (value.whiteBalanceMode) throw new Error('unsupported') },
  }
  const profile = await configureLabelCamera(camera)
  assert.equal(profile.retained.exposureCompensation, -0.5)
  assert.equal(profile.exposureEV, null, 'Do not claim actual EV when the browser does not report it')
})

test('unsupported cameras receive no guessed ISO, shutter, brightness or contrast', async () => {
  const camera = {
    getRunningTrackCapabilities: () => ({}),
    getRunningTrackSettings: () => ({}),
    applyVideoConstraints: async () => { throw new Error('No request should be made') },
  }
  assert.deepEqual(await configureLabelCamera(camera), { retained: {}, exposureEV: null })
})

test('exposure values follow device bounds and increments', () => {
  assert.equal(exposureStep({ min: -0.5, max: 2, step: 0.5 }, -0.7), -0.5)
  assert.equal(exposureStep({ min: -2, max: 2, step: 0.5 }, -10), -2)
  assert.equal(exposureStep({ min: NaN, max: 2 }, -0.7), null)
})
