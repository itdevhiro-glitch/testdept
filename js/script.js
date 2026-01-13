import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, deleteDoc, updateDoc, doc, onSnapshot, query, collectionGroup, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCWzttWHmPGxVINMksXgVkqjzP4jFHf0wE",
    authDomain: "wartactic-8a8a1.firebaseapp.com",
    projectId: "wartactic-8a8a1",
    storageBucket: "wartactic-8a8a1.firebasestorage.app",
    messagingSenderId: "409457288660",
    appId: "1:409457288660:web:bafb9b3a475c1a31c56241",
    measurementId: "G-M438315YTV"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- GLOBAL VARIABLES ---
let currentUser = null;
let players = []; 
let unsubscribe = null; 
let currentSort = { key: 'name', asc: true };
let compareChart = null;
let jobChartInstance = null;
let statusChartInstance = null;
let globalCampsData = []; // NEW FOR WAR ROOM

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('u-email').innerText = user.email.split('@')[0].toUpperCase();
        initRealtimeData();
    } else {
        window.location.href = "login.html";
    }
});

document.getElementById('btn-logout').addEventListener('click', () => {
    signOut(auth);
});

const TEAMS = [
    { id: 'cmd', label: 'High Command', color: '#d946ef' },
    { id: 'atk', label: 'Attack Squad', color: '#ef4444' },
    { id: 'mid', label: 'Mid Patrol',   color: '#f97316' },
    { id: 'def', label: 'Defense Team', color: '#3b82f6' },
    { id: 'bea', label: 'Beacon',       color: '#10b981' },
    { id: 'res', label: 'Reserve',      color: '#64748b' }
];

const JOB_GROUPS = {
    WPN:    ['rifleman', 'warrior', 'sniper'],
    BIO:    ['ark knight', 'virus', 'spore', 'exorcist'],
    GATHER: ['logger', 'hempicker', 'miner'],
    CRAFT:  ['gunmaker', 'armorer', 'upholster']
};

function calculateCombatRating(stats) {
    if (!stats) return 0;
    
    const atk = parseInt(stats.atk) || 0;
    const def = parseInt(stats.def) || 0;
    const cr  = parseInt(stats.crit_rate) || 0;
    const cd  = parseInt(stats.crit_dmg) || 0;
    const dr  = parseInt(stats.dmg_red) || 0;
    const ci  = parseInt(stats.crit_res) || 0;

    let score = (atk * 1) + 
                (def * 2.5) + 
                (cr * 20) + 
                (cd * 5) + 
                (dr * 25) + 
                (ci * 10);
    
    return Math.floor(score); 
}

function initRealtimeData() {
    if(!currentUser) return;
    
    const unitsRef = collection(db, "users", currentUser.uid, "units");
    const q = query(unitsRef);

    unsubscribe = onSnapshot(q, (snapshot) => {
        players = [];
        snapshot.forEach((doc) => {
            players.push({ id: doc.id, ...doc.data() });
        });
        document.getElementById('u-count').innerText = `${players.length} UNITS ACTIVE`;
        renderAll();
    });
}

async function addUnitToDB(name, job) {
    if(!currentUser) return;
    await addDoc(collection(db, "users", currentUser.uid, "units"), {
        name: name,
        job: job,
        team: 'res',
        status: 'ON_CAMP',
        stats: {
            atk: 0,
            def: 0,
            crit_rate: 0,
            crit_dmg: 0,
            dmg_red: 0,
            crit_res: 0
        },
        createdAt: Date.now()
    });
}

async function updateUnitTeam(id, newTeam) {
    if(!currentUser) return;
    const unitRef = doc(db, "users", currentUser.uid, "units", id);
    await updateDoc(unitRef, { team: newTeam });
}

async function updateUnitJob(id, newJob) {
    if(!currentUser) return;
    const unitRef = doc(db, "users", currentUser.uid, "units", id);
    await updateDoc(unitRef, { job: newJob });
}

async function deleteUnitFromDB(id) {
    if(!currentUser) return;
    if(confirm('Confirm decomission of this unit?')) {
        await deleteDoc(doc(db, "users", currentUser.uid, "units", id));
    }
}

function canJoinTeam(teamId) {
    if(teamId !== 'cmd') return true;
    const currentCmds = players.filter(p => p.team === 'cmd').length;
    if(currentCmds >= 2) {
        alert("⛔ PERMISSION DENIED: Commander slots full (Max 2).");
        return false;
    }
    return true;
}

window.openDetailWrapper = (id) => {
    const p = players.find(u => u.id === id);
    if(!p) return;

    document.getElementById('edit-name').value = p.name;
    
    document.getElementById('d-job').innerText = p.job;
    const info = getJobInfo(p.job);
    const badge = document.getElementById('d-job');
    badge.className = `card-badge ${info.style}`;

    document.getElementById('edit-status').value = p.status || 'ON_CAMP';

    document.getElementById('d-uid').value = p.id;

    const s = p.stats || { atk:0, def:0, crit_rate:0, crit_dmg:0, dmg_red:0, crit_res:0 };
    
    document.getElementById('in-atk').value = s.atk;
    document.getElementById('in-def').value = s.def;
    document.getElementById('in-crit-rate').value = s.crit_rate;
    document.getElementById('in-crit-dmg').value = s.crit_dmg;
    document.getElementById('in-dmg-red').value = s.dmg_red;
    document.getElementById('in-crit-res').value = s.crit_res;

    const score = calculateCombatRating(s);
    document.getElementById('d-score').innerText = score.toLocaleString(); 

    document.getElementById('modal-detail').style.display = 'flex';
};

