import test from 'node:test'
import assert from 'node:assert/strict'
import { belongsToSurveyUser, findContinuingSurvey } from '../src/apps/inventory/resumeSurvey.ts'
const session = { id: 's1', datasetId: 'd1', parentDept: 'HQ', dept: 'Dept', createdBy: 'Name', name: '2026 survey', completed: true, results: {} }
const input = { datasetId: 'd1', parentDept: 'HQ', dept: 'Dept', createdBy: 'Name', name: '2026 survey' }
test('same survey continues even after completion without creating a new workspace', () => {
  assert.equal(findContinuingSurvey([session], input)?.id, 's1')
  assert.equal(findContinuingSurvey([session], {...input, datasetId:'new-master'}), undefined)
  assert.equal(findContinuingSurvey([session], {...input, name:'2027 survey'}), undefined)
})
test('legacy server identity can be recovered from inspector; other departments and users do not match', () => {
  const legacy = {...session, createdBy:'server-id', results:{A:{verifier:'Name'}}}
  assert.equal(belongsToSurveyUser(legacy,'Name','HQ','Dept'), true)
  assert.equal(belongsToSurveyUser(legacy,'Other','HQ','Dept'), false)
  assert.equal(belongsToSurveyUser(legacy,'Name','HQ','Other'), false)
})
