import { scenarios, createState, transition } from './simulation.js';

const $ = selector => document.querySelector(selector);
let state = createState();
let logs = [];
let toastTimer;
let selectedFlight = null;
const layers = { traffic: true, weather: true, sectors: true };
const flights = Array.from({ length: 24 }, (_, index) => ({
  id: ['CCA', 'CES', 'CSN', 'CSC', 'CXA', 'CHH'][index % 6] + (1302 + index * 137),
  x: 110 + ((index * 139) % 580), y: 85 + ((index * 97) % 410),
  heading: [36, 128, 224, 309, 68, 258][index % 6],
  altitude: [7800, 8400, 9200, 10100, 6600, 7200][index % 6],
  speed: 720 + (index % 5) * 24, warning: index === 5 || index === 11,
  route: ['北京首都 → 成都天府', '上海虹桥 → 成都双流', '广州白云 → 成都天府', '成都天府 → 深圳宝安'][index % 4]
}));

function time() { return new Date().toLocaleTimeString('zh-CN', { hour12: false }); }
function notify(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3500); }
function log(stage, message, source = 'AI 辅助系统', status = '已记录') {
  logs.unshift({ time: time(), stage, message, source, status });
  logs = logs.slice(0, 80);
  $('#log-count').textContent = String(logs.length).padStart(2, '0');
  $('#audit-body').innerHTML = logs.map(item => `<tr><td>${item.time}</td><td>${item.stage}</td><td>${item.message}</td><td>${item.source}</td><td>${item.status}</td></tr>`).join('');
}

function renderWorkflow() {
  const executing = ['executing', 'completed'].includes(state.status);
  const steps = [['AI 监测', '全域态势感知'], ['AI 预测', '需求与容量推演'], ['AI 推荐', '约束方案生成'], ['管制员审核', '人工最终决策'], ['系统执行', state.status === 'completed' ? '模拟执行完成' : '受约束模拟执行'], ['异常接管', state.manual ? '人工控制中' : '人工随时可接管']];
  const active = state.manual ? 5 : executing ? 4 : 3;
  $('#workflow').innerHTML = steps.map((step, index) => `<div class="flow-step ${index < active ? 'done' : ''} ${index === active ? state.manual ? 'danger' : 'current' : ''}"><span class="step-number">${index < active ? '✓' : String(index + 1).padStart(2, '0')}</span><div><strong>${step[0]}</strong><small>${step[1]}</small></div></div>`).join('');
}

function renderMetrics() {
  const scenario = scenarios[state.scenario];
  const completed = state.status === 'completed';
  const metrics = [
    ['在域航班', scenario.flights, '架', '运行态势', '模拟场景', '✈', false],
    ['平均扇区负荷', Math.round(scenario.loads.reduce((total, load) => total + load, 0) / 4) - (completed ? 8 : 0), '%', '需求 / 动态容量', completed ? '↓ 调节生效' : '4 个监测扇区', '◫', false],
    ['预测风险', completed ? Math.max(0, scenario.risks - 1) : scenario.risks, '项', '未来 60 分钟', scenario.risks ? '需关注容量变化' : '无显著风险', '△', scenario.risks > 0],
    ['平均延误', (scenario.delay * (completed ? state.plan === 'hold' ? .82 : .88 : 1)).toFixed(1), 'min', '本场景模拟值', completed ? '↓ 方案后估算' : '滚动窗口 2h', '◷', false],
    ['待审核建议', state.status === 'pending' ? '01' : '00', '项', '人机协同决策', state.manual ? '人工已接管' : { pending: '等待管制员确认', executing: '模拟执行中', completed: '执行完成', rejected: '建议已驳回', interrupted: '执行中断' }[state.status], '◇', false]
  ];
  $('#metrics').innerHTML = metrics.map((metric, index) => `<article class="metric ${metric[6] ? 'warning' : ''}"><div class="metric-label">${metric[0]}<span class="metric-symbol">${metric[5]}</span></div><div class="metric-value">${metric[1]}<small>${metric[2]}</small></div><svg class="sparkline" viewBox="0 0 80 30" aria-hidden="true"><path d="M0 26 L8 ${18 + index} L16 22 L24 12 L32 17 L40 11 L48 14 L56 5 L64 10 L72 4 L80 8" fill="none" stroke="${metric[6] ? '#f2b75b' : '#50c4cd'}" stroke-width="1.5"/></svg><div class="metric-bottom"><span>${metric[3]}</span><b>${metric[4]}</b></div></article>`).join('');
}