document.getElementById('btn-save-detail').addEventListener('click', async () => {
    const uid = document.getElementById('d-uid').value;
    const btn = document.getElementById('btn-save-detail');
    
    const newName = document.getElementById('edit-name').value;
    const newStatus = document.getElementById('edit-status').value;

    const newStats = {
        atk: document.getElementById('in-atk').value || 0,
        def: document.getElementById('in-def').value || 0,
        crit_rate: document.getElementById('in-crit-rate').value || 0,
        crit_dmg: document.getElementById('in-crit-dmg').value || 0,
        dmg_red: document.getElementById('in-dmg-red').value || 0,
        crit_res: document.getElementById('in-crit-res').value || 0,
    };

    btn.innerText = "Saving...";
    
    const unitRef = doc(db, "users", currentUser.uid, "units", uid);
    await updateDoc(unitRef, { 
        name: newName,
        status: newStatus,
        stats: newStats 
    });

    document.getElementById('modal-detail').style.display = 'none';
    btn.innerText = "Save Attributes";
});

document.getElementById('btn-close-detail').addEventListener('click', () => {
    document.getElementById('modal-detail').style.display = 'none';
});

document.getElementById('btn-bulk').addEventListener('click', () => {
    document.getElementById('modal-bulk').style.display = 'flex';
});
document.getElementById('btn-close-bulk').addEventListener('click', () => {
    document.getElementById('modal-bulk').style.display = 'none';
});

document.getElementById('btn-process-bulk').addEventListener('click', async () => {
    const txt = document.getElementById('bulk-txt').value;
    const lines = txt.split('\n');
    const btn = document.getElementById('btn-process-bulk');
    
    btn.innerText = "Processing...";
    btn.disabled = true;

    for(let l of lines) {
        if(l.includes('-')) {
            const [n, j] = l.split('-');
            if(n && j) {
                await addUnitToDB(n.trim(), j.trim());
            }
        }
    }
    
    document.getElementById('bulk-txt').value = '';
    document.getElementById('modal-bulk').style.display = 'none';
    btn.innerText = "Start Import";
    btn.disabled = false;
});

window.deleteUnitWrapper = (id) => deleteUnitFromDB(id);

window.changeJobWrapper = (id, el) => {
    updateUnitJob(id, el.value);
};
window.changeTeamWrapper = (id, el) => {
    const newTeam = el.value;
    if(canJoinTeam(newTeam)) {
        updateUnitTeam(id, newTeam);
    } else {
        const oldP = players.find(p => p.id === id);
        el.value = oldP.team; 
    }
};

window.toggleSort = (key) => {
    if (currentSort.key === key) {
        currentSort.asc = !currentSort.asc;
    } else {
        currentSort.key = key;
        currentSort.asc = key === 'rating' ? false : true; 
    }
    renderList();
};

// --- GLOBAL WAR ROOM LOGIC (NEW) ---
async function fetchGlobalWarData() {
    const btn = document.getElementById('btn-scan-global');
    const load = document.getElementById('war-loading');
    const content = document.getElementById('war-content');
    
    btn.disabled = true;
    load.style.display = 'block';
    content.style.display = 'none';

    try {
        // Query COLLECTION GROUP: Gets all 'units' collections from all users
        const q = query(collectionGroup(db, 'units'));
        const snapshot = await getDocs(q);
        
        const campsMap = {};

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            
            // FILTER: Skip Reserve Units
            if (data.team === 'res') return;

            // Identify Camp ID (Parent User ID)
            // Path: users/{uid}/units/{unitId} -> index path[1] is UID
            const pathSegments = docSnap.ref.path.split('/');
            const campId = pathSegments[1];

            if (!campsMap[campId]) {
                campsMap[campId] = {
                    id: campId,
                    unitCount: 0,
                    totalPower: 0,
                    totalAtk: 0,
                    totalDef: 0,
                    totalCrit: 0,
                    totalDr: 0,
                    classes: { WPN:0, BIO:0, GATHER:0, CRAFT:0 },
                    isMe: (currentUser && currentUser.uid === campId)
                };
            }

            // Sum Stats
            const power = calculateCombatRating(data.stats);
            campsMap[campId].unitCount++;
            campsMap[campId].totalPower += power;
            
            const s = data.stats || {};
            campsMap[campId].totalAtk += parseInt(s.atk || 0);
            campsMap[campId].totalDef += parseInt(s.def || 0);
            campsMap[campId].totalCrit += parseInt(s.crit_rate || 0); 
            campsMap[campId].totalDr += parseInt(s.dmg_red || 0);

            // Count Classes
            const info = getJobInfo(data.job);
            if(info.cat === 'WEAPON') campsMap[campId].classes.WPN++;
            else if(info.cat === 'BIO-OPS') campsMap[campId].classes.BIO++;
            else if(info.cat === 'GETHER') campsMap[campId].classes.GATHER++; 
            else if(info.cat === 'CRAFT') campsMap[campId].classes.CRAFT++;
        });

        // Convert Map to Array & Sort by Power
        globalCampsData = Object.values(campsMap).sort((a, b) => b.totalPower - a.totalPower);
        
        renderGlobalLeaderboard();

    } catch (error) {
        console.error("Error fetching global data:", error);
        alert("Access Denied or Index Missing. Check Console.");
    } finally {
        btn.disabled = false;
        load.style.display = 'none';
        content.style.display = 'grid';
    }
}

