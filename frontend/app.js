'use strict';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  source: 'demo',
  device: 'all',
  hours: 6,
  page: 'overview',
  admin: '',
  devices: [],
  overview: null,
  busy: false,
  analysing: false
};

const palette = ['#0B00CF', '#FF2D2B', '#C10A28', '#9b93ff'];

const pages = {
  overview: {
    name: 'Overview',
    title: 'What your sensors are hearing',
    text: 'See the current level, the average, and the highest point for the time you picked.',
    eyebrow: 'Start here'
  },
  forecast: {
    name: 'Forecast',
    title: 'The next six minutes',
    text: 'Pick one sensor to see a short projection, and how it compares with simple methods.',
    eyebrow: 'A look ahead'
  },
  audio: {
    name: 'Sound lab',
    title: 'Listen to one recording',
    text: 'Choose a WAV file. It is analysed in memory on this server and is not saved.',
    eyebrow: 'One sound'
  },
  devices: {
    name: 'Sensors',
    title: 'The sensors in this project',
    text: 'Each sensor gets an ID and a one-time token you copy into the device.',
    eyebrow: 'Places you listen'
  },
  alerts: {
    name: 'Alerts',
    title: 'When the level crosses your line',
    text: 'Review those moments and mark the ones you have already seen.',
    eyebrow: 'Worth a look'
  }
};

const flagNames = {
  clipping: 'mic overloaded',
  clock_unsynced: 'clock not set',
  wind_suspected: 'possible wind',
  packet_gap: 'gap in readings'
};

const statusNames = {
  demo: 'Practice',
  online: 'Reporting',
  offline: 'Not reporting'
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

const num = (value, digits = 3) => value == null || Number.isNaN(Number(value)) ? '—' : Number(value).toFixed(digits);
const time = (value) => new Date(value).toLocaleTimeString('en-GB', {
  timeZone: 'UTC',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
});

let toastTimer;
let refreshAgain = false;
let forecastRequest = 0;
let lastProblem = '';

function toast(message, error = false) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.toggle('error', error);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 6000);
}

function errorText(detail) {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => {
      const where = Array.isArray(item.loc) ? item.loc.filter((part) => part !== 'body').join(' ') : '';
      const message = item.msg || 'Check this value and try again.';
      return where ? `${where}: ${message}` : message;
    }).join(' ');
  }
  return 'Something went wrong. Please try again.';
}

function query() {
  return new URLSearchParams({
    source: state.source,
    device_id: state.device,
    hours: state.hours
  });
}

function showAuthDialog() {
  const dialog = $('#auth-dialog');
  if (!dialog.open) dialog.showModal();
}

function showDeviceDialog() {
  const dialog = $('#device-dialog');
  if (!dialog.open) dialog.showModal();
}

function setAdminButton(on) {
  $('#auth-btn').textContent = on ? 'Admin tools on' : 'Admin access';
  $('#auth-btn-mobile').textContent = on ? 'Admin on' : 'Admin';
}

function requireAdmin() {
  if (state.admin) return true;
  showAuthDialog();
  return false;
}

function setConnection(online) {
  const label = $('#connection-label');
  const text = online ? 'Connected' : 'Cannot reach the server';
  $('#connection').classList.toggle('offline', !online);
  if (label.textContent !== text) label.textContent = text;
}

