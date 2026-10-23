import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, transition, scenarios } from './simulation.js';

test('所有场景均从待审核开始，未经批准不会执行', () => {
  for (const scenario of Object.keys(scenarios)) {
    let state = createState(scenario);
    for (let index = 0; index < 20; index++) state = transition(state, 'tick');
    assert.equal(state.status, 'pending');
    assert.equal(state.execution, 0);
  }
  assert.throws(() => createState('invalid'));
});
test('批准后执行，暂停时冻结，八次推进后完成', () => {
  let state = transition(createState(), 'approve');
  assert.equal(state.status, 'executing');
  state = transition(state, 'pause');
  assert.deepEqual(transition(state, 'tick'), state);
  state = transition(state, 'pause');
  for (let index = 0; index < 8; index++) state = transition(state, 'tick');
  assert.equal(state.status, 'completed');
  assert.equal(transition(state, 'approve').status, 'completed');
});
test('异常接管停止执行，恢复后必须重新审核', () => {
  let state = transition(transition(createState(), 'approve'), 'tick');
  state = transition(state, 'takeover');
  assert.equal(state.status, 'interrupted');
  for (const action of ['tick', 'approve', 'reject', 'pause', 'replan']) assert.deepEqual(transition(state, action), state);
  state = transition(state, 'resume');
  assert.equal(state.status, 'pending');
  assert.equal(state.execution, 0);
  assert.equal(state.manual, false);
  assert.equal(transition(state, 'tick').status, 'pending');
});
test('驳回后不可执行，必须重新生成建议', () => {
  let state = transition(createState(), 'reject');
  assert.equal(transition(state, 'approve').status, 'rejected');
  state = transition(state, 'replan');
  assert.equal(state.status, 'pending');
});