function renderGlobalLeaderboard() {
    const container = document.getElementById('lb-list-container');
    container.innerHTML = '';

    globalCampsData.forEach((camp, index) => {
        const el = document.createElement('div');
        el.className = `lb-item ${camp.isMe ? 'active' : ''}`;
        
        const displayName = camp.isMe ? "YOU (COMMANDER)" : `CAMP COMMANDER [${camp.id.substr(0,5).toUpperCase()}]`;
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index+1}`;

        el.innerHTML = `
            <div style="display:flex; align-items:center;">
                <span class="lb-rank">${medal}</span>
                <div>
                    <span class="lb-name">${displayName}</span>
                    <span style="font-size:0.7rem; color:var(--text-muted);">${camp.unitCount} Active Units</span>
                </div>
            </div>
            <div class="lb-power">
                <i class="fa-solid fa-bolt"></i> ${camp.totalPower.toLocaleString()}
            </div>
        `;
        
        el.addEventListener('click', () => {
            document.querySelectorAll('.lb-item').forEach(i => i.style.background = '');
            el.style.background = 'rgba(59,130,246,0.1)';
            renderCampDetails(camp, index);
        });

        container.appendChild(el);
    });
}

function renderCampDetails(camp, rank) {
    const container = document.getElementById('war-detail-container');
    
    const maxPower = Math.max(...globalCampsData.map(c => c.totalPower));
    const maxAtk = Math.max(...globalCampsData.map(c => c.totalAtk));
    const maxDef = Math.max(...globalCampsData.map(c => c.totalDef));

    const displayName = camp.isMe ? "YOUR CAMP" : `COMMANDER [${camp.id.substr(0,5).toUpperCase()}]`;

    container.innerHTML = `
        <div class="war-detail-card active">
            <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:1px solid var(--border); padding-bottom:15px;">
                <div>
                    <div style="font-size:0.8rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:2px;">HEAD COMMAND</div>
                    <div style="font-family:var(--font-head); font-size:2rem; font-weight:700; color:white;">${displayName}</div>
                    <div style="font-size:0.9rem; color:${rank < 3 ? 'var(--warn)' : 'var(--text-muted)'}; font-weight:600;">
                        GLOBAL RANKING: #${rank + 1}
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:3rem; font-weight:800; color:var(--accent); line-height:1;">
                        ${(camp.totalPower / 1000).toFixed(1)}<span style="font-size:1.5rem">k</span>
                    </div>
                    <div style="font-size:0.8rem; text-transform:uppercase;">Total Combat Power</div>
                </div>
            </div>

            <div class="stat-matrix">
                <div class="sm-box" style="border-color:rgba(239,68,68,0.3)">
                    <div class="sm-label">Total Firepower (ATK)</div>
                    <div class="sm-val" style="color:#fca5a5">${camp.totalAtk.toLocaleString()}</div>
                </div>
                <div class="sm-box" style="border-color:rgba(59,130,246,0.3)">
                    <div class="sm-label">Total Defense (DEF)</div>
                    <div class="sm-val" style="color:#93c5fd">${camp.totalDef.toLocaleString()}</div>
                </div>
                <div class="sm-box" style="border-color:rgba(16,185,129,0.3)">
                    <div class="sm-label">Defense Matrix (DR%)</div>
                    <div class="sm-val" style="color:#6ee7b7">${camp.totalDr.toLocaleString()}%</div>
                </div>
                <div class="sm-box" style="border-color:rgba(245,158,11,0.3)">
                    <div class="sm-label">Crit Capability</div>
                    <div class="sm-val" style="color:#fcd34d">${camp.totalCrit.toLocaleString()}</div>
                </div>
            </div>

            <div style="display:flex; gap:10px; margin-bottom:20px;">
                <span class="card-badge bg-soft-wpn">WPN: ${camp.classes.WPN}</span>
                <span class="card-badge bg-soft-bio">BIO: ${camp.classes.BIO}</span>
                <span class="card-badge bg-soft-gather">GATHER: ${camp.classes.GATHER}</span>
                <span class="card-badge bg-soft-craft">CRAFT: ${camp.classes.CRAFT}</span>
            </div>

            <div style="flex:1; display:flex; flex-direction:column; justify-content:center;">
                <div style="font-size:0.85rem; text-transform:uppercase; letter-spacing:1px; margin-bottom:15px; color:var(--text-muted); text-align:center;">
                    Market Comparison (Vs Global Top)
                </div>

                <div class="camp-compare-row" style="border:none; padding:0;">
                    ${createBar("COMBAT POWER", camp.totalPower, maxPower, "var(--accent)")}
                    ${createBar("ATTACK OUTPUT", camp.totalAtk, maxAtk, "var(--danger)")}
                    ${createBar("DEFENSE INTEGRITY", camp.totalDef, maxDef, "var(--success)")}
                </div>
            </div>
        </div>
    `;
}

function createBar(label, val, max, color) {
    const pct = Math.round((val / max) * 100);
    return `
        <div class="cc-bar-group">
            <div class="cc-header">
                <span style="color:var(--text-muted)">${label}</span>
                <span style="font-weight:700; color:white;">${pct}% of Top</span>
            </div>
            <div class="cc-track">
                <div class="cc-fill" style="width:${pct}%; background:${color}; box-shadow:0 0 10px ${color}"></div>
                <div class="cc-fill" style="width:${100-pct}%; background:rgba(255,255,255,0.05);"></div>
            </div>
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', () => {
    initBoardLanes();
    setupViewSwitcher();
    setupMap();
    setupComparison();

    document.getElementById('btn-add').addEventListener('click', () => {
        const nameEl = document.getElementById('in-name');
        const jobEl = document.getElementById('in-job');
        if(nameEl.value.trim() !== "") {
            addUnitToDB(nameEl.value.trim(), jobEl.value || 'Unknown');
            nameEl.value = '';
        }
    });

    document.getElementById('in-name').addEventListener('keypress', (e) => {
        if(e.key === 'Enter') document.getElementById('btn-add').click();
    });
    
    document.getElementById('btn-copy').addEventListener('click', copyDiscord);

    // New Listener for Global Scan
    document.getElementById('btn-scan-global').addEventListener('click', fetchGlobalWarData);

    const fInputs = ['f-name', 'f-team', 'f-class', 'f-job'];

    const teamSelect = document.getElementById('f-team');
    TEAMS.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.innerText = t.label;
        teamSelect.appendChild(opt);
    });

    fInputs.forEach(id => {
        document.getElementById(id).addEventListener('input', renderList);
        document.getElementById(id).addEventListener('change', renderList);
    });

    document.getElementById('btn-reset-filter').addEventListener('click', () => {
        fInputs.forEach(id => {
            const el = document.getElementById(id);
            el.value = (id === 'f-name') ? '' : 'ALL';
        });
        renderList();
    });
});

function renderAll() {
    renderDashboard();
    renderBoard();
    renderList();
    renderCompareOptions();
    if(document.getElementById('view-edit').classList.contains('active')) renderEditor();
}