function renderSectors() {
  const names = ['西北进场', '东北进场', '东南离场', '西南离场'];
  $('#sector-list').innerHTML = scenarios[state.scenario].loads.map((original, index) => {
    const load = Math.max(25, original - (state.status === 'completed' ? index === 1 ? 27 : 3 : 0));
    const warning = load > 95;
    return `<div class="sector-row"><div class="sector-title"><strong>S0${index + 1}<span>${names[index]}</span></strong><span class="sector-status ${warning ? 'warning' : ''}">${load > 100 ? '超容预警' : warning ? '接近容量' : '运行正常'}</span></div><div class="sector-stat"><span>负荷率</span><b class="${warning ? 'warning' : ''}">${load}% <span class="muted">/ 100%</span></b></div><div class="progress"><span class="${warning ? 'warning' : ''}" style="width:${Math.min(100, load)}%"></span></div></div>`;
  }).join('');
}

function renderForecast() {
  const scenario = scenarios[state.scenario];
  const point = (value, index) => `${32 + index * 36},${148 - value * 2}`;
  const demand = scenario.demand.map(point).join(' ');
  const capacity = scenario.capacity.map(point).join(' ');
  const top = scenario.demand.map((value, index) => point(value + 4, index));
  const bottom = scenario.demand.map((value, index) => point(value - 4, index)).reverse();
  $('#forecast-chart').innerHTML = `<svg viewBox="0 0 280 185" role="img" aria-label="未来六十分钟需求与容量预测，阴影为预设90%区间"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#50d9e7" stop-opacity=".16"/><stop offset="1" stop-color="#50d9e7" stop-opacity="0"/></linearGradient></defs>${[20, 40, 60].map(value => `<line x1="32" x2="248" y1="${148 - value * 2}" y2="${148 - value * 2}" stroke="#28364a" stroke-dasharray="3 4"/><text x="8" y="${152 - value * 2}" fill="#647c96" font-size="8">${value}</text>`).join('')}<polygon points="32,150 ${demand} 248,150" fill="url(#chart-fill)"/><polygon points="${[...top, ...bottom].join(' ')}" fill="#50d9e7" opacity=".1"/><polyline points="${capacity}" stroke="#f2b75b" stroke-width="1.6" stroke-dasharray="5 4" fill="none"/><polyline points="${demand}" stroke="#50d9e7" stroke-width="2" fill="none"/>${scenario.demand.map((value, index) => `<circle cx="${32 + index * 36}" cy="${148 - value * 2}" r="2.5" fill="#50d9e7"/>`).join('')}${['现在', '+10', '+20', '+30', '+40', '+50', '+60'].map((label, index) => `<text x="${32 + index * 36}" y="169" fill="#71869f" font-size="8" text-anchor="middle">${label}</text>`).join('')}<text x="248" y="183" fill="#526b82" font-size="7" text-anchor="end">min / 90% 示例预测区间</text></svg>`;
  $('#forecast-insight').textContent = state.scenario === 'normal' ? '✓ 未来 60 分钟需求低于容量，建议持续监测。' : `△ 预计 +20 min 出现供需缺口，峰值超容 ${Math.round((Math.max(...scenario.demand) / Math.min(...scenario.capacity) - 1) * 100)}%。`;
}

function renderRisks() {
  const items = state.scenario === 'normal' ? [['运行态势平稳', '容量裕度充足，保持常态监测。', true]] : [
    ['S02 扇区容量不足风险', '预计 15 分钟后需求超过动态容量，建议提前调节流量。', false],
    [state.scenario === 'storm' ? '雷暴影响进场航路' : '航班集中进入终端区', state.scenario === 'storm' ? '东北方向对流天气影响约 30 NM 航段，容量示例下降 30%。' : '进场航班时刻集中，S03 接近容量边界。', true],
    ...(state.scenario === 'peak' ? [['S03 负荷接近阈值', '建议保留容量裕度，避免延误向邻接扇区传播。', true]] : [])
  ];
  $('#risk-count').textContent = String(scenarios[state.scenario].risks).padStart(2, '0');
  $('#risk-list').innerHTML = items.map(item => `<article class="risk-item ${item[2] ? 'secondary' : ''}"><div><strong>${item[0]}</strong><time>模拟预警</time></div><p>${item[1]}</p></article>`).join('');
}

