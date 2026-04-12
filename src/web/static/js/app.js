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
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
}

function updateDashboard(data) {
    // Stats
    document.getElementById('cookies').textContent = formatNumber(data.cookies);
    document.getElementById('cps').textContent = formatNumber(data.cps) + '/s';
    document.getElementById('click-cps').textContent = formatNumber(data.clickCps);
    document.getElementById('prestige').textContent = formatNumber(data.prestige);
    document.getElementById('heavenly-chips').textContent = formatNumber(data.heavenlyChips);
    document.getElementById('lumps').textContent = data.lumps || 0;
    document.getElementById('season').textContent = data.season || 'none';

    // Phase
    const phaseEl = document.getElementById('phase');
    phaseEl.textContent = data.phase || 'unknown';
    phaseEl.className = 'tag tag-' + ({
        early: 'yellow', mid: 'blue', late: 'green', endgame: 'red'
    }[data.phase] || 'yellow');

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
            const timeLeft = Math.ceil(b.time / Game?.fps || 30);
            let info = b.name;
            if (b.multCpS > 1) info += ` (x${b.multCpS} CPS)`;
            if (b.multClick > 1) info += ` (x${b.multClick} Click)`;
            return `<span class="buff">${info}</span>`;
        }).join('');
    } else {
        buffsEl.innerHTML = '<span class="dim">None</span>';
    }

    // Buildings table
    if (data.buildings) {
        const tbody = document.querySelector('#buildings-table tbody');
        tbody.innerHTML = data.buildings
            .filter(b => !b.locked && b.amount > 0)
            .map(b => `
                <tr>
                    <td>${b.name}</td>
                    <td>${b.amount}</td>
                    <td>${formatNumber(b.totalCps)}/s</td>
                    <td>${formatNumber(b.price)}</td>
                </tr>
            `).join('');
    }

    // Stock Market (hidden data!)
    if (data.market) {
        const mInfo = document.getElementById('market-info');
        mInfo.innerHTML = `
            <span><span class="mi-label">Brokers:</span> <span class="mi-value">${data.market.brokers}</span></span>
            <span><span class="mi-label">Overhead:</span> <span class="mi-value">${data.market.overhead}%</span></span>
            <span><span class="mi-label">Profit:</span> <span class="mi-value">$${data.market.profit}</span></span>
            <span><span class="mi-label">Office Lv:</span> <span class="mi-value">${data.market.officeLevel}</span></span>
        `;

        const mtbody = document.querySelector('#market-table tbody');
        mtbody.innerHTML = data.market.goods.map(g => {
            const modeClass = g.modeId <= 0 ? 'mode-stable' :
                              g.modeId === 1 || g.modeId === 3 ? 'mode-rise' :
                              g.modeId === 2 || g.modeId === 4 ? 'mode-fall' : 'mode-chaotic';
            const ratioClass = g.ratio < 30 ? 'ratio-great' :
                               g.ratio < 60 ? 'ratio-good' :
                               g.ratio < 120 ? 'ratio-neutral' :
                               g.ratio < 180 ? 'ratio-warn' : 'ratio-danger';
            return `<tr>
                <td title="${g.name}">${g.symbol}</td>
                <td>$${g.val}</td>
                <td>$${g.restingVal}</td>
                <td class="${ratioClass}">${g.ratio}%</td>
                <td class="${modeClass}">${g.mode}</td>
                <td>${g.dur}t</td>
                <td>${g.delta > 0 ? '+' : ''}${g.delta}</td>
                <td>${g.stock}/${g.maxStock}</td>
                <td>$${g.buyPrice} / $${g.sellPrice}</td>
            </tr>`;
        }).join('');
    }

    // CPS chart
    updateChart(data.cps);
}

function updateChart(cps) {
    if (!cpsChart) initChart();

    const now = new Date();
    const label = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');

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
                backgroundColor: 'rgba(233, 69, 96, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 0,
                borderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    display: true,
                    ticks: { color: '#888', maxTicksLimit: 10 },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                },
                y: {
                    display: true,
                    ticks: {
                        color: '#888',
                        callback: v => formatNumber(v)
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    type: 'logarithmic',
                }
            },
            plugins: {
                legend: { display: false },
            },
            animation: false,
        }
    });
}

// API calls
async function saveGame() {
    const res = await fetch('/api/save', { method: 'POST' });
    const data = await res.json();
    alert('Game saved: ' + (data.saved || 'OK'));
}

async function triggerAscend() {
    if (!confirm('Are you sure you want to ascend?')) return;
    await fetch('/api/ascend', { method: 'POST' });
}

// Fetch and display action log periodically
async function refreshActionLog() {
    try {
        const res = await fetch('/api/actions');
        const actions = await res.json();
        const logEl = document.getElementById('action-log');

        if (Array.isArray(actions) && actions.length > 0) {
            logEl.innerHTML = actions.slice(-50).map(a => {
                const t = new Date(a.time).toLocaleTimeString();
                return `<div class="entry"><span class="time">${t}</span><span class="module">[${a.module}]</span> <span class="action">${a.action}</span> ${a.detail || ''}</div>`;
            }).join('');
            logEl.scrollTop = logEl.scrollHeight;
        }
    } catch (e) {}
}

// Init
connect();
setInterval(refreshActionLog, 5000);
