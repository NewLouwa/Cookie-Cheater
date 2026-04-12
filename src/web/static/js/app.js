// CookieCheater Dashboard Client

let ws = null;
let cpsChart = null;
let cpsData = [];
const MAX_CHART_POINTS = 200;

function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}/ws`);

    ws.onopen = () => {
        document.getElementById('connection-status').textContent = 'Connected';
        document.getElementById('connection-status').className = 'tag tag-green';
    };

    ws.onclose = () => {
        document.getElementById('connection-status').textContent = 'Disconnected';
        document.getElementById('connection-status').className = 'tag tag-red';
        setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.error) return;
            updateDashboard(data);
        } catch (e) {}
    };
}

function formatNumber(n) {
    if (n === undefined || n === null) return '0';
    if (n < 1000) return n.toFixed(1);
    if (n < 1e6) return (n / 1e3).toFixed(1) + 'K';
    if (n < 1e9) return (n / 1e6).toFixed(2) + 'M';
    if (n < 1e12) return (n / 1e9).toFixed(2) + 'B';
    if (n < 1e15) return (n / 1e12).toFixed(2) + 'T';
    if (n < 1e18) return (n / 1e15).toFixed(2) + 'Qa';
    if (n < 1e21) return (n / 1e18).toFixed(2) + 'Qi';
    if (n < 1e24) return (n / 1e21).toFixed(2) + 'Sx';
    if (n < 1e27) return (n / 1e24).toFixed(2) + 'Sp';
    return n.toExponential(2);
}

function formatTime(seconds) {
    if (seconds < 60) return seconds + 's';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
}

function updateDashboard(data) {
    // Top metrics
    document.getElementById('cookies').textContent = formatNumber(data.cookies);
    document.getElementById('cps').textContent = formatNumber(data.cps) + '/s';
    document.getElementById('prestige').textContent = formatNumber(data.prestige);
    document.getElementById('heavenly-chips').textContent = formatNumber(data.heavenlyChips);
    document.getElementById('lumps').textContent = data.lumps || 0;
    document.getElementById('season').textContent = data.season || 'none';

    // Lucky bank bar
    const luckyPct = data.luckyBankPct || 0;
    const luckyBar = document.getElementById('lucky-bar');
    const luckyText = document.getElementById('lucky-text');
    luckyBar.style.width = Math.min(100, luckyPct) + '%';
    luckyText.textContent = luckyPct + '%';
    if (luckyPct >= 100) {
        luckyBar.style.background = 'linear-gradient(90deg, #4ade80, #86efac)';
    } else if (luckyPct >= 50) {
        luckyBar.style.background = 'linear-gradient(90deg, #fbbf24, #fcd34d)';
    } else {
        luckyBar.style.background = 'linear-gradient(90deg, #f87171, #fca5a5)';
    }

    // Combo indicator
    const comboMetric = document.getElementById('combo-metric');
    if (data.comboActive && data.comboScore > 1) {
        comboMetric.style.display = '';
        document.getElementById('combo-score').textContent = 'x' + formatNumber(data.comboScore);
    } else {
        comboMetric.style.display = 'none';
    }

    // Phase tag
    const phaseEl = document.getElementById('phase');
    phaseEl.textContent = data.phase || 'unknown';
    phaseEl.className = 'tag tag-' + ({ early: 'yellow', mid: 'blue', late: 'green', endgame: 'red' }[data.phase] || 'yellow');

    // Purchaser phase
    const ppEl = document.getElementById('purchaser-phase');
    if (data.purchaserPhase) {
        ppEl.textContent = data.purchaserPhase;
    }

    // Uptime
    if (data.uptime !== undefined) {
        document.getElementById('uptime').textContent = formatTime(data.uptime);
    }

    // Bot stats
    if (data.stats) {
        document.getElementById('total-clicks').textContent = formatNumber(data.stats.totalClicks);
        document.getElementById('golden-clicked').textContent = data.stats.goldenCookiesClicked || 0;
        document.getElementById('buildings-bought').textContent = data.stats.buildingsBought || 0;
        document.getElementById('upgrades-bought').textContent = data.stats.upgradesBought || 0;
        document.getElementById('ascensions').textContent = data.stats.ascensions || 0;
    }

    // Buffs
    const buffsEl = document.getElementById('buffs-list');
    if (data.buffs && data.buffs.length > 0) {
        buffsEl.innerHTML = data.buffs.map(b => {
            let cls = 'buff';
            let info = b.name;
            if (b.multClick > 1) { cls += ' buff-click'; info += ` (x${b.multClick})`; }
            else if (b.multCpS > 1) { cls += ' buff-cps'; info += ` (x${b.multCpS})`; }
            return `<span class="${cls}">${info}</span>`;
        }).join('');
    } else {
        buffsEl.innerHTML = '<span class="dim">None</span>';
    }

    // Buildings table
    if (data.buildings) {
        const tbody = document.querySelector('#buildings-table tbody');
        tbody.innerHTML = data.buildings
            .filter(b => !b.locked && b.amount > 0)
            .map(b => `<tr>
                <td>${b.name}</td>
                <td>${b.amount}</td>
                <td>${formatNumber(b.totalCps)}/s</td>
                <td>${formatNumber(b.price)}</td>
            </tr>`).join('');
    }

    // Stock Market
    if (data.market) {
        const mInfo = document.getElementById('market-info');
        mInfo.innerHTML = `
            <span><span class="mi-label">Brokers:</span> <span class="mi-value">${data.market.brokers}</span></span>
            <span><span class="mi-label">OH:</span> <span class="mi-value">${data.market.overhead}%</span></span>
            <span><span class="mi-label">Profit:</span> <span class="mi-value ${data.market.profit >= 0 ? 'mode-rise' : 'mode-fall'}">$${data.market.profit}</span></span>
            <span><span class="mi-label">Office:</span> <span class="mi-value">${data.market.officeLevel}</span></span>
        `;

        const mtbody = document.querySelector('#market-table tbody');
        mtbody.innerHTML = data.market.goods.map(g => {
            const modeClass = g.modeId === 0 ? 'mode-stable' :
                              g.modeId === 1 || g.modeId === 3 ? 'mode-rise' :
                              g.modeId === 2 || g.modeId === 4 ? 'mode-fall' : 'mode-chaotic';
            const ratioClass = g.ratio < 30 ? 'ratio-great' :
                               g.ratio < 60 ? 'ratio-good' :
                               g.ratio < 120 ? 'ratio-neutral' :
                               g.ratio < 180 ? 'ratio-warn' : 'ratio-danger';
            const deltaSign = g.delta > 0 ? '+' : '';
            const held = g.stock > 0 ? `<strong>${g.stock}</strong>/${g.maxStock}` : `0/${g.maxStock}`;
            return `<tr>
                <td title="${g.name}"><strong>${g.symbol}</strong></td>
                <td>$${g.val}</td>
                <td class="dim">$${g.restingVal}</td>
                <td class="${ratioClass}">${g.ratio}%</td>
                <td class="${modeClass}">${g.mode}</td>
                <td>${g.dur}</td>
                <td class="${g.delta > 0 ? 'mode-rise' : g.delta < 0 ? 'mode-fall' : ''}">${deltaSign}${g.delta}</td>
                <td>${held}</td>
            </tr>`;
        }).join('');
    }

    // Strategy panel
    if (data.strategy) updateStrategy(data.strategy);

    // CPS chart
    updateChart(data.cps);
}

function updateStrategy(S) {
    // Priorities
    const priEl = document.getElementById('strategy-priorities');
    if (S.priorities && S.priorities.length > 0) {
        priEl.innerHTML = S.priorities.slice(0, 5).map(p => {
            const barColor = { critical: '#f87171', high: '#fbbf24', medium: '#60a5fa', low: '#6b6b8a' }[p.urgency] || '#6b6b8a';
            const barHtml = p.progress >= 0
                ? `<div class="priority-bar"><div class="priority-bar-fill" style="width:${p.progress}%;background:${barColor}"></div></div>`
                : '';
            return `<div class="priority-item ${p.urgency}">
                <span class="priority-urgency ${p.urgency}">${p.urgency}</span>
                <span class="priority-label">${p.label}</span>
                ${barHtml}
                <span class="priority-reason">${p.reason}</span>
            </div>`;
        }).join('');
    } else {
        priEl.innerHTML = '<span class="dim">No active priorities</span>';
    }

    // Short term goals
    const shortEl = document.getElementById('strategy-short');
    if (S.shortTermGoals && S.shortTermGoals.length > 0) {
        shortEl.innerHTML = S.shortTermGoals.map(g =>
            `<div class="goal-item">
                <span class="goal-action">${g.action}</span> ${g.target || ''}
                <span class="goal-reason">${g.reason}</span>
            </div>`
        ).join('');
    } else {
        shortEl.innerHTML = '<span class="dim">Monitoring...</span>';
    }

    // Long term goals
    const longEl = document.getElementById('strategy-long');
    if (S.longTermGoals && S.longTermGoals.length > 0) {
        longEl.innerHTML = S.longTermGoals.map(g => {
            const bar = g.progress >= 0
                ? `<div class="priority-bar" style="width:100%;margin-top:2px"><div class="priority-bar-fill" style="width:${g.progress}%;background:#a78bfa"></div></div>`
                : '';
            return `<div class="goal-item">
                ${g.label} ${bar}
                <span class="goal-reason">${g.reason}</span>
            </div>`;
        }).join('');
    } else {
        longEl.innerHTML = '<span class="dim">-</span>';
    }

    // Income breakdown
    const incEl = document.getElementById('strategy-income');
    if (S.incomeBreakdown && S.incomeBreakdown.top && S.incomeBreakdown.top.length > 0) {
        const maxPct = S.incomeBreakdown.top[0].pct;
        incEl.innerHTML = S.incomeBreakdown.top.map(b =>
            `<div class="income-row">
                <span class="income-name">${b.name}</span>
                <div class="income-bar-wrap"><div class="income-bar-fill" style="width:${b.pct / maxPct * 100}%"></div></div>
                <span class="income-pct">${b.pct}%</span>
            </div>`
        ).join('');
    } else {
        incEl.innerHTML = '<span class="dim">No income yet</span>';
    }
}

function updateChart(cps) {
    if (!cpsChart) initChart();

    const now = new Date();
    const label = String(now.getHours()).padStart(2, '0') + ':' +
                  String(now.getMinutes()).padStart(2, '0') + ':' +
                  String(now.getSeconds()).padStart(2, '0');

    cpsData.push({ label, value: cps });
    if (cpsData.length > MAX_CHART_POINTS) cpsData.shift();

    cpsChart.data.labels = cpsData.map(d => d.label);
    cpsChart.data.datasets[0].data = cpsData.map(d => d.value);
    cpsChart.update('none');
}

function initChart() {
    const ctx = document.getElementById('cps-chart').getContext('2d');
    cpsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'CPS',
                data: [],
                borderColor: '#e94560',
                backgroundColor: 'rgba(233, 69, 96, 0.08)',
                fill: true,
                tension: 0.3,
                pointRadius: 0,
                borderWidth: 1.5,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    display: true,
                    ticks: { color: '#6b6b8a', maxTicksLimit: 8, font: { size: 10 } },
                    grid: { color: 'rgba(255,255,255,0.03)' },
                },
                y: {
                    display: true,
                    ticks: { color: '#6b6b8a', callback: v => formatNumber(v), font: { size: 10 } },
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    type: 'logarithmic',
                }
            },
            plugins: { legend: { display: false } },
            animation: false,
        }
    });
}

// === API calls ===
let botRunning = true;

async function toggleBot() {
    const endpoint = botRunning ? '/api/bot/stop' : '/api/bot/start';
    await fetch(endpoint, { method: 'POST' });
    botRunning = !botRunning;
    document.getElementById('btn-startstop').textContent = botRunning ? 'Stop Bot' : 'Start Bot';
}

async function reinjectBot() {
    if (!confirm('Re-inject bot? This resets all module state.')) return;
    await fetch('/api/bot/reinject', { method: 'POST' });
    botRunning = true;
    document.getElementById('btn-startstop').textContent = 'Stop Bot';
}

async function toggleModule(key, enabled) {
    await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: enabled })
    });
}

async function saveGame() {
    const btn = event.target;
    btn.textContent = 'Saving...';
    const res = await fetch('/api/save', { method: 'POST' });
    const data = await res.json();
    btn.textContent = 'Saved!';
    setTimeout(() => btn.textContent = 'Save', 2000);
}

async function triggerAscend() {
    if (!confirm('Ascend now? This resets your current run.')) return;
    await fetch('/api/ascend', { method: 'POST' });
}

// Action log refresh
async function refreshActionLog() {
    try {
        const res = await fetch('/api/actions');
        const actions = await res.json();
        const logEl = document.getElementById('action-log');

        if (Array.isArray(actions) && actions.length > 0) {
            logEl.innerHTML = actions.slice(-60).map(a => {
                const t = new Date(a.time).toLocaleTimeString();
                const modCls = { market: 'module market', purchaser: 'module purchaser' }[a.module] || 'module';
                return `<div class="entry"><span class="time">${t}</span><span class="${modCls}">[${a.module}]</span> <span class="action">${a.action}</span> ${a.detail || ''}</div>`;
            }).join('');
            logEl.scrollTop = logEl.scrollHeight;
        }
    } catch (e) {}
}

// Init
connect();
setInterval(refreshActionLog, 3000);