function renderDecision() {
  $('#plan-description').textContent = scenarios[state.scenario].description;
  const statuses = { pending: '待审核', executing: '模拟执行中', completed: '执行完成', rejected: '已驳回', interrupted: '已中断' };
  $('#review-state').textContent = state.manual ? '人工接管' : statuses[state.status];
  $('#plan-options').innerHTML = [
    ['hold', state.scenario === 'normal' ? '方案 A · 保持运行，备用等待' : '方案 A · 地面等待 + 时隙调整', state.scenario === 'normal' ? '维持当前时隙，保留流量调节预案' : '对 12 架待起飞航班实施 5–8 min 等待', true],
    ['reroute', '方案 B · 邻接航路分流', '引导 6 架航班绕行 S03，航程示例 +18 NM', false]
  ].map(plan => `<label class="plan-option"><input type="radio" name="plan" value="${plan[0]}" ${state.plan === plan[0] ? 'checked' : ''} ${state.status !== 'pending' || state.manual ? 'disabled' : ''}><span><strong>${plan[1]}${plan[3] ? '<span class="recommended">推荐</span>' : ''}</strong><small>${plan[2]}</small></span></label>`).join('');
  $('#benefit-delay').textContent = state.scenario === 'normal' ? '持平' : state.plan === 'hold' ? '−18%' : '−12%';
  $('#benefit-load').textContent = state.scenario === 'normal' ? '稳定' : state.plan === 'hold' ? '−24%' : '−19%';
  $('#approve').disabled = state.manual || !['pending', 'rejected', 'completed'].includes(state.status);
  $('#approve').textContent = state.status === 'executing' ? `模拟执行中 ${Math.min(100, Math.round(state.execution / 8 * 100))}%` : state.status === 'rejected' || state.status === 'completed' ? '↻ 重新生成建议' : '✓ 审核并模拟执行';
  $('#reject').disabled = state.manual || state.status !== 'pending';
  $('#decision-note').textContent = state.manual ? '人工已接管，建议审核与模拟执行均已冻结。' : state.status === 'completed' ? '模拟策略已应用。收益为预设示例值，非真实评估。' : 'AI 提供辅助建议，管制员保留最终决策权。';
}