// --- DASHBOARD RENDERER ---
function renderDashboard() {
    // Stats Calculation
    const total = players.length;
    const onCamp = players.filter(p => p.status === 'ON_CAMP' || !p.status).length;
    const merc = players.filter(p => p.status === 'MERCENARY').length;
    
    let topUnit = { name: 'N/A', val: 0 };
    players.forEach(p => {
        const sc = calculateCombatRating(p.stats);
        if(sc > topUnit.val) topUnit = { name: p.name, val: sc };
    });

    document.getElementById('dash-total').innerText = total;
    document.getElementById('dash-on').innerText = onCamp;
    document.getElementById('dash-merc').innerText = merc;
    document.getElementById('dash-top').innerText = topUnit.name;
    document.getElementById('dash-top-val').innerText = `Rating: ${topUnit.val.toLocaleString()}`;

    // --- JOB CHART DATA ---
    const jobCounts = { WPN: 0, BIO: 0, GATHER: 0, CRAFT: 0 };
    players.forEach(p => {
        const inf = getJobInfo(p.job);
        if(inf.cat === 'WEAPON') jobCounts.WPN++;
        else if(inf.cat === 'BIO-OPS') jobCounts.BIO++;
        else if(inf.cat === 'GETHER') jobCounts.GATHER++; 
        else if(inf.cat === 'CRAFT') jobCounts.CRAFT++;
    });

    // --- STATUS CHART DATA ---
    const statusCounts = { ON: 0, MERC: 0, OUT: 0 };
    players.forEach(p => {
        const s = p.status;
        if(s === 'MERCENARY') statusCounts.MERC++;
        else if(s === 'OUT_CAMP') statusCounts.OUT++;
        else statusCounts.ON++;
    });

    renderCharts(jobCounts, statusCounts);
}

function renderCharts(jobs, statuses) {
    // Job Chart
    const ctxJob = document.getElementById('jobChart').getContext('2d');
    if (jobChartInstance) jobChartInstance.destroy();

    jobChartInstance = new Chart(ctxJob, {
        type: 'doughnut',
        data: {
            labels: ['Weapon', 'Bio Ops', 'Gather', 'Craft'],
            datasets: [{
                data: [jobs.WPN, jobs.BIO, jobs.GATHER, jobs.CRAFT],
                backgroundColor: ['#ef4444', '#10b981', '#f59e0b', '#d946ef'],
                borderColor: '#1e293b',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: '#94a3b8', font: {family: 'Rajdhani'} } }
            }
        }
    });

    // Status Chart
    const ctxStatus = document.getElementById('statusChart').getContext('2d');
    if (statusChartInstance) statusChartInstance.destroy();

    statusChartInstance = new Chart(ctxStatus, {
        type: 'bar',
        data: {
            labels: ['On Camp', 'Mercenary', 'Out'],
            datasets: [{
                label: 'Units',
                data: [statuses.ON, statuses.MERC, statuses.OUT],
                backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: {color: 'rgba(255,255,255,0.05)'}, ticks: {color:'#94a3b8'} },
                x: { grid: {display: false}, ticks: {color:'#94a3b8'} }
            },
            plugins: { legend: {display: false} }
        }
    });
}
// -----------------------------

function getJobInfo(job) {
    const j = job.toLowerCase();
    if(JOB_GROUPS.WPN.some(x => j.includes(x))) return { cat: 'WEAPON', style: 'bg-soft-wpn', border: 'c-wpn' };
    if(JOB_GROUPS.BIO.some(x => j.includes(x))) return { cat: 'BIO-OPS', style: 'bg-soft-bio', border: 'c-bio' };
    if(JOB_GROUPS.GATHER.some(x => j.includes(x))) return { cat: 'GETHER', style: 'bg-soft-gather', border: 'c-gather' };
    if(JOB_GROUPS.CRAFT.some(x => j.includes(x))) return { cat: 'CRAFT', style: 'bg-soft-craft', border: 'c-craft' };
    return { cat: 'UNKNOWN', style: 'bg-soft-gather', border: 'c-gather' };
}

function initBoardLanes() {
    const container = document.getElementById('board-lanes');
    container.innerHTML = '';
    TEAMS.forEach(t => {
        const col = document.createElement('div');
        col.className = 'lane';
        col.dataset.team = t.id;
        col.style.borderTop = `3px solid ${t.color}`;
        
        col.innerHTML = `
            <div class="lane-header" style="color:${t.color};">
                ${t.label} 
                <span id="cnt-${t.id}" style="font-size:0.8em; opacity:0.8; background:rgba(255,255,255,0.1); padding:2px 8px; border-radius:6px; color:white;">0</span>
            </div>
            <div class="lane-body" id="lane-${t.id}" data-team="${t.id}"></div>
        `;
        container.appendChild(col);

        new Sortable(col.querySelector('.lane-body'), {
            group: 'elite', animation: 200, delay: 0, ghostClass: 'sortable-ghost',
            onEnd: (evt) => {
                const pid = evt.item.dataset.id;
                const newTeam = evt.to.dataset.team;
                const oldTeam = evt.from.dataset.team;
                
                if(pid && newTeam !== oldTeam) {
                    if(canJoinTeam(newTeam)) {
                        updateUnitTeam(pid, newTeam);
                    } else {
                        evt.from.appendChild(evt.item); 
                    }
                }
            }
        });
    });
}