async function api(path, options = {}) {
  const headers = {
    ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    ...(state.admin ? { 'X-Admin-Token': state.admin } : {}),
    ...options.headers
  };
  const controller = new AbortController();
  const waitMs = path.includes('/audio') ? 180000 : 20000;
  const timer = setTimeout(() => controller.abort(), waitMs);
  let response;
  try {
    response = await fetch(path, { ...options, headers, signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw Error('This is taking too long. Please try again.');
    throw Error('Cannot reach the Kaanam server. Is it running?');
  }
  clearTimeout(timer);
  if (!response.ok) {
    let data;
    try { data = await response.json(); }
    catch { data = { detail: `Request failed (${response.status})` }; }
    if (response.status === 401) {
      state.admin = '';
      setAdminButton(false);
      showAuthDialog();
    }
    throw Error(errorText(data.detail));
  }
  return response.json();
}

function setPageTitle(text) {
  const clean = String(text).replace(/\.$/, '');
  $('#page-title').innerHTML = `${escapeHtml(clean)}<span>.</span>`;
}

function page(name) {
  if (name !== 'audio') stopMic();
  if (!pages[name]) name = 'overview';
  const info = pages[name];
  state.page = name;
  $$('.page').forEach((el) => el.classList.toggle('active', el.id === 'page-' + name));
  $$('nav button').forEach((el) => {
    const on = el.dataset.page === name;
    el.classList.toggle('active', on);
    if (on) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
  $('#breadcrumb').textContent = info.name;
  $('#page-eyebrow').textContent = info.eyebrow;
  setPageTitle(info.title);
  $('#page-description').textContent = info.text;
  if (name === 'forecast') loadForecast();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  if (location.hash !== '#' + name) location.hash = name;
}

function calibrationText(value) {
  if (value === 'unvalidated') return 'Not calibrated';
  if (value === 'synthetic') return 'Practice';
  return value;
}

function qualityText(flags) {
  if (!flags.length) return state.source === 'demo' ? 'Practice' : 'OK';
  return flags.map((flag) => flagNames[flag] || flag).join(', ');
}

function renderDevices() {
  const devices = state.devices.filter((device) => Boolean(device.demo) === (state.source === 'demo'));
  const filter = $('#device-filter');
  filter.innerHTML = '<option value="all">All sensors</option>' +
    devices.map((device) => `<option value="${escapeHtml(device.id)}">${escapeHtml(device.name)}</option>`).join('');
  if (!devices.some((device) => device.id === state.device)) state.device = 'all';
  filter.value = state.device;

  const emptyText = state.source === 'demo'
    ? 'No practice sensors in this view.'
    : 'No sensors yet. Use “Register a sensor” to add the first one.';
  $('#device-cards').innerHTML = devices.map((device) => `
    <article class="device-card">
      <span class="device-symbol" aria-hidden="true">⌖</span>
      <h3>${escapeHtml(device.name)}</h3>
      <p>${escapeHtml(device.location)}</p>
      <span class="tag ${device.status === 'offline' ? 'warn' : 'good'}">${escapeHtml(statusNames[device.status] || device.status)}</span>
      <dl>
        <dt>Sensor ID</dt><dd>${escapeHtml(device.id)}</dd>
        <dt>Firmware</dt><dd>${escapeHtml(device.firmware)}</dd>
        <dt>Calibration</dt><dd>${escapeHtml(calibrationText(device.calibration))}</dd>
        <dt>Readings</dt><dd>${Number(device.readings).toLocaleString()}</dd>
        <dt>Last seen (UTC)</dt><dd>${device.last_seen ? time(device.last_seen) : 'Not yet'}</dd>
      </dl>
    </article>
  `).join('') || `<div class="empty-block">${emptyText}</div>`;

  const positions = [[34, 48], [16, 24], [72, 65]];
  $('#map-pins').innerHTML = devices.slice(0, 3).map((device, index) => {
    const side = positions[index][0] > 55 ? ' right' : '';
    return `<button type="button" class="map-pin${side}" style="left:${positions[index][0]}%;top:${positions[index][1]}%" aria-label="Show ${escapeHtml(device.name)}" data-device="${escapeHtml(device.id)}"><span>${escapeHtml(device.name)}</span></button>`;
  }).join('');
  $$('[data-device]').forEach((button) => {
    button.onclick = () => {
      state.device = button.dataset.device;
      refresh();
    };
  });

  const reporting = devices.filter((device) => device.status === 'online').length;
  const countLabel = state.source === 'demo' ? 'practice sensors' : 'registered sensors';
  const middle = state.source === 'demo'
    ? '<span>Example layout</span>'
    : `<span><b>${reporting}</b> reporting now</span>`;
  $('#network-summary').innerHTML =
    `<span><b>${devices.length}</b> ${countLabel}</span>${middle}<span>Not in decibels</span>`;
}

function trendChart(series, threshold) {
  if (!series.length) {
    return '<div class="empty-block">No readings in this time range.</div>';
  }
  const width = 780;
  const height = 240;
  const left = 42;
  const right = 16;
  const top = 18;
  const bottom = 32;
  const x = (index) => left + index / Math.max(1, series.length - 1) * (width - left - right);
  const y = (value) => height - bottom - value * (height - top - bottom);
  const points = series.map((item, index) => `${x(index).toFixed(1)},${y(item.index).toFixed(1)}`).join(' ');
  let grid = '';
  for (let value = 0; value <= 1; value += 0.25) {
    grid += `<line x1="${left}" y1="${y(value)}" x2="${width - right}" y2="${y(value)}" stroke="#4a2a78" stroke-dasharray="3 5"/>`;
    grid += `<text x="${left - 8}" y="${y(value) + 3}" fill="#e4dcf6" text-anchor="end" font-size="11">${value.toFixed(2)}</text>`;
  }
  for (let i = 0; i < 5; i++) {
    const index = Math.round(i / 4 * (series.length - 1));
    grid += `<text x="${x(index)}" y="${height - 8}" fill="#e4dcf6" text-anchor="middle" font-size="11">${time(series[index].timestamp).slice(0, 5)}</text>`;
  }
  const last = series[series.length - 1];
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Sound level over time">
    <defs>
      <linearGradient id="chartStroke" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#0B00CF"/>
        <stop offset="100%" stop-color="#FF2D2B"/>
      </linearGradient>
      <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0B00CF" stop-opacity=".35"/>
        <stop offset="100%" stop-color="#FF2D2B" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${grid}
    <line x1="${left}" y1="${y(threshold)}" x2="${width - right}" y2="${y(threshold)}" stroke="#C10A28" stroke-dasharray="5 5"/>
    <polygon points="${left},${height - bottom} ${points} ${x(series.length - 1)},${height - bottom}" fill="url(#chartFill)"/>
    <polyline points="${points}" fill="none" stroke="url(#chartStroke)" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(series.length - 1)}" cy="${y(last.index)}" r="4.5" fill="#FF2D2B"/>
  </svg>`;
}

function renderOverview(data) {
  state.overview = data;
  $('#metric-current').textContent = num(data.current);
  $('#metric-mean').textContent = num(data.mean);
  $('#metric-peak').textContent = num(data.peak);
  $('#metric-exceed').textContent = data.exceedances;
  $('#metric-samples').textContent = `${data.valid.toLocaleString()} valid readings · line at ${num(data.threshold, 2)}`;
  $('#trend-chart').innerHTML = trendChart(data.series, data.threshold);
  $('#chart-source').textContent = state.source === 'demo' ? 'Practice data' : 'Live sensors';
  $('#quality-note').textContent = `${data.valid.toLocaleString()} valid · ${data.flagged} flagged`;
  $('#row-count').textContent = `${data.total.toLocaleString()} readings`;
  const thresholdInput = $('#threshold-input');
  if (document.activeElement !== thresholdInput) thresholdInput.value = data.threshold;
  $('#class-note').textContent = state.source === 'demo'
    ? 'Example labels'
    : 'Labels from analysed recordings, when a sensor sent audio';

  const total = data.classes.reduce((sum, item) => sum + item.count, 0);
  $('#source-total').textContent = total.toLocaleString();
  let offset = 0;
  const ring = 408.407;
  $('#donut').innerHTML = '<circle cx="90" cy="90" r="65" fill="none" stroke="#4a2a78" stroke-width="16"/>' +
    (total ? data.classes.map((item, index) => {
      const length = item.count / total * ring;
      const slice = `<circle cx="90" cy="90" r="65" fill="none" stroke="${palette[index % palette.length]}" stroke-width="16" stroke-dasharray="${Math.max(0, length - 4)} ${ring - Math.max(0, length - 4)}" stroke-dashoffset="${-offset}"/>`;
      offset += length;
      return slice;
    }).join('') : '');
  $('#source-legend').innerHTML = total
    ? data.classes.map((item, index) => `<div><i style="background:${palette[index % palette.length]}"></i><span>${escapeHtml(item.label)}</span><b>${Math.round(item.count / total * 100)}%</b></div>`).join('')
    : '<p>No labels yet</p>';

  $('#observations-body').innerHTML = data.recent.map((row) => `
    <tr>
      <td>${escapeHtml(row.device_name)}</td>
      <td>${time(row.timestamp)}</td>
      <td><span class="index-inline">${num(row.level)}<i style="--pct:${row.level * 100}%"></i></span></td>
      <td class="wrap"><span class="tag">${escapeHtml(row.label)}</span></td>
      <td class="wrap"><span class="tag ${row.flags.length ? 'warn' : 'good'}">${escapeHtml(qualityText(row.flags))}</span></td>
    </tr>
  `).join('') || '<tr><td colspan="5">No readings for this filter.</td></tr>';

  $$('.mini-bars').forEach((el) => {
    el.innerHTML = data.series.slice(-18).map((item) => `<span style="height:${8 + item.index * 32}px"></span>`).join('');
  });
}

function renderAlerts(items) {
  const openCount = items.filter((item) => !item.acknowledged).length;
  $$('.alert-count').forEach((el) => { el.textContent = String(openCount); });
  $('#alerts-list').innerHTML = items.map((alert) => `
    <article class="alert-card">
      <span class="alert-icon" aria-hidden="true">◉</span>
      <div>
        <h3>Crossed the alert line · ${escapeHtml(alert.device_name)}</h3>
        <p>Level ${num(alert.level)} · ${new Date(alert.timestamp).toLocaleDateString('en-GB', { timeZone: 'UTC' })} ${time(alert.timestamp)} UTC · ${state.source === 'demo' ? 'practice' : 'live sensor'}</p>
      </div>
      ${alert.acknowledged
        ? '<span class="tag good">Seen</span>'
        : `<button type="button" class="button secondary" data-ack="${alert.id}">Mark as seen</button>`}
    </article>
  `).join('') || '<div class="panel empty-block">No alerts for this filter. Readings that cross the alert line show up here.</div>';

  $$('[data-ack]').forEach((button) => {
    button.onclick = async () => {
      if (!requireAdmin()) return;
      try {
        await api(`/api/alerts/${button.dataset.ack}/acknowledge`, { method: 'POST' });
        toast('Marked as seen');
        refresh();
      } catch (err) {
        toast(err.message, true);
      }
    };
  });
}

async function refresh() {
  if (state.busy) {
    refreshAgain = true;
    return;
  }
  state.busy = true;
  const snapshot = () => `${state.source}|${state.device}|${state.hours}`;
  const requested = snapshot();
  try {
    state.devices = await api('/api/devices');
    if (snapshot() !== requested) {
      refreshAgain = true;
      return;
    }
    renderDevices();
    const q = query();
    const [overview, alerts] = await Promise.all([
      api('/api/overview?' + q),
      api('/api/alerts?' + q)
    ]);
    if (snapshot() !== requested) {
      refreshAgain = true;
      return;
    }
    renderOverview(overview);
    renderAlerts(alerts);
    setConnection(true);
    lastProblem = '';
    if (state.page === 'forecast') await loadForecast();
  } catch (err) {
    setConnection(false);
    if (lastProblem !== err.message) {
      lastProblem = err.message;
      toast(err.message, true);
    }
  } finally {
    state.busy = false;
    if (refreshAgain) {
      refreshAgain = false;
      refresh();
    }
  }
}

async function loadForecast() {
  const requestId = ++forecastRequest;
  if (state.device === 'all') {
    $('#forecast-result').innerHTML = '<p>Choose one sensor in the filter above. A forecast is for a single place.</p>';
    $('#forecast-metrics').innerHTML = '';
    $('#forecast-note').textContent = 'Mixed sensors are not combined.';
    return;
  }
  try {
    const forecast = await api('/api/forecast?' + query());
    if (requestId !== forecastRequest) return;
    const where = forecast.source === 'demo' ? ' of practice data' : '';
    const stale = forecast.stale ? ' The latest reading is old, so this starts from that reading, not from now.' : '';
    $('#forecast-note').textContent = forecast.available
      ? `${forecast.selected_model} fit best, using ${forecast.training_bins} one-minute readings${where}.${stale}`
      : forecast.note;
    $('#forecast-result').innerHTML = forecast.available
      ? forecast.points.map((point) => `
          <div class="forecast-point">
            <small>In ${point.minutes} min</small>
            <strong>${num(point.index)}</strong>
            <small>level, 0 to 1</small>
          </div>`).join('')
      : `<p>${escapeHtml(forecast.note)}</p><p>More one-minute readings are needed before a forecast can be drawn.</p>`;
    $('#forecast-metrics').innerHTML = (forecast.metrics || []).map((metric) => `
      <article class="comparison-card ${metric.model === forecast.selected_model ? 'best' : ''}">
        <h4>${escapeHtml(metric.model)}${metric.model === forecast.selected_model ? ' · best fit' : ''}</h4>
        <small>Average error</small>
        <strong>${num(metric.mae, 4)}</strong>
        <p>${metric.n} past checks · RMSE ${num(metric.rmse, 4)}</p>
        <p>${forecast.source === 'demo' ? 'Checked on practice data only.' : 'Checked only on past readings.'}</p>
      </article>
    `).join('');
  } catch (err) {
    if (requestId !== forecastRequest) return;
    toast(err.message, true);
  }
}

function looksLikeWav(file) {
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  return name.endsWith('.wav') || type === 'audio/wav' || type === 'audio/wave' || type === 'audio/x-wav';
}

function clearSoundPictures() {
  const wave = $('#waveform-chart');
  wave.classList.add('empty');
  wave.textContent = 'No audio yet';
  $('#spectrogram').style.display = 'none';
  $('#audio-features').innerHTML = '';
  $('#audio-detail').textContent = 'The waveform and frequencies will show up here.';
}

async function analyse(file) {
  if (state.analysing) return;
  if (!looksLikeWav(file)) {
    toast('Please choose a WAV file (.wav).', true);
    return;
  }
  state.analysing = true;
  $('#dropzone').classList.add('loading');
  $('#sample-audio').disabled = true;
  $('#listen-btn').disabled = true;
  const resultBox = $('#classification-result');
  resultBox.classList.remove('is-error');
  resultBox.innerHTML = '<div class="model-orb" aria-hidden="true">≋</div><h2>Working on the sound…</h2><p>The first time can take a little longer while the model loads. The file is not saved.</p>';
  try {
    const form = new FormData();
    form.append('file', file);
    const result = await api('/api/audio/analyse', { method: 'POST', body: form });
    const found = result.classification || {};
    const probabilities = found.probabilities || [];
    const scores = probabilities.map((item) => `
      <div>
        <span>${escapeHtml(item.label)}</span>
        <b>${num(item.probability, 3)}</b>
        <i style="width:${Math.max(0, Math.min(100, item.probability * 100))}%"></i>
      </div>
    `).join('');
    resultBox.classList.toggle('is-error', found.available === false);
    resultBox.innerHTML = `
      <div class="model-orb" aria-hidden="true">✧</div>
      <h2>${escapeHtml(found.label || 'No label')}</h2>
      <p>${escapeHtml(found.note || '')}</p>
      ${scores ? `<p class="score-key">Score from 0 to 1. Higher means a stronger match. These are not percentages, and they may not add up to 1.</p><div class="ai-candidates">${scores}</div>` : ''}
      ${found.confidence != null ? `<p class="score-note">Top score ${num(found.confidence, 3)}</p>` : ''}
    `;
    $('#audio-detail').textContent =
      `${result.duration}s · ${result.sample_rate.toLocaleString()} Hz · ${result.dbfs} dBFS (digital level, not decibels)${result.clipping ? ' · the mic may have overloaded' : ''}`;

    const waveform = result.waveform || [];
    const wave = $('#waveform-chart');
    if (waveform.length) {
      const span = Math.max(1, waveform.length - 1);
      const points = waveform.map((value, index) => `${index / span * 1000},${55 - value * 50}`).join(' ');
      wave.classList.remove('empty');
      wave.innerHTML = `<svg viewBox="0 0 1000 110" role="img" aria-label="Waveform"><defs><linearGradient id="waveStroke" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#0B00CF"/><stop offset="100%" stop-color="#FF2D2B"/></linearGradient></defs><line x1="0" y1="55" x2="1000" y2="55" stroke="#3a1868"/><polyline points="${points}" fill="none" stroke="url(#waveStroke)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
    }

    const canvas = $('#spectrogram');
    const spec = result.spectrogram;
    if (spec && spec.length && spec[0] && spec[0].length) {
      const ctx = canvas.getContext('2d');
      canvas.style.display = 'block';
      canvas.width = spec[0].length;
      canvas.height = spec.length;
      const image = ctx.createImageData(canvas.width, canvas.height);
      spec.forEach((row, y) => row.forEach((value, x) => {
        const pixel = ((canvas.height - 1 - y) * canvas.width + x) * 4;
        const t = Math.max(0, Math.min(1, (value + 100) / 90));
        image.data[pixel] = Math.round(255 * t);
        image.data[pixel + 1] = Math.round(18 * (1 - t));
        image.data[pixel + 2] = Math.round(207 * (1 - t));
        image.data[pixel + 3] = 255;
      }));
      ctx.putImageData(image, 0, 0);
    } else {
      canvas.style.display = 'none';
    }

    $('#audio-features').innerHTML = Object.entries(result.features || {}).map(([key, value]) => `
      <div class="feature">
        <small>${escapeHtml(key.replaceAll('_', ' '))}</small>
        <strong>${num(value, key === 'centroid' || key === 'rolloff' ? 0 : 3)}${key === 'centroid' || key === 'rolloff' ? ' Hz' : ''}</strong>
      </div>
    `).join('');
    toast('Done. The audio was not saved.');
  } catch (err) {
    resultBox.classList.add('is-error');
    resultBox.innerHTML = `<h2>Could not read that file</h2><p>${escapeHtml(err.message)}</p>`;
    clearSoundPictures();
    toast(err.message, true);
  } finally {
    state.analysing = false;
    $('#dropzone').classList.remove('loading');
    $('#sample-audio').disabled = false;
    $('#listen-btn').disabled = false;
    $('#listen-btn').textContent = 'Listen for 3 seconds';
    $('#listen-btn').removeAttribute('aria-busy');
  }
}

function makeWavFile(samples, rate, name) {
  const n = samples.length;
  const buffer = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buffer);
  const writeString = (offset, text) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + n * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) view.setInt16(44 + i * 2, samples[i], true);
  return new File([buffer], name, { type: 'audio/wav' });
}