function renderMap() {
  const svg = $('#airspace-svg');
  svg.innerHTML = `<defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0 H0 V40" fill="none" stroke="#233749" stroke-width=".5" opacity=".6"/></pattern><radialGradient id="storm-glow"><stop stop-color="#9e79d6" stop-opacity=".28"/><stop offset="1" stop-color="#8768c7" stop-opacity=".03"/></radialGradient><filter id="weather-blur"><feGaussianBlur stdDeviation="8"/></filter></defs><rect width="800" height="590" fill="url(#grid)"/>
    <g fill="none" stroke="#294255" stroke-width="1" opacity=".65"><path d="M22 390 80 365 105 290 84 236 152 188 187 102 277 58 340 88 401 59 456 102 532 79 570 123 641 132 673 199 733 230 754 298 705 342 714 423 647 466 589 510 506 494 445 541 365 505 287 533 226 474 148 477 105 432Z"/><path d="M0 435 Q180 320 280 372 T540 350 800 228"/><path d="M171 30 Q265 169 254 302 T376 580"/><path d="M370 0 Q334 188 451 269 T527 590"/><path d="M0 175 Q200 229 345 146 T800 151"/></g>
    <g fill="none" stroke="#294657" opacity=".55"><circle cx="390" cy="302" r="110" stroke-dasharray="3 5"/><circle cx="390" cy="302" r="205" stroke-dasharray="3 6"/><path d="M390 62V542M150 302H630" stroke-dasharray="2 7"/></g>
    <g id="sector-layer"><path d="M126 122 375 93 386 290 139 327Z" fill="#3e9eaa" fill-opacity=".035" stroke="#3c6a7e" stroke-dasharray="6 5"/><path d="M375 93 662 138 652 315 386 290Z" fill="#dfaa54" fill-opacity="${state.scenario === 'normal' ? '.025' : '.07'}" stroke="${state.scenario === 'normal' ? '#3c6a7e' : '#a48249'}" stroke-dasharray="6 5"/><path d="M386 290 652 315 602 491 384 509Z" fill="#3e9eaa" fill-opacity=".025" stroke="#3c6a7e" stroke-dasharray="6 5"/><path d="M139 327 386 290 384 509 164 479Z" fill="#3e9eaa" fill-opacity=".025" stroke="#3c6a7e" stroke-dasharray="6 5"/><g font-size="10" letter-spacing="1" fill="#6f97ab"><text x="178" y="160">S01 · 西北进场</text><text x="454" y="145" fill="${state.scenario === 'normal' ? '#6f97ab' : '#d3ac68'}">S02 · 东北进场</text><text x="485" y="456">S03 · 东南离场</text><text x="192" y="450">S04 · 西南离场</text></g></g>
    <g stroke="#377487" fill="none" stroke-width="1" opacity=".7"><path d="M48 160 205 242 370 312 586 422 756 492"/><path d="M108 505 249 403 370 312 525 218 735 82"/><path d="M67 333 235 331 370 312 571 312 761 267"/><path d="M283 42 326 188 370 312 442 432 480 566"/><path d="M78 430 267 372 469 359 691 414"/></g><g fill="#0f1e2c" stroke="#4c8597" stroke-width="1">${[[205,242],[249,403],[525,218],[571,312],[326,188],[442,432],[267,372],[586,422],[235,331]].map(point => `<path d="M${point[0]} ${point[1]-3}l3 5h-6z"/>`).join('')}</g><g fill="#557d92" font-size="7" font-family="monospace"><text x="207" y="232">GOTEX</text><text x="531" y="209">DAXIN</text><text x="578" y="304">LUVEX</text><text x="255" y="417">SANLI</text><text x="329" y="178">BOKIR</text></g>
    <g id="weather-layer"><path d="M483 173 Q512 119 553 159 Q615 130 633 186 Q693 201 648 248 Q650 282 586 269 Q548 298 518 251 Q470 248 483 173Z" fill="url(#storm-glow)" filter="url(#weather-blur)"/><path d="M495 182 Q517 139 553 172 Q602 151 619 194 Q665 206 632 239 Q634 268 585 255 Q551 280 530 243 Q488 237 495 182Z" stroke="#9478c3" fill="#8c6cb0" fill-opacity=".11" stroke-dasharray="4 5"/><path d="M535 186 Q558 171 584 193 T610 224 569 239 538 220Z" fill="#aa80c6" opacity=".16"/><text x="545" y="207" fill="#c3a0e8" font-size="18">ϟ</text><text x="567" y="207" fill="#baa0d9" font-size="10">对流天气</text><text x="540" y="225" fill="#967db3" font-size="8">模拟回波 · 容量 −30%</text></g>
    <g><circle cx="370" cy="312" r="22" fill="#61dbe8" opacity=".04"/><circle cx="370" cy="312" r="12" fill="#61dbe8" opacity=".07"/><circle cx="370" cy="312" r="5" fill="#0e2735" stroke="#7cdeea" stroke-width="1.5"/><path d="M365 312h10M370 307v10" stroke="#7cdeea"/><text x="386" y="303" fill="#c4dce7" font-size="11">成都双流</text><text x="386" y="317" fill="#638a9f" font-size="8">ZUUU</text><circle cx="469" cy="359" r="5" fill="#0e2735" stroke="#7cdeea" stroke-width="1.5"/><path d="M464 359h10M469 354v10" stroke="#7cdeea"/><text x="484" y="359" fill="#c4dce7" font-size="11">成都天府</text><text x="484" y="373" fill="#638a9f" font-size="8">ZUTF</text><circle cx="267" cy="372" r="4" fill="#0e2735" stroke="#6ea7b9"/><text x="219" y="355" fill="#8facbd" font-size="9">绵阳南郊</text></g><g id="traffic-layer"></g><g transform="translate(748 62)"><path d="M0 0 -5 18 0 14 5 18Z" fill="#7e9db2"/><text y="-8" text-anchor="middle" fill="#7e9db2" font-size="9">N</text></g>`;
  updateFlights();
  updateLayers();
}