function renderBoard() {
    // 1. CALCULATE HEADER STATS FIRST
    // Filter out Reserves
    const activeUnits = players.filter(p => p.team !== 'res');
    
    let totalCP = 0;
    let totalAtk = 0;
    let totalDef = 0;

    // Sort by CP Descending
    activeUnits.sort((a, b) => {
        const sA = calculateCombatRating(a.stats);
        const sB = calculateCombatRating(b.stats);
        return sB - sA;
    });

    activeUnits.forEach(p => {
        totalCP += calculateCombatRating(p.stats);
        totalAtk += parseInt(p.stats?.atk || 0);
        totalDef += parseInt(p.stats?.def || 0);
    });

    // Render Stats Header
    document.getElementById('board-total-cp').innerText = totalCP.toLocaleString();
    document.getElementById('board-total-atk').innerText = totalAtk.toLocaleString();
    document.getElementById('board-total-def').innerText = totalDef.toLocaleString();
    
    const avg = activeUnits.length > 0 ? Math.floor(totalCP / activeUnits.length) : 0;
    document.getElementById('board-avg-cp').innerText = avg.toLocaleString();

    // Render Top 3
    const top3Container = document.getElementById('board-top3-container');
    top3Container.innerHTML = '';
    
    if(activeUnits.length > 0) {
        const top3 = activeUnits.slice(0, 3);
        top3.forEach((p, idx) => {
            const cp = calculateCombatRating(p.stats);
            const rankClass = idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : 'rank-3';
            const icon = idx === 0 ? '<i class="fa-solid fa-crown"></i>' : (idx + 1);
        
            const card = document.createElement('div');
            card.className = `top-unit-card ${rankClass}`;
            card.onclick = () => window.openDetailWrapper(p.id);
        
            card.innerHTML = `
                <div class="rank-icon">${icon}</div>
                <div class="top-name">${p.name}</div>
                <div class="top-job">${p.job}</div>
                <div class="top-score"><i class="fa-solid fa-bolt"></i> ${cp.toLocaleString()}</div>
            `;
            top3Container.appendChild(card);
        });
    } else {
        top3Container.innerHTML = `<div style="text-align:center; color:var(--text-muted); grid-column:span 3; font-size:0.8rem; padding:10px;">Requires Active Units (Non-Reserve)</div>`;
    }

    // 2. RENDER NORMAL LANES
    TEAMS.forEach(t => {
        const laneEl = document.getElementById(`lane-${t.id}`);
        laneEl.innerHTML = ''; 
        
        // Filter player per team
        const teamPlayers = players
            .filter(p => p.team === t.id)
            .sort((a, b) => {
                return calculateCombatRating(b.stats) - calculateCombatRating(a.stats);
            });

        document.getElementById(`cnt-${t.id}`).innerText = teamPlayers.length;

        const getStatusClass = (st) => {
            if(st === 'MERCENARY') return 'st-mercen';
            if(st === 'OUT_CAMP') return 'st-out';
            return 'st-on';
        };

        teamPlayers.forEach(p => {
            const info = getJobInfo(p.job);
            const cp = calculateCombatRating(p.stats); 
            const stClass = getStatusClass(p.status);

            const card = document.createElement('div');
            card.className = `card ${info.border}`;
            card.dataset.id = p.id;
            
            card.innerHTML = `
                <div class="card-name">
                    <span onclick="window.openDetailWrapper('${p.id}')" style="cursor:pointer; border-bottom:1px dotted var(--text-muted)">
                        <span class="status-dot ${stClass}"></span> ${p.name}
                    </span>
                    <i class="fa-solid fa-xmark" style="color:var(--text-muted); cursor:pointer; font-size:0.9em" onclick="window.deleteUnitWrapper('${p.id}')"></i>
                </div>
                <div class="card-job" onclick="window.openDetailWrapper('${p.id}')" style="cursor:pointer">
                    ${p.job} 
                    <span style="float:right; color:#facc15; font-weight:700; font-size:0.9em" title="Combat Rating">
                        <i class="fa-solid fa-bolt"></i> ${cp.toLocaleString()}
                    </span>
                </div>
                <span class="card-badge ${info.style}">${info.cat}</span>
            `;
            laneEl.appendChild(card);
        });
    });
}