function makeTestTone() {
  const rate = 16000;
  const n = rate * 3;
  const samples = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    samples[i] = Math.sin(i / rate * Math.PI * 2 * (440 + 100 * Math.sin(i / rate))) * 9000;
  }
  return makeWavFile(samples, rate, 'test-tone.wav');
}

let micStream = null;
let micContext = null;
let micTimer = null;
let micDone = null;

function stopMic() {
  if (micTimer) {
    clearTimeout(micTimer);
    micTimer = null;
  }
  if (micStream) {
    micStream.getTracks().forEach((track) => track.stop());
    micStream = null;
  }
  if (micContext) {
    micContext.close();
    micContext = null;
  }
  if (micDone) {
    const done = micDone;
    micDone = null;
    done(false);
  }
  const button = $('#listen-btn');
  if (button && !state.analysing) {
    button.disabled = false;
    button.textContent = 'Listen for 3 seconds';
    button.removeAttribute('aria-busy');
  }
}

function listenMessage(text, problem) {
  const note = $('#listen-status');
  note.textContent = text;
  if (problem) toast(text, true);
}

function waitThreeSeconds() {
  return new Promise((resolve) => {
    micDone = resolve;
    micTimer = setTimeout(() => {
      micTimer = null;
      if (!micDone) return;
      micDone = null;
      resolve(true);
    }, 3000);
  });
}