function updateLayers() {
  $('#traffic-layer').style.display = layers.traffic ? '' : 'none';
  $('#sector-layer').style.display = layers.sectors ? '' : 'none';
  $('#weather-layer').style.display = layers.weather && state.scenario === 'storm' ? '' : 'none';
}

function updateFlights() {
  $('#traffic-layer').innerHTML = flights.map((flight, index) => {
    const radians = flight.heading * Math.PI / 180;
    const shift = state.elapsed * .36;
    const positionX = 70 + ((flight.x - 70 + Math.sin(radians) * shift + 6600) % 660);
    const positionY = 65 + ((flight.y - 65 - Math.cos(radians) * shift + 4700) % 470);
    const color = flight.warning && state.scenario !== 'normal' ? '#e6b867' : '#6bc9dc';
    return `<g class="flight-hit" tabindex="0" role="button" aria-label="查看航班 ${flight.id}" data-flight="${index}" transform="translate(${positionX.toFixed(1)} ${positionY.toFixed(1)})"><title>${flight.id} · ${flight.altitude}m</title><g transform="rotate(${flight.heading})"><path d="M0 8V42" stroke="${color}" stroke-width="1" opacity=".35"/><path class="aircraft" d="M0 -8 2 -2 8 2 8 4 2 2 1 7 4 9 4 10 0 9 -4 10 -4 9 -1 7 -2 2 -8 4 -8 2 -2 -2Z" fill="${color}"/></g><circle r="15" fill="transparent"/>${index % 2 === 0 || flight.warning ? `<text x="13" y="-5" fill="${color}" font-family="monospace" font-size="8">${flight.id}</text><text x="13" y="6" fill="#658399" font-family="monospace" font-size="7">${flight.altitude}m · ${flight.speed}</text>` : ''}</g>`;
  }).join('');
  const minutes = String(Math.floor(state.elapsed / 60)).padStart(2, '0');
  const seconds = String(state.elapsed % 60).padStart(2, '0');
  $('#simulation-time').textContent = `T +${minutes}:${seconds}`;
}

function showFlight(index) {
  const flight = flights[index];
  if (!flight) return;
  selectedFlight = index;
  $('#flight-detail').hidden = false;
  $('#flight-detail').innerHTML = `<button aria-label="关闭航班详情" id="close-flight">×</button><strong>${flight.id}</strong><p>${flight.route}</p><p>高度 <b>${flight.altitude} m</b></p><p>地速 <b>${flight.speed} km/h</b></p><p>运行状态 <b>${flight.warning && state.scenario !== 'normal' ? '关注航班' : '正常'}</b></p><small class="muted">预设示例航班 · 非真实轨迹</small>`;
  $('#close-flight').onclick = () => { $('#flight-detail').hidden = true; selectedFlight = null; };
}

function render() {
  document.body.classList.toggle('manual', state.manual);
  renderWorkflow(); renderMetrics(); renderSectors(); renderForecast(); renderRisks(); renderDecision();
  $('#pause').textContent = state.paused ? '▷ 继续推演' : 'Ⅱ 暂停推演';
  $('#pause').disabled = state.manual;
  $('#scenario').disabled = state.manual || state.status === 'executing';
  $('#control-title').textContent = state.manual ? '人工接管 · 自动流程冻结' : '人工监督 · 系统协同';
  $('#control-description').textContent = state.manual ? '当前由管制员控制；恢复后需重新审核中断方案。' : '异常时立即冻结模拟执行，切换人工处置。';
  $('#takeover').innerHTML = state.manual ? '恢复辅助模式 <span>↗</span>' : '异常接管 <span>↗</span>';
  $('.map-bottom>span:first-child').childNodes[1].textContent = state.manual ? ' 人工接管中 ' : state.paused ? ' 推演已暂停 ' : ' 轨迹推演中 ';
  if (selectedFlight !== null) showFlight(selectedFlight);
}

