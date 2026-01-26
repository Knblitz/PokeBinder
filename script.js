import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- 1. FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyBEaz14NzexfSb0ohg19v0axiucgGm037w",
    authDomain: "tcgnationaldex.firebaseapp.com",
    projectId: "tcgnationaldex",
    storageBucket: "tcgnationaldex.firebasestorage.app",
    messagingSenderId: "20806052332",
    appId: "1:20806052332:web:f28b4fd4d7d017d081b8c9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- 2. GLOBAL STATE ---
let allPokemon = [], caughtList = [], artRarePlusList = [];
let currentUser = null, trainerName = "Trainer", currentSpread = 1;
const perPage = 9; 
const perSpread = 18; 
const TOTAL_COUNT = 1025;

// --- 3. AUTH & SYNC ENGINE ---
const provider = new GoogleAuthProvider();

window.handleLogin = async () => {
    const loginBtn = document.querySelector('.login-btn');
    if(loginBtn) loginBtn.innerText = "Connecting...";
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Login Error:", error);
        alert("Login failed: " + error.message);
        if(loginBtn) loginBtn.innerText = "Sign in with Google";
    }
};

window.continueAsGuest = () => {
    const authModal = document.getElementById('auth-modal');
    if(authModal) authModal.style.display = 'none';
    currentUser = null;
    trainerName = "Guest Trainer";
    init();
};

onAuthStateChanged(auth, async (user) => {
    const authModal = document.getElementById('auth-modal');
    if (user) {
        currentUser = user;
        if(authModal) authModal.style.display = 'none';
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            const data = userDoc.data();
            caughtList = data.caughtList || [];
            artRarePlusList = data.artRarePlusList || [];
            trainerName = data.trainerName || user.displayName || "Trainer";
        } else {
            trainerName = user.displayName || "New Trainer";
            await sync(); 
        }
        init();
    } else {
        if (trainerName !== "Guest Trainer") {
            if(authModal) authModal.style.display = 'flex';
        }
    }
});

window.handleLogout = () => {
    signOut(auth).then(() => { location.reload(); });
};

// --- 4. CORE ENGINE ---
async function init() {
    if (allPokemon.length === 0) {
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon?limit=${TOTAL_COUNT}`);
        const data = await res.json();
        allPokemon = data.results.map((p, i) => ({ 
            id: i + 1, 
            name: p.name,
            types: [] 
        }));
        fetchAllTypesInOrder();
    }
    render();
    setupSearchSuggestions();
}

async function fetchAllTypesInOrder() {
    const chunkSize = 50; 
    for (let i = 0; i < allPokemon.length; i += chunkSize) {
        const chunk = allPokemon.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async (poke) => {
            try {
                const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${poke.id}`);
                const data = await res.json();
                poke.types = data.types.sort((a, b) => a.slot - b.slot).map(t => t.type.name);
            } catch (e) { console.error(`Failed types for #${poke.id}`); }
        }));
        render(); 
    }
}

