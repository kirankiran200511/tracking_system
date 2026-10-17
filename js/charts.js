// Tiny dependency-free SVG chart kit. Every chart has a hover tooltip, one y-axis,
// recessive gridlines, 4px rounded data-ends and 2px surface gaps between fills.
const Charts = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const tip = () => document.getElementById('tooltip');

  function showTip(evt, html) {
    const t = tip();
    t.innerHTML = html;
    t.hidden = false;
    const pad = 14, w = t.offsetWidth, h = t.offsetHeight;
    let x = evt.clientX + pad, y = evt.clientY + pad;
    if (x + w > window.innerWidth - 8) x = evt.clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = evt.clientY - h - pad;
    t.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  }
  const hideTip = () => { tip().hidden = true; };

  function niceTicks(max, count = 4) {
    if (max <= 0) return [0, 1];
    const raw = max / count;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
    const ticks = [];
    for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
    if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
    return ticks;
  }

  const el = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    parent?.appendChild(n);
    return n;
  };

  // Column path with rounded top corners only (anchored flat to the baseline).
  function colPath(x, y, w, h, r = 4) {
    if (h <= 0) return '';
    r = Math.min(r, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  function frame(host, height) {
    host.innerHTML = '';
    const width = Math.max(host.clientWidth, 260);
    const svg = el('svg', { width, height, viewBox: `0 0 ${width} ${height}`, class: 'chart-svg', role: 'img' }, host);
    return { svg, width, height };
  }

  function yAxis(svg, ticks, y, left, right, fmt) {
    const g = el('g', { class: 'axis' }, svg);
    ticks.forEach((v, i) => {
      el('line', { x1: left, x2: right, y1: y(v), y2: y(v), class: i === 0 ? 'baseline' : 'grid' }, g);
      const t = el('text', { x: left - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'tick' }, g);
      t.textContent = fmt(v);
    });
  }

  /**
   * Column chart. data: [{label, key, values:{seriesKey:n}}]; series: [{key,name,color}]
   * mode: 'stack' | 'group'
   */
  function columns(host, { data, series, mode = 'stack', height = 240, fmt = U.moneyC, tipLabel = (d) => d.label, onClick, labelEvery }) {
    const { svg, width } = frame(host, height);
    const m = { t: 12, r: 8, b: 26, l: 56 };
    const iw = width - m.l - m.r, ih = height - m.t - m.b;
    const totalOf = (d) => (mode === 'stack' ? U.sum(series, (s) => d.values[s.key]) : Math.max(...series.map((s) => d.values[s.key] || 0)));
    const max = Math.max(...data.map(totalOf), 0);
    const ticks = niceTicks(max);
    const top = ticks[ticks.length - 1] || 1;
    const y = (v) => m.t + ih - (v / top) * ih;
    yAxis(svg, ticks, y, m.l, width - m.r, fmt);

    const n = data.length || 1;
    const slot = iw / n;
    const gap = Math.min(Math.max(slot * 0.25, 2), 14);
    const bw = Math.max(slot - gap, 1);
    const every = labelEvery || Math.ceil(n / Math.max(Math.floor(iw / 64), 1));

    data.forEach((d, i) => {
      const x0 = m.l + i * slot + gap / 2;
      const g = el('g', { class: 'col' }, svg);
      if (mode === 'stack') {
        let acc = 0;
        const visible = series.filter((s) => (d.values[s.key] || 0) > 0);
        visible.forEach((s, si) => {
          const v = d.values[s.key] || 0;
          const y1 = y(acc + v), y0 = y(acc);
          const isTop = si === visible.length - 1;
          const h = Math.max(y0 - y1 - (si > 0 ? 2 : 0), 0); // 2px surface gap between stacked segments
          if (h > 0) el('path', { d: isTop ? colPath(x0, y1, bw, h, 4) : `M${x0},${y1}h${bw}v${h}h${-bw}Z`, fill: s.color, class: 'mark' }, g);
          acc += v;
        });
      } else {
        const inner = bw / series.length;
        series.forEach((s, si) => {
          const v = d.values[s.key] || 0;
          const h = y(0) - y(v);
          el('path', { d: colPath(x0 + si * inner + (si ? 1 : 0), y(v), inner - (series.length > 1 ? 2 : 0), h, 4), fill: s.color, class: 'mark' }, g);
        });
      }
      if (i % every === 0) {
        const t = el('text', { x: x0 + bw / 2, y: height - 8, 'text-anchor': 'middle', class: 'tick' }, svg);
        t.textContent = d.label;
      }
      const hit = el('rect', { x: m.l + i * slot, y: m.t, width: slot, height: ih, class: 'hit' }, g);
      hit.addEventListener('mousemove', (e) => {
        g.classList.add('hover');
        const rows = series.map((s) => `<div class="tip-row"><i style="background:${s.color}"></i>${U.esc(s.name)}<b>${U.money(d.values[s.key] || 0)}</b></div>`).join('');
        const total = series.length > 1 && mode === 'stack' ? `<div class="tip-row tip-total">Total<b>${U.money(totalOf(d))}</b></div>` : '';
        showTip(e, `<div class="tip-title">${U.esc(tipLabel(d))}</div>${rows}${total}${onClick ? '<div class="tip-hint">Click to see transactions</div>' : ''}`);
      });
      hit.addEventListener('mouseleave', () => { g.classList.remove('hover'); hideTip(); });
      if (onClick) { hit.style.cursor = 'pointer'; hit.addEventListener('click', () => { hideTip(); onClick(d); }); }
    });
    svg.setAttribute('aria-label', `Column chart of ${series.map((s) => s.name).join(', ')}`);
  }

  /** Line / area chart. data: [{label, date, value}] single series */
  function line(host, { data, height = 220, color = 'var(--s1)', fmt = U.moneyC, area = true, tipLabel = (d) => d.label, name = 'Value', zeroBase = true }) {
    const { svg, width } = frame(host, height);
    const m = { t: 12, r: 12, b: 26, l: 60 };
    const iw = width - m.l - m.r, ih = height - m.t - m.b;
    if (!data.length) return;
    const vals = data.map((d) => d.value);
    let lo = zeroBase ? Math.min(0, ...vals) : Math.min(...vals), hi = Math.max(...vals);
    if (!zeroBase) { const pad = (hi - lo) * 0.1 || Math.abs(hi) * 0.1 || 1; lo -= pad; hi += pad; }
    let ticks = niceTicks(hi - lo);
    if (lo !== 0) {
      const step = ticks[1] - ticks[0] || 1;
      const start = Math.floor(lo / step) * step;
      ticks = [];
      for (let v = start; v < hi + step; v += step) ticks.push(v);
    }
    const t0 = ticks[0], t1 = ticks[ticks.length - 1];
    const y = (v) => m.t + ih - ((v - t0) / (t1 - t0 || 1)) * ih;
    const x = (i) => m.l + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
    yAxis(svg, ticks, y, m.l, width - m.r, fmt);
    const pts = data.map((d, i) => [x(i), y(d.value)]);
    const dLine = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
    if (area) el('path', { d: `${dLine}L${pts[pts.length - 1][0]},${y(Math.max(t0, 0))}L${pts[0][0]},${y(Math.max(t0, 0))}Z`, fill: color, class: 'area' }, svg);
    el('path', { d: dLine, stroke: color, class: 'line' }, svg);
    const every = Math.ceil(data.length / Math.max(Math.floor(iw / 72), 1));
    data.forEach((d, i) => {
      if (i % every) return;
      const t = el('text', { x: x(i), y: height - 8, 'text-anchor': 'middle', class: 'tick' }, svg);
      t.textContent = d.label;
    });
    const last = pts[pts.length - 1];
    el('circle', { cx: last[0], cy: last[1], r: 4, fill: color, class: 'dot' }, svg);
    const cross = el('line', { y1: m.t, y2: m.t + ih, class: 'crosshair', visibility: 'hidden' }, svg);
    const dot = el('circle', { r: 5, fill: color, class: 'dot', visibility: 'hidden' }, svg);
    const hit = el('rect', { x: m.l, y: m.t, width: iw, height: ih, class: 'hit' }, svg);
    hit.addEventListener('mousemove', (e) => {
      const r = svg.getBoundingClientRect();
      const px = (e.clientX - r.left) * (width / r.width);
      const i = Math.max(0, Math.min(data.length - 1, Math.round(((px - m.l) / iw) * (data.length - 1))));
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(data[i].value)); dot.setAttribute('visibility', 'visible');
      showTip(e, `<div class="tip-title">${U.esc(tipLabel(data[i]))}</div><div class="tip-row"><i style="background:${color}"></i>${U.esc(name)}<b>${U.money(data[i].value)}</b></div>`);
    });
    hit.addEventListener('mouseleave', () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); hideTip(); });
    svg.setAttribute('aria-label', `Line chart of ${name}`);
  }

  /** Ranked horizontal bars as HTML (labels stay in ink colors; the bar carries magnitude). */
  function ranked(host, { rows, total, onClick, icon, sub, max = 10, color = 'var(--s1)', fmt = U.money }) {
    const top = rows.slice(0, max);
    const peak = top[0]?.value || 1;
    host.innerHTML = top.length ? `<ol class="ranked">${top.map((r, i) => `
      <li class="ranked-row${onClick ? ' clickable' : ''}" data-i="${i}" tabindex="${onClick ? 0 : -1}">
        <div class="ranked-label">${icon ? `<span class="ranked-icon">${icon(r)}</span>` : ''}<span class="ranked-name">${U.esc(r.key)}</span>${sub ? `<span class="ranked-sub">${sub(r)}</span>` : ''}</div>
        <div class="ranked-bar"><span style="width:${Math.max((r.value / peak) * 100, 1.5)}%;background:${color}"></span></div>
        <div class="ranked-val">${fmt(r.value)}${total ? `<small>${U.pct(r.value / total)}</small>` : ''}</div>
      </li>`).join('')}</ol>${rows.length > max ? `<p class="muted small">+ ${rows.length - max} more</p>` : ''}` : empty('Nothing here for this filter yet.');
    if (onClick) U.$$('.ranked-row', host).forEach((li) => {
      const go = () => onClick(top[Number(li.dataset.i)]);
      li.addEventListener('click', go);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    });
  }

  /** GitHub-style calendar heatmap, sequential single hue. days: [{date, value}] */
  function calendar(host, { days, onClick }) {
    host.innerHTML = '';
    if (!days.length) return;
    const max = Math.max(...days.map((d) => d.value), 1);
    const steps = ['var(--seq-0)', 'var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)'];
    const level = (v) => (v <= 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)));
    const first = U.parseISO(days[0].date);
    const offset = (first.getDay() + 6) % 7; // Monday-first rows
    const weeks = Math.ceil((days.length + offset) / 7);
    const cell = Math.min(Math.max(Math.floor((host.clientWidth - 40) / weeks) - 3, 10), 22);
    const svgW = 34 + weeks * (cell + 3), svgH = 18 + 7 * (cell + 3);
    const svg = el('svg', { width: svgW, height: svgH, viewBox: `0 0 ${svgW} ${svgH}`, class: 'chart-svg calendar', role: 'img', 'aria-label': 'Daily spending calendar' }, host);
    ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'].forEach((l, i) => { if (l) { const t = el('text', { x: 0, y: 18 + i * (cell + 3) + cell * 0.75, class: 'tick' }, svg); t.textContent = l; } });
    let lastMonth = -1, lastLabelX = -99;
    days.forEach((d, idx) => {
      const pos = idx + offset, w = Math.floor(pos / 7), r = pos % 7;
      const dt = U.parseISO(d.date);
      const lx = 34 + w * (cell + 3);
      if (dt.getMonth() !== lastMonth && (idx === 0 || dt.getDate() === 1 || r === 0)) {
        lastMonth = dt.getMonth();
        if (lx - lastLabelX >= 30) { const t = el('text', { x: lx, y: 10, class: 'tick' }, svg); t.textContent = U.MONTHS[lastMonth]; lastLabelX = lx; }
      }
      const rect = el('rect', { x: 34 + w * (cell + 3), y: 18 + r * (cell + 3), width: cell, height: cell, rx: 3, fill: steps[level(d.value)], class: 'cal-cell' }, svg);
      rect.addEventListener('mousemove', (e) => showTip(e, `<div class="tip-title">${U.DAYS[dt.getDay()]}, ${U.fmtDate(d.date)}</div><div class="tip-row">Spent<b>${U.money(d.value)}</b></div>`));
      rect.addEventListener('mouseleave', hideTip);
      if (onClick) { rect.style.cursor = 'pointer'; rect.addEventListener('click', () => { hideTip(); onClick(d); }); }
    });
    const legend = document.createElement('div');
    legend.className = 'cal-legend';
    legend.innerHTML = `<span>Less</span>${steps.map((s) => `<i style="background:${s}"></i>`).join('')}<span>More</span><span class="muted">· darkest ≈ ${U.moneyC(max)}/day</span>`;
    host.appendChild(legend);
  }

  /** 100% stacked horizontal bar (allocation). parts: [{name, value, color}] */
  function share(host, parts) {
    const total = U.sum(parts, (p) => p.value) || 1;
    host.innerHTML = `<div class="share-bar">${parts.map((p) => `<span style="flex:${p.value};background:${p.color}" data-tip="${U.esc(p.name)}: ${U.money(p.value)} (${U.pct(p.value / total)})"></span>`).join('')}</div>
      <ul class="legend">${parts.map((p) => `<li><i style="background:${p.color}"></i>${U.esc(p.name)} <b>${U.pct(p.value / total)}</b></li>`).join('')}</ul>`;
    U.$$('.share-bar span', host).forEach((s) => {
      s.addEventListener('mousemove', (e) => showTip(e, `<div class="tip-title">${s.dataset.tip}</div>`));
      s.addEventListener('mouseleave', hideTip);
    });
  }

  function spark(values, color = 'var(--s1)', w = 90, h = 26) {
    if (values.length < 2) return '';
    const max = Math.max(...values, 1), min = Math.min(...values, 0);
    const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / (max - min || 1)) * (h - 4)).toFixed(1)}`).join(' ');
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }

  const legend = (series) => `<ul class="legend">${series.map((s) => `<li><i style="background:${s.color}"></i>${U.esc(s.name)}</li>`).join('')}</ul>`;
  const empty = (msg) => `<div class="empty-mini">${msg}</div>`;

  return { columns, line, ranked, calendar, share, spark, legend, empty, showTip, hideTip };
})();