async function listenForThreeSeconds() {
  if (state.analysing || micStream) return;
  const button = $('#listen-btn');
  const note = $('#listen-status');
  if (!note.dataset.rest) note.dataset.rest = note.textContent;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.AudioContext) {
    listenMessage('This browser cannot use the microphone. Choose a WAV file instead.', true);
    return;
  }
  button.disabled = true;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    button.disabled = false;
    const name = err && err.name;
    const denied = name === 'NotAllowedError' || name === 'PermissionDeniedError';
    listenMessage(denied
      ? 'The microphone was blocked. Allow it in the browser and press Listen again, or choose a WAV file.'
      : 'The microphone could not start. You can choose a WAV file instead.', true);
    return;
  }
  if (state.page !== 'audio') {
    stream.getTracks().forEach((track) => track.stop());
    return;
  }
  micStream = stream;
  button.disabled = true;
  button.textContent = 'Listening…';
  button.setAttribute('aria-busy', 'true');
  note.textContent = 'Listening for 3 seconds. The microphone is on. This clip is not saved.';
  const pieces = [];
  try {
    micContext = new AudioContext();
    if (micContext.state === 'suspended') await micContext.resume();
    if (typeof micContext.createScriptProcessor !== 'function') {
      stopMic();
      listenMessage('This browser cannot record from the microphone. Choose a WAV file instead.', true);
      return;
    }
    const source = micContext.createMediaStreamSource(stream);
    // One channel, so the recording is mono even if the microphone is stereo.
    const processor = micContext.createScriptProcessor(4096, 1, 1);
    const silent = micContext.createGain();
    silent.gain.value = 0;
    processor.onaudioprocess = (event) => {
      pieces.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    };
    source.connect(processor);
    processor.connect(silent);
    silent.connect(micContext.destination);
    const finished = await waitThreeSeconds();
    if (micContext) {
      processor.onaudioprocess = null;
      processor.disconnect();
      source.disconnect();
    }
    const rate = micContext ? micContext.sampleRate : 0;
    stopMic();
    if (!finished || state.page !== 'audio') {
      if (note.dataset.rest) note.textContent = note.dataset.rest;
      return;
    }
    let total = 0;
    pieces.forEach((piece) => { total += piece.length; });
    if (!total || !rate) {
      listenMessage('No sound was captured. Try again, or choose a WAV file.', true);
      return;
    }
    const pcm = new Int16Array(total);
    let offset = 0;
    pieces.forEach((piece) => {
      for (let i = 0; i < piece.length; i++) {
        const clamped = Math.max(-1, Math.min(1, piece[i]));
        pcm[offset] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
        offset += 1;
      }
    });
    if (note.dataset.rest) note.textContent = note.dataset.rest;
    await analyse(makeWavFile(pcm, rate, 'listen-3s.wav'));
  } catch (err) {
    stopMic();
    if (state.page === 'audio') listenMessage('The microphone could not record. You can choose a WAV file instead.', true);
  }
}