function renderList() {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';
    
    const fName = document.getElementById('f-name').value.toLowerCase();
    const fTeam = document.getElementById('f-team').value;
    const fClass = document.getElementById('f-class').value;
    const fJob = document.getElementById('f-job').value;

    const jobTemplate = document.getElementById('hidden-job-template').innerHTML;

    let processedData = players.filter(p => {
        const info = getJobInfo(p.job);
        const matchName = p.name.toLowerCase().includes(fName);
        const matchTeam = (fTeam === 'ALL') ? true : p.team === fTeam;
        const matchClass = (fClass === 'ALL') ? true : info.cat === fClass;
        const matchJob = (fJob === 'ALL') ? true : p.job.includes(fJob);
        return matchName && matchTeam && matchClass && matchJob;
    });

    processedData.sort((a, b) => {
        let valA, valB;
        
        switch(currentSort.key) {
            case 'name':
                valA = a.name.toLowerCase();
                valB = b.name.toLowerCase();
                break;
            case 'job':
                valA = a.job.toLowerCase();
                valB = b.job.toLowerCase();
                break;
            case 'rating':
                valA = calculateCombatRating(a.stats);
                valB = calculateCombatRating(b.stats);
                break;
            case 'team':
                valA = TEAMS.findIndex(t => t.id === a.team);
                valB = TEAMS.findIndex(t => t.id === b.team);
                break;
            case 'class':
                valA = getJobInfo(a.job).cat;
                valB = getJobInfo(b.job).cat;
                break;
            default:
                valA = 0; valB = 0;
        }

        if (valA < valB) return currentSort.asc ? -1 : 1;
        if (valA > valB) return currentSort.asc ? 1 : -1;
        return 0;
    });

    document.querySelectorAll('.sortable-th').forEach(th => th.classList.remove('active-sort'));
    document.querySelectorAll('.sort-icon i').forEach(i => i.className = 'fa-solid fa-sort');

    const activeIcon = document.getElementById(`sort-icon-${currentSort.key}`);
    if(activeIcon) {
        activeIcon.parentElement.classList.add('active-sort');
        const iconEl = activeIcon.querySelector('i');
        iconEl.className = currentSort.asc ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down';
    }

    if(processedData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted);">No units match filters.</td></tr>`;
        return;
    }

    processedData.forEach(p => {
        const info = getJobInfo(p.job);
        const cp = calculateCombatRating(p.stats);

        let teamOpts = '';
        TEAMS.forEach(t => {
            teamOpts += `<option value="${t.id}" ${p.team === t.id ? 'selected' : ''}>${t.label}</option>`;
        });

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:600; color:white;">
                <i class="fa-solid fa-user-tag" style="color:var(--accent); margin-right:8px;"></i> ${p.name}
            </td>
            
            <td>
                <select class="table-select" onchange="window.changeJobWrapper('${p.id}', this)">
                    <option value="${p.job}" hidden>${p.job}</option>
                    ${jobTemplate}
                </select>
            </td>

            <td style="color:#facc15; font-weight:700; font-family:var(--font-head); letter-spacing:1px;">
                <i class="fa-solid fa-bolt" style="margin-right:5px; font-size:0.8em;"></i> ${cp.toLocaleString()}
            </td>

            <td>
                <select class="table-select" style="font-weight:600; color:${TEAMS.find(t=>t.id===p.team)?.color}" onchange="window.changeTeamWrapper('${p.id}', this)">
                    ${teamOpts}
                </select>
            </td>
            
            <td><span class="card-badge ${info.style}">${info.cat}</span></td>
            <td style="text-align:right; white-space:nowrap;">
                <button class="btn-ghost" style="padding:6px 10px; color:var(--accent); border:none; margin-right:5px;" onclick="window.openDetailWrapper('${p.id}')" title="View Stats">
                    <i class="fa-solid fa-eye"></i>
                </button>
                <button class="btn-ghost" style="padding:6px 10px; color:var(--text-muted); border:none;" onclick="window.deleteUnitWrapper('${p.id}')" title="Delete">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function copyDiscord() {
    let txt = "**Current Team war**\n";
    txt += `*Generated: ${new Date().toLocaleTimeString()}*\n────────────────\n`;
    
    let totalActive = 0;

    TEAMS.forEach(t => {
        if(t.id === 'res') return; 

        const list = players.filter(p => p.team === t.id);
        totalActive += list.length;

        txt += `\n**${t.label.toUpperCase()}** [${list.length}]\n`;
        if(list.length > 0) {
            txt += "```ini\n"; 
            list.forEach((p, i) => {
                txt += `[${(i+1).toString().padStart(2, '0')}] ${p.name.padEnd(12)} | ${p.job}\n`;
            });
            txt += "```";
        } else {
            txt += "> *No Units Assigned*\n";
        }
    });
    
    txt += `\n**TOTAL FORCES:** ${totalActive}`;

    navigator.clipboard.writeText(txt);
    
    const btn = document.getElementById('btn-copy');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-check"></i>`;
    setTimeout(() => btn.innerHTML = originalHTML, 2000);
}

function setupViewSwitcher() {
    const views = ['dash', 'board', 'list', 'map', 'compare', 'edit', 'war']; // ADDED 'war'
    views.forEach(v => {
        document.getElementById(`btn-view-${v}`).addEventListener('click', (e) => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
            document.getElementById(`view-${v}`).classList.add('active');
            
            const titles = { 
                'dash': 'COMMAND DASHBOARD',
                'board': 'TACTICAL BOARD', 
                'list': 'ROSTER DATABASE', 
                'map': 'OPERATIONS MAP',
                'compare': 'UNIT COMPARISON',
                'edit': 'LIVE DATA TERMINAL',
                'war': 'GLOBAL WAR ROOM' // NEW TITLE
            };
            document.getElementById('page-title').innerText = titles[v];
            if(v === 'map') resizeCanvas();
            if(v === 'edit') renderEditor();
        });
    });
}

function setupComparison() {
    const s1 = document.getElementById('comp-sel-1');
    const s2 = document.getElementById('comp-sel-2');
    [s1, s2].forEach(s => s.addEventListener('change', runComparison));
}

function renderCompareOptions() {
    const s1 = document.getElementById('comp-sel-1');
    const s2 = document.getElementById('comp-sel-2');
    const saved1 = s1.value;
    const saved2 = s2.value;
    
    s1.innerHTML = '<option value="">Select Unit A...</option>';
    s2.innerHTML = '<option value="">Select Unit B...</option>';
    
    players.sort((a,b) => a.name.localeCompare(b.name)).forEach(p => {
        s1.innerHTML += `<option value="${p.id}">${p.name} - ${p.job}</option>`;
        s2.innerHTML += `<option value="${p.id}">${p.name} - ${p.job}</option>`;
    });
    
    s1.value = saved1;
    s2.value = saved2;
    runComparison();
}

function runComparison() {
    const id1 = document.getElementById('comp-sel-1').value;
    const id2 = document.getElementById('comp-sel-2').value;
    const resBox = document.getElementById('comp-results');
    const emptyBox = document.getElementById('comp-empty');

    if(!id1 || !id2) {
        resBox.style.display = 'none';
        emptyBox.style.display = 'block';
        return;
    }

    const p1 = players.find(p => p.id === id1);
    const p2 = players.find(p => p.id === id2);
    if(!p1 || !p2) return;

    resBox.style.display = 'block';
    emptyBox.style.display = 'none';

    renderUnitHeader(1, p1);
    renderUnitHeader(2, p2);

    const s1 = p1.stats || {};
    const s2 = p2.stats || {};

    const statsConfig = [
        { key: 'atk', label: 'Attack Power', max: 200, type: 'offense' },
        { key: 'crit_rate', label: 'Crit Rate %', max: 100, type: 'offense' },
        { key: 'crit_dmg', label: 'Crit Dmg %', max: 250, type: 'offense' },
        { key: 'def', label: 'Armor / Def', max: 150, type: 'defense' },
        { key: 'dmg_red', label: 'Dmg Reduct %', max: 80, type: 'defense' },
        { key: 'crit_res', label: 'Crit Immun %', max: 80, type: 'defense' }
    ];

    renderStatGroup('stats-atk-1', s1, s2, statsConfig.filter(x => x.type === 'offense'), false);
    renderStatGroup('stats-def-1', s1, s2, statsConfig.filter(x => x.type === 'defense'), false);
    
    renderStatGroup('stats-atk-2', s2, s1, statsConfig.filter(x => x.type === 'offense'), true);
    renderStatGroup('stats-def-2', s2, s1, statsConfig.filter(x => x.type === 'defense'), true);

    updateRadarChart(p1, p2, s1, s2);

    runBattleSim(s1, s2);
}

function renderUnitHeader(idx, p) {
    document.getElementById(`c-name-${idx}`).innerText = p.name;
    const inf = getJobInfo(p.job);
    const badge = document.getElementById(`c-job-${idx}`);
    badge.innerText = p.job;
    badge.className = `card-badge ${inf.style}`;
    
    const sc = calculateCombatRating(p.stats);
    document.getElementById(`c-score-${idx}`).innerText = sc.toLocaleString();
}

function renderStatGroup(containerId, statsSelf, statsEnemy, config, isRightSide) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    config.forEach(c => {
        const valSelf = parseInt(statsSelf[c.key] || 0);
        const valEnemy = parseInt(statsEnemy[c.key] || 0);
        const diff = valSelf - valEnemy;
        const pct = Math.min((valSelf / c.max) * 100, 100);
        
        let deltaHtml = '';
        if(diff > 0) deltaHtml = `<span class="stat-delta val-up"><i class="fa-solid fa-caret-up"></i> ${diff}</span>`;
        else if(diff < 0) deltaHtml = `<span class="stat-delta val-down"><i class="fa-solid fa-caret-down"></i> ${Math.abs(diff)}</span>`;
        else deltaHtml = `<span class="stat-delta val-eq">-</span>`;

        let barColor = isRightSide ? 'var(--danger)' : 'var(--accent)';
        if(isRightSide && diff < 0) barColor = '#7f1d1d';
        if(!isRightSide && diff < 0) barColor = '#1e3a8a';

        const html = `
            <div style="margin-bottom:12px;">
                <div class="stat-row">
                    <span style="color:var(--text-muted);">${c.label}</span>
                    <div>
                        <span class="stat-val">${valSelf}</span>
                        ${deltaHtml}
                    </div>
                </div>
                <div class="bar-bg">
                    <div class="bar-fill" style="width:${pct}%; background:${barColor}"></div>
                </div>
            </div>
        `;
        container.innerHTML += html;
    });
}