// --- 5. RENDER ENGINE (WITH REFLOW & NEW FILTER) ---
function render() {
    const leftCont = document.getElementById('left-page-content');
    const rightCont = document.getElementById('right-page-content');
    const counterEl = document.getElementById('result-counter');

    const term = document.getElementById('search-input').value.toLowerCase().trim();
    const gen = document.getElementById('gen-filter').value;
    const missingAR = document.getElementById('missing-rare-toggle').checked;
    const missingDex = document.getElementById('missing-dex-toggle').checked;
    const caughtOnly = document.getElementById('caught-only-toggle').checked;
    const arOnly = document.getElementById('ar-only-toggle').checked;
    const ghostMode = document.getElementById('ghost-mode-toggle').checked;

    const filteredResults = allPokemon.filter(p => {
        const isCaught = caughtList.includes(p.id);
        const isAR = artRarePlusList.includes(p.id);
        const searchMatch = p.name.includes(term) || p.id.toString() === term || p.types.some(t => t.includes(term));
        
        let genMatch = true;
        if (gen !== "all") {
            const g = parseInt(gen);
            const ranges = [0, 151, 251, 386, 493, 649, 721, 809, 905, 1025];
            genMatch = p.id > ranges[g-1] && p.id <= ranges[g];
        }

        let statusMatch = true;
        if (missingDex) statusMatch = !isCaught;
        else if (missingAR) statusMatch = isCaught && !isAR;
        else if (arOnly) statusMatch = isAR;
        else if (caughtOnly) statusMatch = isCaught;

        return searchMatch && genMatch && statusMatch;
    });

    if (counterEl) counterEl.innerText = `Found ${filteredResults.length} Pokémon`;

    if (ghostMode) {
        const offset = (currentSpread - 1) * perSpread - 9;
        if (currentSpread === 1) {
            leftCont.innerHTML = generateFullDashboardHTML();
            const rightItems = allPokemon.slice(0, perPage);
            rightCont.innerHTML = rightItems.map(p => filteredResults.includes(p) ? createCardHTML(p) : `<div class="card hidden-slot" style="visibility: hidden;"></div>`).join('');
            updatePageNumbers("Trainer Profile", "National Dex P.1");
        } else {
            const leftItems = allPokemon.slice(offset, offset + perPage);
            const rightItems = allPokemon.slice(offset + perPage, offset + perSpread);
            leftCont.innerHTML = `${generateMiniStatsHTML()}<div class="grid-3x3">${leftItems.map(p => filteredResults.includes(p) ? createCardHTML(p) : `<div class="card hidden-slot" style="visibility: hidden;"></div>`).join('')}</div>`;
            rightCont.innerHTML = rightItems.map(p => filteredResults.includes(p) ? createCardHTML(p) : `<div class="card hidden-slot" style="visibility: hidden;"></div>`).join('');
            updatePageNumbers(`Page ${(currentSpread * 2) - 2}`, `Page ${(currentSpread * 2) - 1}`);
        }
    } else {
        const flowOffset = (currentSpread - 1) * perSpread - 9;
        if (currentSpread === 1) {
            leftCont.innerHTML = generateFullDashboardHTML();
            const rightItems = filteredResults.slice(0, perPage);
            rightCont.innerHTML = rightItems.map(p => createCardHTML(p)).join('');
            updatePageNumbers("Trainer Profile", "Results P.1");
        } else {
            const leftItems = filteredResults.slice(flowOffset, flowOffset + perPage);
            const rightItems = filteredResults.slice(flowOffset + perPage, flowOffset + perSpread);
            leftCont.innerHTML = `${generateMiniStatsHTML()}<div class="grid-3x3">${leftItems.map(p => createCardHTML(p)).join('')}</div>`;
            rightCont.innerHTML = rightItems.map(p => createCardHTML(p)).join('');
            updatePageNumbers(`Results P.${(currentSpread * 2) - 2}`, `Results P.${(currentSpread * 2) - 1}`);
        }
    }

    updateDashboardStats();
    attachListeners();
    updateUI(ghostMode ? allPokemon.length : filteredResults.length);
}

// --- 6. DASHBOARD GENERATORS ---
function generateFullDashboardHTML() {
    return `
        <div class="dashboard-container">
            <div class="trainer-profile-header">
                <div class="identity">
                    <h2>Trainer: ${trainerName}</h2>
                    <button onclick="renameTrainer()" class="edit-btn">✎ Edit Name</button>
                </div>
                <button onclick="handleLogout()" class="logout-link">Sign Out</button>
            </div>
            <div class="main-stats-grid">
                <div class="stat-card">
                    <span class="stat-label">Total Caught</span>
                    <b class="stat-value"><span id="total-caught">0</span>/${TOTAL_COUNT}</b>
                    <div class="progress-subtext" id="national-percent">0% Complete</div>
                </div>
                <div class="stat-card">
                    <span class="stat-label">Total Art Rare+</span>
                    <b class="stat-value gold-text"><span id="total-art-rare">0</span>/${TOTAL_COUNT}</b>
                    <div class="progress-subtext" id="ar-percent">0% Complete</div>
                </div>
            </div>
            <h3 class="section-subtitle">Regional Progress</h3>
            <div id="gen-stats" class="gen-dashboard-grid"></div>
        </div>
    `;
}