async function aiStatus() {
  const pill = $('#ai-status');
  try {
    const status = await api('/api/ai/status');
    pill.classList.remove('ready', 'warn', 'bad');
    if (status.ready) {
      pill.textContent = 'AI ready';
      pill.classList.add('ready');
      pill.title = status.model_id || '';
    } else {
      pill.textContent = 'AI not set up';
      pill.classList.add('warn');
      pill.title = status.setup || '';
    }
  } catch (err) {
    pill.classList.remove('ready', 'warn');
    pill.classList.add('bad');
    pill.textContent = 'AI status unknown';
    pill.title = '';
  }
}

function setSource(source, button) {
  state.source = source;
  state.device = 'all';
  $$('[data-source]').forEach((item) => {
    const on = item === button;
    item.classList.toggle('selected', on);
    item.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  $('#mode-note').innerHTML = source === 'demo'
    ? '<b>Practice data</b><span>These readings are examples so you can explore. They are not real measurements.</span>'
    : '<b>Live sensors</b><span>These readings come from registered devices. The number is a unitless index, not decibels.</span>';
  $('#workspace-label').innerHTML = source === 'demo'
    ? 'Practice walk<small>Example readings, not real measurements</small>'
    : 'Live sensors<small>Readings from your devices</small>';
  $('#tick-btn').hidden = source !== 'demo';
  refresh();
}

$$('nav button').forEach((button) => { button.onclick = () => page(button.dataset.page); });
$$('[data-goto]').forEach((button) => { button.onclick = () => page(button.dataset.goto); });
window.addEventListener('hashchange', () => {
  const name = location.hash.slice(1);
  if (name !== state.page) page(name);
});

$$('[data-source]').forEach((button) => {
  button.onclick = () => setSource(button.dataset.source, button);
});

$('#device-filter').onchange = (event) => { state.device = event.target.value; refresh(); };
$('#hours-filter').onchange = (event) => { state.hours = Number(event.target.value); refresh(); };
$('#forecast-refresh').onclick = loadForecast;
$('#export-btn').onclick = () => {
  const link = document.createElement('a');
  link.href = '/api/export.csv?' + query();
  link.download = 'kaanam-observations.csv';
  link.click();
};
$('#tick-btn').onclick = async () => {
  if (!requireAdmin()) return;
  try {
    await api('/api/demo/tick', { method: 'POST' });
    await refresh();
    toast('Practice reading added');
  } catch (err) {
    toast(err.message, true);
  }
};
$('#auth-btn').onclick = showAuthDialog;
$('#auth-btn-mobile').onclick = showAuthDialog;
$$('[data-close]').forEach((button) => { button.onclick = () => button.closest('dialog').close(); });
$$('dialog').forEach((dialog) => {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
});

$('#auth-form').onsubmit = async (event) => {
  event.preventDefault();
  const previous = state.admin;
  const submit = event.target.querySelector('button[type="submit"]');
  submit.disabled = true;
  state.admin = $('#admin-token').value.trim();
  try {
    await api('/api/admin/check', { method: 'POST' });
    $('#auth-dialog').close();
    $('#admin-token').value = '';
    setAdminButton(true);
    toast('Admin tools are on for this tab');
  } catch (err) {
    state.admin = previous;
    setAdminButton(Boolean(previous));
    toast(err.message, true);
  } finally {
    submit.disabled = false;
  }
};

$('#add-device').onclick = () => {
  if (!requireAdmin()) return;
  $('#device-form').hidden = false;
  $('#device-token-result').hidden = true;
  showDeviceDialog();
};

$('#device-form').onsubmit = async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target));
  payload.id = payload.id.trim();
  payload.name = payload.name.trim();
  payload.location = payload.location.trim();
  if (!/^[a-zA-Z0-9_-]{3,48}$/.test(payload.id)) {
    toast('Sensor ID should be 3 to 48 characters: letters, numbers, _ or -.', true);
    return;
  }
  if (!payload.name || !payload.location) {
    toast('Add a name and a place for this sensor.', true);
    return;
  }
  const submit = event.target.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const result = await api('/api/devices', { method: 'POST', body: JSON.stringify(payload) });
    $('#device-form').hidden = true;
    $('#device-token-result').hidden = false;
    $('#device-token-result').innerHTML = `
      <h2>Sensor registered</h2>
      <p>Copy this token into the device now. It will not be shown again. Closing this box does not remove the sensor.</p>
      <code id="device-token-value">${escapeHtml(result.device_token)}</code>
      <p>Sensor ID: ${escapeHtml(result.id)}</p>
      <button type="button" class="button secondary full" id="copy-token">Copy token</button>
      <button type="button" class="button full" id="token-done">I have saved the token</button>
    `;
    $('#copy-token').onclick = async () => {
      try {
        await navigator.clipboard.writeText(result.device_token);
        toast('Token copied');
      } catch (err) {
        toast('Select the token and copy it manually.', true);
      }
    };
    $('#token-done').onclick = () => {
      $('#device-token-result').innerHTML = '';
      $('#device-dialog').close();
    };
    event.target.reset();
    refresh();
  } catch (err) {
    toast(err.message, true);
  } finally {
    submit.disabled = false;
  }
};

