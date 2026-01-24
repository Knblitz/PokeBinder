/**
 * National Pokédex Binder - Ultimate Collector Edition
 * Features: Fixed Grid, Dual-Checklist, Rare Art Missing Logic
 */

let allPokemon = [];      
let filteredIds = [];    
let currentPage = 1;
const perPage = 9;        
const TOTAL_POKEMON = 1025; 

// Persistence: Load caught and master lists
let caughtList = JSON.parse(localStorage.getItem('caughtPokemon')) || [];
let masterList = JSON.parse(localStorage.getItem('masterPokemon')) || []; 

document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const grid = document.getElementById('grid-3x3');
    const pageInfo = document.getElementById('page-num');
    const nextBtn = document.getElementById('next-btn');
    const prevBtn = document.getElementById('prev-btn');
    const searchInput = document.getElementById('search-input');
    const genFilter = document.getElementById('gen-filter');
    const rareToggle = document.getElementById('missing-rare-toggle');
    const skipInput = document.getElementById('skip-input');
    const skipBtn = document.getElementById('skip-btn');

    /**
     * INITIALIZE: Fetch data and build binder
     */
    async function init() {
        grid.innerHTML = "<div class='loader'>Syncing Master Binder Data...</div>";
        try {
            const res = await fetch(`https://pokeapi.co/api/v2/pokemon?limit=${TOTAL_POKEMON}`);
            const data = await res.json();
            
            // Fetch detailed stats/types for all 1025
            const details = await Promise.all(
                data.results.map(p => fetch(p.url).then(r => r.json()))
            );
            
            allPokemon = details;
            filteredIds = allPokemon.map(p => p.id); 
            
            updateCollectionDashboard();
            render(); 
        } catch (err) {
            grid.innerHTML = "<div class='error'>Terminal Offline. Check connection.</div>";
            console.error(err);
        }
    }

    /**
     * RENDER: Draws the 3x3 Grid with Fixed Slot Logic
     */
    function render() {
        grid.innerHTML = "";
        const start = (currentPage - 1) * perPage;
        const pageItems = allPokemon.slice(start, start + perPage);

        pageItems.forEach(p => {
            const isCaught = caughtList.includes(p.id);
            const isMaster = masterList.includes(p.id);
            const isMatch = filteredIds.includes(p.id);
            const card = document.createElement('div');
            const mainType = p.types[0].type.name;
            
            card.className = `card type-border-${mainType} ${isCaught ? 'caught' : ''} ${isMaster ? 'master-tier' : ''}`;
            
            // Fixed Positioning: Invisible but occupies space if filtered out
            if (!isMatch) {
                card.style.visibility = "hidden"; 
                card.style.pointerEvents = "none";
            }

            const typeLabels = p.types.map(t => 
                `<span class="type-pill ${t.type.name}">${t.type.name}</span>`
            ).join('');

            card.innerHTML = `
                <div class="card-header">
                    <span class="dex-id">#${p.id.toString().padStart(3, '0')}</span>
                    <div class="check-group">
                        <button class="master-btn ${isMaster ? 'active' : ''}" data-id="${p.id}" title="Alt Art/Rare Version">★</button>
                        <input type="checkbox" class="catch-check" ${isCaught ? 'checked' : ''} data-id="${p.id}" title="Standard Caught">
                    </div>
                </div>
                <img src="${p.sprites.front_default}" alt="${p.name}" loading="lazy">
                <strong>${p.name.replace(/-/g, ' ')}</strong>
                <div class="type-container">${typeLabels}</div>
            `;
            grid.appendChild(card);
        });

        attachListeners();
        updateUI();
    }

    /**
     * LISTENERS: Updates storage and UI classes
     */
    function attachListeners() {
        // Standard Checklist
        document.querySelectorAll('.catch-check').forEach(check => {
            check.onchange = (e) => {
                const id = parseInt(e.target.dataset.id);
                if (e.target.checked) {
                    if (!caughtList.includes(id)) caughtList.push(id);
                } else {
                    caughtList = caughtList.filter(item => item !== id);
                }
                saveAndRefresh();
                e.target.closest('.card').classList.toggle('caught', e.target.checked);
            };
        });

        // Rare Art (★) Tracker
        document.querySelectorAll('.master-btn').forEach(btn => {
            btn.onclick = (e) => {
                const id = parseInt(e.target.dataset.id);
                const isActive = e.target.classList.toggle('active');
                if (isActive) {
                    if (!masterList.includes(id)) masterList.push(id);
                } else {
                    masterList = masterList.filter(item => item !== id);
                }
                saveAndRefresh();
                e.target.closest('.card').classList.toggle('master-tier', isActive);
            };
        });
    }

    function saveAndRefresh() {
        localStorage.setItem('caughtPokemon', JSON.stringify(caughtList));
        localStorage.setItem('masterPokemon', JSON.stringify(masterList));
        updateCollectionDashboard();
    }

    /**
     * DASHBOARD: Gen Stats + Clickable Missing/Rare Missing Filter
     */
    function updateCollectionDashboard() {
        document.getElementById('total-caught').innerText = caughtList.length;
        document.getElementById('total-master').innerText = masterList.length;
        
        const genRanges = {
            "G1": [1, 151], "G2": [152, 251], "G3": [252, 386], "G4": [387, 493],
            "G5": [494, 649], "G6": [650, 721], "G7": [722, 809], "G8": [810, 905], "G9": [906, 1025]
        };

        const dashboard = document.getElementById('gen-stats');
        if (!dashboard) return;
        dashboard.innerHTML = "";

        for (const [gen, range] of Object.entries(genRanges)) {
            const caughtInGen = caughtList.filter(id => id >= range[0] && id <= range[1]).length;
            const masterInGen = masterList.filter(id => id >= range[0] && id <= range[1]).length;
            const total = range[1] - range[0] + 1;
            
            const statBtn = document.createElement('button');
            statBtn.className = 'gen-stat-tag clickable';
            statBtn.innerHTML = `
                <strong>${gen}</strong><br>
                Base: ${caughtInGen}/${total}<br>
                <span class="gold-text">★ ${masterInGen}</span>
            `;
            
            statBtn.onclick = () => {
                searchInput.value = ""; 
                genFilter.value = gen.replace("G", ""); 
                applyFilters(); // Triggers logic using the current toggle state
            };
            dashboard.appendChild(statBtn);
        }
    }

    /**
     * FILTER LOGIC: Name, Gen, Missing Base, or Missing Rare Art
     */
    function applyFilters() {
        const term = searchInput.value.toLowerCase().trim();
        const gen = genFilter.value;
        const showMissingRare = rareToggle.checked;
        
        filteredIds = allPokemon.filter(p => {
            const nameMatch = p.name.includes(term) || p.id.toString() === term;
            
            let genMatch = true;
            if(gen === "1") genMatch = p.id <= 151;
            else if(gen === "2") genMatch = p.id > 151 && p.id <= 251;
            else if(gen === "3") genMatch = p.id > 251 && p.id <= 386;
            else if(gen === "4") genMatch = p.id > 386 && p.id <= 493;
            else if(gen === "5") genMatch = p.id > 493 && p.id <= 649;
            else if(gen === "6") genMatch = p.id > 649 && p.id <= 721;
            else if(gen === "7") genMatch = p.id > 721 && p.id <= 809;
            else if(gen === "8") genMatch = p.id > 809 && p.id <= 905;
            else if(gen === "9") genMatch = p.id > 905;

            let missingMatch = true;
            if (showMissingRare) {
                // "Missing Rare" means you have the base card, but no Star (★)
                missingMatch = caughtList.includes(p.id) && !masterList.includes(p.id);
            } else {
                // If we are coming from a Dashboard click, we might want "Missing Base"
                // This logic triggers if the filter is specifically "searching" for gaps
                // If standard view, missingMatch remains true.
            }

            return nameMatch && genMatch && missingMatch;
        }).map(p => p.id);

        if (filteredIds.length > 0) {
            currentPage = Math.ceil(filteredIds[0] / perPage);
        }
        render();
    }

    /**
     * NAVIGATION
     */
    function updateUI() {
        const totalPages = Math.ceil(allPokemon.length / perPage);
        pageInfo.innerText = `Page ${currentPage} of ${totalPages}`;
        prevBtn.disabled = currentPage === 1;
        nextBtn.disabled = currentPage >= totalPages;
    }

    nextBtn.onclick = () => { currentPage++; render(); window.scrollTo(0,0); };
    prevBtn.onclick = () => { if(currentPage > 1) { currentPage--; render(); window.scrollTo(0,0); } };
    skipBtn.onclick = () => {
        const target = parseInt(skipInput.value);
        if (target >= 1 && target <= Math.ceil(allPokemon.length / perPage)) {
            currentPage = target; render(); skipInput.value = "";
        }
    };

    searchInput.oninput = applyFilters;
    genFilter.onchange = applyFilters;
    rareToggle.onchange = applyFilters;

    init();
});