function generateMiniStatsHTML() {
    return `
        <div class="mini-trainer-header">
            <div class="mini-stats-upper">
                <span class="mini-label"><strong>Dex Progress</strong></span>
                <div class="mini-pills">
                    <span class="mini-pill">C: <b id="total-caught-mini">0</b></span>
                    <span class="mini-pill" style="margin-left:10px">AR+: <b id="total-art-rare-mini" class="gold-text">0</b></span>
                </div>
            </div>
            <div id="gen-stats-mini" class="gen-mini-grid"></div>
        </div>
    `;
}

function updateDashboardStats() {
    const caughtCount = caughtList.length;
    const arCount = artRarePlusList.length;

    ['total-caught', 'total-caught-mini', 'total-art-rare', 'total-art-rare-mini'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = id.includes('caught') ? caughtCount : arCount;
    });

    const gens = [
        {n:"Gen 1",s:1,e:151},{n:"Gen 2",s:152,e:251},{n:"Gen 3",s:252,e:386},
        {n:"Gen 4",s:387,e:493},{n:"Gen 5",s:494,e:649},{n:"Gen 6",s:650,e:721},
        {n:"Gen 7",s:722,e:809},{n:"Gen 8",s:810,e:905},{n:"Gen 9",s:906,e:1025}
    ];

    if (document.getElementById('gen-stats')) {
        document.getElementById('gen-stats').innerHTML = gens.map((g, i) => {
            const c = caughtList.filter(id => id >= g.s && id <= g.e).length;
            const arc = artRarePlusList.filter(id => id >= g.s && id <= g.e).length;
            return `
                <div class="gen-stat-tag" onclick="jumpToGen(${i+1})">
                    <b>${g.n}</b>
                    <div class="gen-row">Dex: ${c}/${g.e-g.s+1}</div>
                    <div class="gen-row gold-text">AR+: ${arc}</div>
                </div>`;
        }).join('');
    }

    if (document.getElementById('gen-stats-mini')) {
        document.getElementById('gen-stats-mini').innerHTML = gens.map((g, i) => {
            const c = caughtList.filter(id => id >= g.s && id <= g.e).length;
            const arc = artRarePlusList.filter(id => id >= g.s && id <= g.e).length;
            return `
                <div class="mini-gen-tag" onclick="jumpToGen(${i+1})">
                    <b>G${i+1}</b>
                    <span>${c}</span>
                    <span class="mini-ar-val">✨${arc}</span>
                </div>`;
        }).join('');
    }
}

// --- 7. CARD RENDERING ---
function createCardHTML(p) {
    if (!p) return `<div class="card empty"></div>`;
    const isCaught = caughtList.includes(p.id);
    const isAR = artRarePlusList.includes(p.id);
    const sprite = isAR 
        ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${p.id}.png`
        : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png`;

    return `
        <div class="card ${isCaught ? 'caught' : ''} ${isAR ? 'art-rare-plus' : ''}">
            <div class="card-header">
                <span>#${p.id}</span>
                <div class="check-group">
                    <button class="art-rare-btn ${isAR ? 'active' : ''}" data-id="${p.id}">✨</button>
                    <input type="checkbox" class="catch-check" ${isCaught ? 'checked' : ''} data-id="${p.id}">
                </div>
            </div>
            <img src="${sprite}" loading="lazy">
            <strong style="text-transform: capitalize;">${p.name}</strong>
            <div class="type-container">${p.types.map(t => `<span class="type-badge ${t}">${t}</span>`).join('')}</div>
        </div>
    `;
}