$('#threshold-form').onsubmit = async (event) => {
  event.preventDefault();
  if (!requireAdmin()) return;
  try {
    await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ threshold: Number($('#threshold-input').value) })
    });
    toast('Saved. New readings use this line. Older alerts stay as they are.');
    refresh();
  } catch (err) {
    toast(err.message, true);
  }
};

$('#audio-file').onchange = (event) => {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (file) analyse(file);
};
const dropzone = $('#dropzone');
dropzone.ondragover = (event) => { event.preventDefault(); dropzone.classList.add('drag'); };
dropzone.ondragleave = () => dropzone.classList.remove('drag');
dropzone.ondrop = (event) => {
  event.preventDefault();
  dropzone.classList.remove('drag');
  if (event.dataTransfer.files[0]) analyse(event.dataTransfer.files[0]);
};
$('#sample-audio').onclick = () => analyse(makeTestTone());
$('#listen-btn').onclick = () => listenForThreeSeconds();
window.addEventListener('pagehide', stopMic);

const today = new Date();
const dateLabel = $('#date-label');
dateLabel.textContent = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
dateLabel.title = 'Your local date. Chart times are UTC.';

page(location.hash.slice(1) || 'overview');
refresh();
setInterval(refresh, 10000);
aiStatus();
setInterval(aiStatus, 30000);