$('#plan-options').addEventListener('change', event => {
  if (state.manual || state.status !== 'pending') return;
  if (['hold', 'reroute'].includes(event.target.value)) { state.plan = event.target.value; renderDecision(); }
});
$('#approve').onclick = () => {
  if (state.manual) return;
  if (['rejected', 'completed'].includes(state.status)) { state = transition(state, 'replan'); log('AI 推荐', '基于当前模拟场景重新生成候选方案'); render(); return; }
  if (state.status !== 'pending') return;
  log('管制员审核', `批准方案 ${state.plan === 'hold' ? 'A' : 'B'}；进入模拟执行`, '管制席 01', '已批准');
  state = transition(state, 'approve'); render(); notify('审核通过，正在模拟执行；8 秒后展示示例结果。');
};
$('#reject').onclick = () => { if (state.manual || state.status !== 'pending') return; state = transition(state, 'reject'); log('管制员审核', '驳回当前 AI 建议，未执行任何策略', '管制席 01', '已驳回'); render(); notify('建议已驳回，可重新生成建议。'); };
$('#pause').onclick = () => { state = transition(state, 'pause'); render(); };
$('#reset').onclick = () => { if (state.manual || state.status === 'executing') { notify('请先恢复辅助模式或等待执行结束，再重置场景。'); return; } resetScene(state.scenario); };
function resetScene(scenario) { state = createState(scenario); selectedFlight = null; $('#flight-detail').hidden = true; $('#scenario').value = scenario; render(); renderMap(); log('AI 监测', `载入「${scenarios[scenario].name}」预设场景，生成模拟预测与建议`, '场景模拟器'); }
$('#scenario').onchange = event => resetScene(event.target.value);
$('#takeover').onclick = () => {
  if (state.manual) { state = transition(state, 'resume'); log('异常接管', '人工确认恢复辅助模式，中断策略需重新审核', '管制席 01', '已恢复'); render(); notify('已恢复辅助模式。'); }
  else $('#takeover-dialog').showModal();
};
$('#cancel-takeover').onclick = () => $('#takeover-dialog').close();
$('#confirm-takeover').onclick = () => { state = transition(state, 'takeover'); $('#takeover-dialog').close(); log('异常接管', '人工接管：冻结推演，停止未完成的模拟策略', '管制席 01', '已接管'); render(); notify('人工已接管，自动流程已冻结。'); };
$('#fullscreen').onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { notify('当前预览不支持全屏，请在独立浏览器中打开。'); } };
document.querySelectorAll('[data-layer]').forEach(button => { button.onclick = () => { const layer = button.dataset.layer; layers[layer] = !layers[layer]; button.classList.toggle('selected', layers[layer]); button.setAttribute('aria-pressed', String(layers[layer])); updateLayers(); }; button.setAttribute('aria-pressed', 'true'); });
document.querySelectorAll('[data-view]').forEach(button => { button.onclick = () => {
  document.querySelectorAll('[data-view]').forEach(item => item.classList.toggle('active', item === button));
  const views = { overview: ['运行总览', '.workspace-bar'], prediction: ['预测分析', '#forecast-panel'], decision: ['协同决策', '#decision-panel'], audit: ['审计日志', '#audit-panel'] };
  const view = views[button.dataset.view]; $('#view-title').textContent = view[0];
  document.querySelectorAll('.focused-panel').forEach(panel => panel.classList.remove('focused-panel'));
  const target = $(view[1]); if (button.dataset.view !== 'overview') target.classList.add('focused-panel');
  target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
}; });
$('#airspace-svg').addEventListener('click', event => { const flight = event.target.closest('[data-flight]'); if (flight) showFlight(Number(flight.dataset.flight)); });
$('#airspace-svg').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { const flight = event.target.closest('[data-flight]'); if (flight) { event.preventDefault(); showFlight(Number(flight.dataset.flight)); } } });
function updateClock() { $('#clock').textContent = time(); $('#date').textContent = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }) + ' · 本地时间'; }
render(); renderMap(); updateClock();
log('AI 推荐', '已生成 2 个候选方案，等待管制员审核', 'AI 辅助系统', '待审核');
log('AI 预测', '完成未来 60 分钟需求—容量示例推演');
log('AI 监测', '雷暴扰动场景就绪 · 数据与指标均为模拟', '场景模拟器', '运行中');
setInterval(() => {
  updateClock();
  const previousStatus = state.status;
  state = transition(state, 'tick');
  if (!state.paused) updateFlights();
  if (state.status !== previousStatus) { log('系统执行', '已应用模拟策略，更新示例负荷与延误；非真实运行收益', '模拟执行器', '已完成'); render(); notify('模拟执行完成，负荷与延误示例已更新。'); }
  else if (state.status === 'executing' && !state.paused) renderDecision();
}, 1000);