function updateRadarChart(p1, p2, s1, s2) {
    const ctx = document.getElementById('compRadarChart').getContext('2d');
    
    const norm = (val, max) => Math.min((parseInt(val||0) / max) * 10, 10);

    const data1 = [
        norm(s1.atk, 200), norm(s1.crit_rate, 100), norm(s1.crit_dmg, 250), 
        norm(s1.def, 150), norm(s1.dmg_red, 80), norm(s1.crit_res, 80)
    ];
    const data2 = [
        norm(s2.atk, 200), norm(s2.crit_rate, 100), norm(s2.crit_dmg, 250), 
        norm(s2.def, 150), norm(s2.dmg_red, 80), norm(s2.crit_res, 80)
    ];

    if(compareChart) compareChart.destroy();

    compareChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['ATK', 'CRIT %', 'C.DMG', 'DEF', 'RESIST', 'C.RES'],
            datasets: [{
                label: p1.name,
                data: data1,
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                borderColor: '#3b82f6',
                borderWidth: 2,
                pointBackgroundColor: '#3b82f6'
            }, {
                label: p2.name,
                data: data2,
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                borderColor: '#ef4444',
                borderWidth: 2,
                pointBackgroundColor: '#ef4444'
            }]
        },
        options: {
            scales: {
                r: {
                    angleLines: { color: 'rgba(255,255,255,0.1)' },
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    pointLabels: { color: '#94a3b8', font: { size: 10, family: 'Rajdhani' } },
                    ticks: { display: false, max: 10 }
                }
            },
            plugins: {
                legend: { display: false }
            },
            maintainAspectRatio: false
        }
    });
}

function runBattleSim(s1, s2) {
    const calcPower = (s) => {
        let dmg = parseInt(s.atk || 0);
        let critMult = 1 + ((parseInt(s.crit_rate||0)/100) * (parseInt(s.crit_dmg||0)/100));
        return dmg * critMult;
    };

    const calcToughness = (s) => {
        let def = parseInt(s.def || 0);
        let redMult = 1 + (parseInt(s.dmg_red||0)/100);
        return def * redMult * 1.5;
    };

    const pow1 = calcPower(s1);
    const tou1 = calcToughness(s1);
    
    const pow2 = calcPower(s2);
    const tou2 = calcToughness(s2);

    const score1 = pow1 / (tou2 || 1); 
    const score2 = pow2 / (tou1 || 1);

    const total = score1 + score2;
    let win1 = 50, win2 = 50;
    
    if(total > 0) {
        win1 = Math.round((score1 / total) * 100);
        win2 = 100 - win1;
    }

    document.getElementById('pred-win-1').innerText = win1 + '%';
    document.getElementById('pred-win-2').innerText = win2 + '%';
    
    document.getElementById('pm-left').style.width = win1 + '%';
    
    const txt = document.getElementById('pred-text');
    if(Math.abs(win1 - win2) < 5) txt.innerText = "Matchup too close to call. Skill dependent.";
    else if(win1 > win2) txt.innerText = "Unit A has superior damage output potential.";
    else txt.innerText = "Unit B has superior damage output potential.";
}

let painting = false;
let penColor = '#ef4444';
const canvas = document.getElementById('draw-canvas');
const ctx = canvas.getContext('2d');
const mapBox = document.getElementById('map-box');
const img = document.getElementById('map-img');

function setupMap() {
    document.getElementById('map-select').addEventListener('change', changeMap);
    document.getElementById('btn-clear-map').addEventListener('click', () => ctx.clearRect(0,0,canvas.width, canvas.height));
    
    document.querySelectorAll('.color-dot').forEach(dot => {
        dot.addEventListener('click', (e) => {
            penColor = e.target.dataset.color;
            document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
            e.target.classList.add('active');
        });
    });

    canvas.addEventListener('mousedown', startP);
    canvas.addEventListener('mouseup', stopP);
    canvas.addEventListener('mousemove', drawP);
    window.addEventListener('resize', resizeCanvas);
    img.onload = resizeCanvas;
    changeMap();

    setupIconDragDrop();
    
    document.getElementById('btn-clear-icons').addEventListener('click', () => {
        if(confirm("Remove all tactical icons?")) {
            document.getElementById('icon-layer').innerHTML = '';
        }
    });
}

let currentDragId = null;

