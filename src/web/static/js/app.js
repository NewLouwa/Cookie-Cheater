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
                <td><span class="cc-icon cc-icon-sm cc-building-${b.id}"></span>${b.name}</td>
                <td>${b.amount}</td>
                <td>${formatNumber(b.totalCps)}/s</td>
                <td>${formatNumber(b.price)}</td>
            </tr>`).join('');
    }

    // Stock Market
    if (data.market) {
        const m = data.market;
        const mInfo = document.getElementById('market-info');
        mInfo.innerHTML = `
            <span><span class="mi-label">Brokers:</span> <span class="mi-value">${m.brokers}</span></span>
            <span><span class="mi-label">Overhead:</span> <span class="mi-value">${m.overhead}%</span></span>
            <span><span class="mi-label">Hurdle:</span> <span class="mi-value">${m.hurdle || '?'}%</span></span>
            <span><span class="mi-label">Office:</span> <span class="mi-value">${m.officeLevel}</span></span>
            <span><span class="mi-label">Profit:</span> <span class="mi-value ${m.profit >= 0 ? 'mode-rise' : 'mode-fall'}">$${m.profit}</span></span>
        `;

        // Stats row
        const statsEl = document.getElementById('market-stats');
        if (m.stats) {
            const s = m.stats;
            const wr = s.totalTrades > 0 ? Math.round(s.wins / s.totalTrades * 100) : 0;
            statsEl.innerHTML = `
                <div class="ms"><span class="ms-label">Trades:</span> <span class="ms-value">${s.totalTrades}</span></div>
                <div class="ms"><span class="ms-label">W/L:</span> <span class="ms-value ms-win">${s.wins}</span>/<span class="ms-value ms-loss">${s.losses}</span> (${wr}%)</div>
                <div class="ms"><span class="ms-label">P/L:</span> <span class="ms-value ${s.totalPnL >= 0 ? 'ms-win' : 'ms-loss'}">${s.totalPnL >= 0 ? '+' : ''}${formatNumber(s.totalPnL)}</span></div>
            `;
        }

        const mtbody = document.querySelector('#market-table tbody');
        if (m.goods) {
            mtbody.innerHTML = m.goods.map(g => {
                const modeClass = g.modeId === 0 ? 'mode-stable' :
                    g.modeId === 1 || g.modeId === 3 ? 'mode-rise' :
                    g.modeId === 2 || g.modeId === 4 ? 'mode-fall' : 'mode-chaotic';
                const ratioClass = g.ratio < 30 ? 'ratio-great' : g.ratio < 60 ? 'ratio-good' :
                    g.ratio < 120 ? 'ratio-neutral' : g.ratio < 180 ? 'ratio-warn' : 'ratio-danger';

                // Signal badge
                const sig = (g.signal || 'WAIT').toLowerCase();
                const str = (g.strength || '').toLowerCase();
                const badgeCls = sig === 'buy' ? 'buy-' + (str || 'weak') :
                                 sig === 'sell' ? 'sell-' + (str || 'weak') :
                                 sig === 'hold' ? 'hold-' + (str || 'weak') : 'wait';
                const badge = `<span class="signal-badge ${badgeCls}">${g.signal}${str ? ' ' + str : ''}</span>`;

                // Position info
                const held = g.stock > 0 ? `<strong>${g.stock}</strong>/${g.maxStock}` : `<span class="dim">0/${g.maxStock}</span>`;
                const avg = g.avgPrice ? '$' + g.avgPrice : '<span class="dim">-</span>';
                const net = g.netPct !== null ? `<span class="${g.netPct >= 0 ? 'net-positive' : 'net-negative'}">${g.netPct >= 0 ? '+' : ''}${g.netPct}%</span>` : '<span class="dim">-</span>';

                // Reasoning (first 2 reasons)
                const reasons = (g.reasons || []).slice(0, 2).join('. ');

                return `<tr>
                    <td>${badge}</td>
                    <td title="${g.name}"><span class="good-icon good-icon-${g.id}"></span><strong>${g.symbol}</strong></td>
                    <td>$${g.val}</td>
                    <td class="dim">$${g.restingVal}</td>
                    <td class="${ratioClass}">${g.ratio}%</td>
                    <td class="${modeClass}">${g.mode}</td>
                    <td>${g.dur}t</td>
                    <td class="${(g.expDelta||0) > 0 ? 'mode-rise' : (g.expDelta||0) < 0 ? 'mode-fall' : ''}">${(g.expDelta||0) > 0 ? '+' : ''}${g.expDelta || 0}</td>
                    <td>${held}</td>
                    <td>${avg}</td>
                    <td>${net}</td>
                    <td>${g.score || 0}</td>
                    <td class="market-reason">${reasons}</td>
                </tr>`;
            }).join('');
        }
    }

    // Strategy panel
    if (data.strategy) updateStrategy(data.strategy);

    // Sugar lump approval card
    updateLumpCard(data.lumpProposal);

    // Loans
    if (data.market && data.market.loans) updateLoans(data.market.loans);

    // Garden grid
    if (data.gardenInfo) updateGardenGrid(data.gardenInfo);

    // Minigame status
    if (data.gardenPhase) {
        document.getElementById('garden-phase').textContent = data.gardenPhase;
    }
    if (data.grimoire) {
        const gr = data.grimoire;
        document.getElementById('grimoire-status').textContent =
            gr.magic + '/' + gr.maxMagic + ' (' + gr.pct + '%)';

        // Grimoire tab detail
        const grimStats = document.getElementById('grim-stats');
        if (grimStats) {
            const barColor = gr.pct >= 90 ? '#4ade80' : gr.pct >= 50 ? '#fbbf24' : '#60a5fa';
            grimStats.innerHTML = `
                <div class="mg-stat">
                    <span class="mg-label">Magic</span>
                    <span class="mg-value">${gr.magic} / ${gr.maxMagic}</span>
                    <div style="width:100px;height:6px;background:var(--bg);border-radius:3px;margin-top:3px">
                        <div style="width:${gr.pct}%;height:100%;background:${barColor};border-radius:3px;transition:width 0.3s"></div>
                    </div>
                </div>
                <div class="mg-stat">
                    <span class="mg-label">Towers</span>
                    <span class="mg-value">${gr.towerCount}</span>
                </div>
                <div class="mg-stat">
                    <span class="mg-label">Tower Level</span>
                    <span class="mg-value">${gr.towerLevel}</span>
                </div>
                <div class="mg-stat">
                    <span class="mg-label">Status</span>
                    <span class="mg-value" style="color:${gr.pct >= 90 ? '#4ade80' : '#fbbf24'}">${gr.pct >= 90 ? 'Ready to cast!' : 'Regenerating...'}</span>
                </div>
            `;
        }
    }
    if (data.market) {
        document.getElementById('market-status').textContent =
            'OH:' + data.market.overhead + '% Bkr:' + data.market.brokers + ' Ofc:' + data.market.officeLevel;
    }

    // Pantheon tab
    if (data.pantheonInfo) {
        const pi = data.pantheonInfo;
        const panthStats = document.getElementById('panth-stats');
        if (panthStats) {
            panthStats.innerHTML = pi.slots.map(s =>
                `<div class="mg-stat">
                    <span class="mg-label">${s.slot}</span>
                    <span class="mg-value" style="color:${s.spirit === 'Empty' ? 'var(--dim)' : 'var(--text)'}">${s.spirit}</span>
                </div>`
            ).join('') + `
                <div class="mg-stat">
                    <span class="mg-label">Mode</span>
                    <span class="mg-value" style="color:${pi.godzamokActive ? 'var(--yellow)' : 'var(--green)'}">${pi.godzamokActive ? 'COMBO (Godzamok)' : 'Passive'}</span>
                </div>
                <div class="mg-stat">
                    <span class="mg-label">Temple Level</span>
                    <span class="mg-value">${pi.templeLevel}</span>
                </div>
            `;
        }
    }

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

function updateLoans(loans) {
    const el = document.getElementById('market-loans');
    if (!loans || loans.length === 0) { el.innerHTML = '<span class="dim">No loans available</span>'; return; }

    el.innerHTML = loans.map(loan => {
        const cls = loan.active ? 'active' : loan.available ? 'available' : 'locked';
        const rec = loan.recommendation || {};
        const recCls = (rec.action || '').toLowerCase().replace(' ', '-');
        const btnHtml = loan.available && !loan.active
            ? `<button class="loan-btn" onclick="takeLoan(${loan.id})">${rec.action === 'TAKE NOW' ? 'TAKE NOW!' : 'Take Loan'}</button>`
            : loan.active ? '<span class="dim" style="font-size:0.72rem">Active</span>' : '';

        return `<div class="loan-card ${cls}">
            <div class="loan-name">${loan.name} ${loan.active ? '<span class="tag tag-green" style="font-size:0.6rem">ACTIVE</span>' : ''}</div>
            <div class="loan-stats">
                <div class="ls-row"><span class="ls-label">Boost:</span> <span class="ls-boost">${loan.boost} for ${loan.boostDur}</span></div>
                <div class="ls-row"><span class="ls-label">Penalty:</span> <span class="ls-penalty">${loan.penalty} for ${loan.penaltyDur}</span></div>
                <div class="ls-row"><span class="ls-label">Downpayment:</span> <span>${loan.downpayment}</span></div>
            </div>
            <div class="loan-note">${loan.note}</div>
            <div class="loan-rec ${recCls}">${rec.action}: ${rec.reason}</div>
            ${btnHtml}
        </div>`;
    }).join('');
}

async function takeLoan(id) {
    if (!confirm('Take this loan? The downpayment will be deducted from your cookies.')) return;
    await fetch('/api/market/loan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
}

function updateGardenGrid(info) {
    // Header info
    document.getElementById('garden-phase-tag').textContent = info.phase || '';
    document.getElementById('garden-seeds').textContent = (info.seedsUnlocked || 0) + '/' + (info.seedsTotal || 34) + ' seeds';
    document.getElementById('garden-soil').textContent = 'Soil: ' + (info.soil || '?');
    const mut = info.nextMutation;
    document.getElementById('garden-mutation').textContent = mut
        ? 'Target: ' + mut.child + ' (' + (mut.chance * 100) + '%/tick)'
        : '';

    // Strategy panel
    const strat = info.strategy;
    if (strat) {
        document.getElementById('gs-goal').textContent = strat.goal || '';
        document.getElementById('gs-why').textContent = strat.why || '';
        document.getElementById('gs-next').textContent = strat.nextStep || '';
        document.getElementById('gs-soil').textContent = strat.soilReason || '';

        // Mutation roadmap
        const roadmapEl = document.getElementById('gs-roadmap');
        if (strat.roadmap && strat.roadmap.length > 0) {
            roadmapEl.innerHTML = strat.roadmap.map(m => {
                const cls = m.unlocked ? 'unlocked' : m.available ? 'available' : 'locked';
                const icon = m.unlocked ? '&#10003;' : m.available ? '&#9658;' : '&#9679;';
                const parents = m.parents[0] === m.parents[1]
                    ? m.parents[0] + ' x2'
                    : m.parents[0] + ' + ' + m.parents[1];
                return `<div class="gs-mutation ${cls}">
                    <span class="gs-check">${icon}</span>
                    <span class="gs-child">${m.child}</span>
                    <span class="gs-parents">${parents}</span>
                    <span class="gs-chance">${(m.chance * 100).toFixed(1)}%</span>
                </div>`;
            }).join('');
        } else {
            roadmapEl.innerHTML = '<span class="dim">No mutation data</span>';
        }
    }

    // Build 6x6 grid
    const grid = document.getElementById('garden-grid');
    const tiles = info.tiles || [];
    const goals = info.tileGoals || {};

    // Create a map of tiles by position
    const tileMap = {};
    tiles.forEach(t => { tileMap[t.x + ',' + t.y] = t; });

    let html = '';
    for (let y = 0; y < 6; y++) {
        for (let x = 0; x < 6; x++) {
            const key = x + ',' + y;
            const t = tileMap[key];
            const goal = goals[key];

            if (!t) {
                // Locked tile
                html += '<div class="garden-tile locked"></div>';
                continue;
            }

            if (t.empty) {
                const isTarget = goal && goal.goal === 'mutation_target';
                html += `<div class="garden-tile ${isTarget ? 'mutation-target' : 'empty'}" title="${isTarget ? 'Mutation target: ' + (goal.targetChild || '?') : 'Empty'}">
                    ${isTarget ? '<span class="tile-name" style="color:#fbbf24">?</span>' : ''}
                </div>`;
            } else {
                const cls = t.mature ? 'mature' : 'planted';
                const iconId = t.plantIcon !== undefined ? t.plantIcon : 0;
                const goalTag = goal ? (goal.goal === 'mutation_parent' ? 'MP' : goal.goal === 'farming' ? 'F' : '') : '';
                html += `<div class="garden-tile ${cls}" title="${t.plant} — age ${t.pct}%${t.mature ? ' MATURE' : ''} ${goal ? '('+goal.goal+')' : ''}">
                    <span class="cc-plant cc-plant-${iconId}" style="margin:0"></span>
                    ${goalTag ? '<span class="tile-goal">' + goalTag + '</span>' : ''}
                    <div class="tile-bar"><div class="tile-bar-fill" style="width:${t.pct}%;background:${t.mature ? '#4ade80' : '#60a5fa'}"></div></div>
                </div>`;
            }
        }
    }
    grid.innerHTML = html;
}

function updateLumpCard(proposal) {
    const card = document.getElementById('lump-card');
    if (!proposal || !proposal.options || proposal.options.length === 0) {
        card.style.display = 'none';
        return;
    }
    card.style.display = '';
    document.getElementById('lump-header').innerHTML =
        `<strong>${proposal.lumps}</strong> lumps (${proposal.reserve} reserved, <strong>${proposal.available}</strong> available)`;
    document.getElementById('lump-options').innerHTML = proposal.options.map((opt, i) =>
        `<div class="lump-option">
            <span class="lump-rank">#${i+1}</span>
            <div class="lump-detail">
                <span class="lump-name">${opt.buildingName} lv${opt.currentLevel} → ${opt.targetLevel}</span>
                <span class="lump-why">${opt.why}</span>
            </div>
            <button class="lump-approve" onclick="approveLump(${i})">Approve</button>
        </div>`
    ).join('');
}

async function approveLump(index) {
    const res = await fetch('/api/lumps/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice: index })
    });
    const data = await res.json();
    if (data.status === 'ok') {
        document.getElementById('lump-card').style.display = 'none';
    }
}

async function skipLumps() {
    await fetch('/api/lumps/skip', { method: 'POST' });
    document.getElementById('lump-card').style.display = 'none';
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

// === Tab navigation ===
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');

    // Re-init chart when switching to overview (canvas resize issue)
    if (tabName === 'overview' && cpsChart) {
        setTimeout(() => cpsChart.resize(), 50);
    }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// Init
connect();
setInterval(refreshActionLog, 3000);
