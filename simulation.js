export const scenarios = {
  storm: { name: '雷暴扰动', loads: [68, 112, 76, 54], flights: 186, delay: 12.4, risks: 2, description: '雷暴影响东北侧进场航路，S02 预计 15 分钟后需求超出动态容量。建议提前实施流量调节。', demand: [26, 30, 37, 45, 48, 42, 35], capacity: [40, 40, 36, 33, 33, 36, 40] },
  normal: { name: '常态运行', loads: [58, 72, 65, 49], flights: 152, delay: 4.2, risks: 0, description: '各扇区需求处于容量边界内。建议维持当前运行方案，保留地面等待作为备用措施。', demand: [24, 27, 29, 31, 30, 28, 27], capacity: [40, 40, 40, 40, 40, 40, 40] },
  peak: { name: '高峰流量', loads: [89, 124, 96, 78], flights: 248, delay: 18.6, risks: 3, description: '多条进场航路集中到达，S02 与 S03 负荷持续上升。建议采用地面等待削减瞬时需求。', demand: [32, 38, 46, 54, 52, 48, 43], capacity: [42, 42, 42, 40, 40, 42, 42] }
};

export function createState(scenario = 'storm') {
  if (!scenarios[scenario]) throw new Error('未知场景');
  return { scenario, status: 'pending', plan: 'hold', paused: false, manual: false, elapsed: 0, execution: 0 };
}

export function transition(state, action) {
  if (action === 'takeover') return { ...state, manual: true, paused: true, status: state.status === 'executing' ? 'interrupted' : state.status };
  if (action === 'resume' && state.manual) return { ...state, manual: false, paused: false, status: ['interrupted', 'pending'].includes(state.status) ? 'pending' : state.status, execution: 0 };
  if (state.manual) return state;
  if (action === 'pause') return { ...state, paused: !state.paused };
  if (action === 'approve' && state.status === 'pending') return { ...state, status: 'executing', execution: 0 };
  if (action === 'reject' && state.status === 'pending') return { ...state, status: 'rejected' };
  if (action === 'replan' && ['rejected', 'completed'].includes(state.status)) return { ...state, status: 'pending', execution: 0 };
  if (action === 'tick' && !state.paused) {
    const execution = state.status === 'executing' ? state.execution + 1 : state.execution;
    return { ...state, elapsed: state.elapsed + 1, execution, status: state.status === 'executing' && execution >= 8 ? 'completed' : state.status };
  }
  return state;
}