// --- 8. SMART SUGGESTIONS ---
function setupSearchSuggestions() {
    const searchInput = document.getElementById('search-input');
    const suggestionBox = document.getElementById('suggestion-box');

    searchInput.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase().trim();
        if (val.length < 2) { suggestionBox.style.display = 'none'; return; }

        const matches = allPokemon.filter(p => 
            p.name.includes(val) || p.id.toString() === val || p.types.some(t => t.includes(val))
        ).slice(0, 10);

        if (matches.length > 0) {
            suggestionBox.innerHTML = matches.map(p => `
                <div class="suggestion-item" data-id="${p.id}">
                    <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png">
                    <div class="suggestion-info">
                        <div class="suggestion-top-row">
                            <b>${p.name}</b>
                            <span class="suggestion-id">#${p.id}</span>
                        </div>
                        <div class="type-container" style="gap: 2px; margin-top: 2px;">
                            ${p.types.map(t => `<span class="type-badge ${t}" style="font-size:0.5rem; padding: 1px 4px;">${t}</span>`).join('')}
                        </div>
                    </div>
                </div>
            `).join('');
            suggestionBox.style.display = 'block';

            document.querySelectorAll('.suggestion-item').forEach(item => {
                item.onclick = () => {
                    jumpToId(parseInt(item.dataset.id));
                    suggestionBox.style.display = 'none';
                    searchInput.value = "";
                };
            });
        } else { suggestionBox.style.display = 'none'; }
    });
}

// --- 9. NAVIGATION ---
function jumpToId(id) {
    const ghostMode = document.getElementById('ghost-mode-toggle').checked;
    if (ghostMode) {
        const pageNum = Math.ceil(id / perPage);
        currentSpread = Math.floor(pageNum / 2) + 1;
    } else {
        // In Reflow mode, jump to the first page of the filtered results
        currentSpread = 1;
    }
    render();
}

window.jumpToGen = (g) => {
    // When clicking a Gen, we set the filter and reset to page 1
    const genFilter = document.getElementById('gen-filter');
    if (genFilter) genFilter.value = g.toString();
    currentSpread = 1;
    render();
};

function attachListeners() {
    document.getElementById('next-btn').onclick = () => { currentSpread++; render(); window.scrollTo(0,0); };
    document.getElementById('prev-btn').onclick = () => { if (currentSpread > 1) { currentSpread--; render(); window.scrollTo(0,0); }};
    document.getElementById('skip-btn').onclick = () => {
        const pageNum = parseInt(document.getElementById('skip-input').value);
        if (!isNaN(pageNum)) { currentSpread = Math.floor(pageNum / 2) + 1; render(); }
    };

    document.querySelectorAll('.art-rare-btn').forEach(btn => {
        btn.onclick = (e) => {
            const id = parseInt(e.currentTarget.dataset.id);
            if (!artRarePlusList.includes(id)) {
                artRarePlusList.push(id);
                if (!caughtList.includes(id)) caughtList.push(id);
            } else { artRarePlusList = artRarePlusList.filter(i => i !== id); }
            sync(); render();
        };
    });

    document.querySelectorAll('.catch-check').forEach(check => {
        check.onchange = (e) => {
            const id = parseInt(e.target.dataset.id);
            if (e.target.checked) { if (!caughtList.includes(id)) caughtList.push(id); }
            else { 
                caughtList = caughtList.filter(i => i !== id); 
                artRarePlusList = artRarePlusList.filter(i => i !== id); 
            }
            sync(); render();
        };
    });
}

function updatePageNumbers(l, r) {
    document.getElementById('left-page-num').innerText = l;
    document.getElementById('right-page-num').innerText = r;
}

function updateUI(totalItems) {
    const totalSpreads = Math.ceil((totalItems + 9) / perSpread);
    document.getElementById('prev-btn').disabled = currentSpread === 1;
    document.getElementById('next-btn').disabled = currentSpread >= totalSpreads || totalItems === 0;
}

async function sync() {
    if (!currentUser) return;
    await setDoc(doc(db, "users", currentUser.uid), {
        caughtList, artRarePlusList, trainerName
    }, { merge: true });
}

window.renameTrainer = () => {
    const n = prompt("Enter Trainer Name:", trainerName);
    if (n) { trainerName = n; sync(); render(); }
};

// --- 10. EVENT HANDLERS ---
document.getElementById('gen-filter').onchange = () => {
    currentSpread = 1; // Reset to page 1 when changing generation
    render();
};

document.getElementById('search-input').oninput = () => {
    currentSpread = 1; // Reset to page 1 when typing
    render();
};

['missing-rare-toggle', 'missing-dex-toggle', 'caught-only-toggle', 'ar-only-toggle', 'ghost-mode-toggle'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.onchange = () => {
        currentSpread = 1; // Reset to page 1 when toggling filters
        render();
    };
});