function setupIconDragDrop() {
    const draggables = document.querySelectorAll('.icon-draggable');
    const mapContainer = document.getElementById('map-box');
    
    draggables.forEach(icon => {
        icon.addEventListener('dragstart', (e) => {
            currentDragId = null; 
            e.dataTransfer.setData('type', icon.dataset.type);
            e.dataTransfer.setData('html', icon.innerHTML);
            e.dataTransfer.setData('colorClass', Array.from(icon.classList).find(c => c.startsWith('ico-')));
            e.dataTransfer.effectAllowed = 'copy';
        });
    });

    mapContainer.addEventListener('dragover', (e) => {
        e.preventDefault(); 
        e.dataTransfer.dropEffect = currentDragId ? 'move' : 'copy';
    });

    mapContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        const rect = mapContainer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (currentDragId) {
            const existingEl = document.getElementById(currentDragId);
            if(existingEl) {
                existingEl.style.left = x + 'px';
                existingEl.style.top = y + 'px';
            }
        } else {
            const type = e.dataTransfer.getData('type');
            const html = e.dataTransfer.getData('html');
            const colorClass = e.dataTransfer.getData('colorClass');
            if(type) {
                createMapIcon(x, y, html, colorClass);
            }
        }
        currentDragId = null;
    });
}

function createMapIcon(x, y, iconHtml, colorClass) {
    const iconLayer = document.getElementById('icon-layer');
    const el = document.createElement('div');
    el.className = `map-icon-placed ${colorClass || ''}`;
    el.innerHTML = iconHtml;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.id = 'map-icon-' + Date.now(); 
    
    el.style.pointerEvents = 'auto'; 
    el.draggable = true;

    el.addEventListener('dragstart', (e) => {
        currentDragId = el.id;
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => el.style.display = 'none', 0);
    });
    
    el.addEventListener('dragend', (e) => {
        currentDragId = null;
        el.style.display = 'flex';
    });

    el.addEventListener('dblclick', (e) => {
        e.stopPropagation(); 
        el.remove();
    });
    
    el.title = "Drag to move, Double click to delete";
    iconLayer.appendChild(el);
}

function changeMap() {
    img.src = document.getElementById('map-select').value;
}

function resizeCanvas() {
    canvas.width = mapBox.offsetWidth;
    canvas.height = mapBox.offsetHeight;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = penColor;
}

function startP(e) { painting = true; drawP(e); }
function stopP() { painting = false; ctx.beginPath(); }
function drawP(e) {
    if(!painting) return;
    const rect = canvas.getBoundingClientRect();
    ctx.strokeStyle = penColor;
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
}

// --- LIVE EDITOR LOGIC (UPDATED WITH SEARCH FILTER) ---
window.renderEditor = () => {
    const tbody = document.getElementById('sheet-body');
    tbody.innerHTML = '';
    
    // Ambil value dari search bar
    const filterVal = document.getElementById('editor-search').value.toLowerCase();

    // Sort by name biar rapi
    const sorted = [...players].sort((a,b) => a.name.localeCompare(b.name));

    sorted.forEach((p, index) => {
        // Filter: Jika nama tidak mengandung kata kunci, skip baris ini
        if(filterVal && !p.name.toLowerCase().includes(filterVal)) return;

        const s = p.stats || {};
        const tr = document.createElement('tr');
        tr.id = `row-${p.id}`;
        
        tr.innerHTML = `
            <td style="text-align:center; color:var(--text-muted);">${index+1}</td>
            <td style="padding:0 10px; font-weight:600; color:white;">${p.name}</td>
            <td style="padding:0 10px; color:var(--text-muted); font-size:0.8rem;">${p.job}</td>
            
            <td><input type="number" class="sheet-input col-atk" value="${s.atk||0}" oninput="markDirty('${p.id}')" id="e-atk-${p.id}"></td>
            <td><input type="number" class="sheet-input col-crit" value="${s.crit_rate||0}" oninput="markDirty('${p.id}')" id="e-cr-${p.id}"></td>
            <td><input type="number" class="sheet-input col-crit" value="${s.crit_dmg||0}" oninput="markDirty('${p.id}')" id="e-cd-${p.id}"></td>
            
            <td><input type="number" class="sheet-input col-def" value="${s.def||0}" oninput="markDirty('${p.id}')" id="e-def-${p.id}"></td>
            <td><input type="number" class="sheet-input col-def" value="${s.dmg_red||0}" oninput="markDirty('${p.id}')" id="e-dr-${p.id}"></td>
            <td><input type="number" class="sheet-input col-def" value="${s.crit_res||0}" oninput="markDirty('${p.id}')" id="e-ci-${p.id}"></td>
            
            <td style="text-align:center;">
                <button class="btn-save-row" onclick="saveRow('${p.id}')" title="Save Changes">
                    <i class="fa-solid fa-floppy-disk"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.markDirty = (id) => {
    document.getElementById(`row-${id}`).classList.add('row-dirty');
};

window.saveRow = async (id) => {
    if(!currentUser) return;
    
    const row = document.getElementById(`row-${id}`);
    const btn = row.querySelector('.btn-save-row');
    const icon = btn.querySelector('i');

    const newStats = {
        atk: document.getElementById(`e-atk-${id}`).value,
        crit_rate: document.getElementById(`e-cr-${id}`).value,
        crit_dmg: document.getElementById(`e-cd-${id}`).value,
        def: document.getElementById(`e-def-${id}`).value,
        dmg_red: document.getElementById(`e-dr-${id}`).value,
        crit_res: document.getElementById(`e-ci-${id}`).value,
    };

    icon.className = "fa-solid fa-circle-notch fa-spin";

    try {
        const unitRef = doc(db, "users", currentUser.uid, "units", id);
        await updateDoc(unitRef, { stats: newStats });
        
        row.classList.remove('row-dirty');
        icon.className = "fa-solid fa-check";
        setTimeout(() => icon.className = "fa-solid fa-floppy-disk", 1500);
    } catch (error) {
        console.error("Error updating:", error);
        icon.className = "fa-solid fa-circle-exclamation";
        alert("Gagal menyimpan data!");
    }
};