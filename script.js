class BeerFestivalApp {
    constructor() {
        this.beers = [];
        this.filteredBeers = [];
        this.currentSort = { column: null, direction: 'asc' };
        this.beerAvailability = new Map(); // Track beer availability
        
        // Initialize Supabase client
        try {
            this.supabase = window.supabase.createClient(
                'https://plsnpnixbpcnwwjgkkdo.supabase.co',
                'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsc25wbml4YnBjbnd3amdra2RvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTczNTYwMjUsImV4cCI6MjA3MjkzMjAyNX0._jbMUYSfB9wn13AZD5H2oazZ3jSr1Iwh88f5DBvHfVI'
            );
            console.log('Supabase client initialized');
        } catch (error) {
            console.warn('Supabase initialization failed:', error);
            this.supabase = null;
        }
        
        this.elements = {
            loading: document.getElementById('loading'),
            error: document.getElementById('error'),
            table: document.getElementById('beerTable'),
            tableBody: document.getElementById('beerTableBody'),
            searchInput: document.getElementById('searchInput'),
            barFilter: document.getElementById('barFilter'),
            styleFilter: document.getElementById('styleFilter'),
            availabilityFilter: document.getElementById('availabilityFilter'),
            abvMin: document.getElementById('abvMin'),
            abvMax: document.getElementById('abvMax'),
            abvMinValue: document.getElementById('abvMinValue'),
            abvMaxValue: document.getElementById('abvMaxValue'),
            resultCount: document.getElementById('resultCount')
        };
        
        this.init();
    }
    
    async init() {
        this.setupEventListeners();
        await this.loadFreshBeerData();
        await this.loadBeerAvailability();
    }
    
    setupEventListeners() {
        // Search input
        this.elements.searchInput.addEventListener('input', () => this.filterBeers());
        
        // Filter dropdowns
        this.elements.barFilter.addEventListener('change', () => this.filterBeers());
        this.elements.styleFilter.addEventListener('change', () => this.filterBeers());
        this.elements.availabilityFilter.addEventListener('change', () => this.filterBeers());
        
        // ABV range sliders
        this.elements.abvMin.addEventListener('input', (e) => {
            this.elements.abvMinValue.textContent = e.target.value + '%';
            this.filterBeers();
        });
        
        this.elements.abvMax.addEventListener('input', (e) => {
            this.elements.abvMaxValue.textContent = e.target.value + '%';
            this.filterBeers();
        });
        
        // Table header sorting
        document.querySelectorAll('th[data-sort]').forEach(th => {
            th.addEventListener('click', () => this.sortTable(th.dataset.sort));
        });
    }
    
    async loadFreshBeerData() {
        try {
            // Always fetch fresh data from the website on page load
            this.elements.loading.textContent = 'Loading latest beer data...';
            
            // Use CORS proxy to bypass same-origin policy
            const proxyUrl = 'https://api.allorigins.win/get?url=';
            const targetUrl = 'https://chappelbeerfestival.org.uk/summer/beerlist.php';
            
            // Add cache-busting parameter to ensure fresh data
            const cacheBuster = Date.now();
            const fullUrl = proxyUrl + encodeURIComponent(targetUrl + '?t=' + cacheBuster);
            
            const response = await fetch(fullUrl);
            
            if (!response.ok) {
                throw new Error('Failed to fetch beer data');
            }
            
            const data = await response.json();
            this.parseHtmlData(data.contents);
            
        } catch (error) {
            console.error('Error loading beer data:', error);
            this.showError();
        }
    }
    
    parseHtmlData(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Find all table rows that contain beer data
        const rows = doc.querySelectorAll('table tr');
        const beerData = [];
        
        for (let row of rows) {
            const cells = row.querySelectorAll('td');
            
            // Skip header rows and rows with insufficient columns
            if (cells.length >= 6) {
                const brewery = cells[0].textContent.trim();
                const beer = cells[1].textContent.trim();
                const style = cells[2].textContent.trim();
                const abvText = cells[3].textContent.trim();
                const location = cells[4].textContent.trim();
                const bar = cells[5].textContent.trim();
                
                // Only add rows with actual beer data
                if (brewery && beer && brewery !== 'Brewery') {
                    const beerEntry = {
                        brewery: brewery,
                        beer: beer,
                        style: style,
                        abv: this.parseABV(abvText),
                        location: location,
                        bar: bar
                    };
                    beerData.push(beerEntry);
                }
            }
        }
        
        if (beerData.length === 0) {
            throw new Error('No beer data found in the response');
        }
        
        this.beers = beerData;
        this.filteredBeers = [...this.beers];
        
        this.populateFilters();
        this.renderTable();
        this.hideLoading();
        
        // Update loading message to show data timestamp
        console.log(`Loaded ${this.beers.length} beers at ${new Date().toLocaleTimeString()}`);
    }
    
    parseABV(abvText) {
        // Extract numeric value from ABV text (e.g., "4.5%" -> 4.5)
        const match = abvText.match(/(\d+\.?\d*)/);
        return match ? parseFloat(match[1]) : 0;
    }
    
    extractCleanBeerStyle(styleText) {
        // Core beer types - only these will appear in the style filter
        const coreTypes = [
            { keywords: ['ipa', 'india pale ale'], category: 'IPA' },
            { keywords: ['bitter'], category: 'Bitter' },
            { keywords: ['golden ale', 'golden'], category: 'Golden Ale' },
            { keywords: ['pale ale'], category: 'Pale Ale' },
            { keywords: ['amber ale'], category: 'Amber Ale' },
            { keywords: ['brown ale'], category: 'Brown Ale' },
            { keywords: ['mild'], category: 'Mild' },
            { keywords: ['old ale'], category: 'Old Ale' },
            { keywords: ['strong ale'], category: 'Strong Ale' },
            { keywords: ['barley wine'], category: 'Barley Wine' },
            { keywords: ['stout'], category: 'Stout' },
            { keywords: ['porter'], category: 'Porter' },
            { keywords: ['wheat', 'weizen', 'witbier'], category: 'Wheat Beer' },
            { keywords: ['pilsner', 'pils'], category: 'Pilsner' },
            { keywords: ['lager'], category: 'Lager' },
            { keywords: ['saison'], category: 'Saison' },
            { keywords: ['sour', 'gose', 'lambic'], category: 'Sour' },
            { keywords: ['cider'], category: 'Cider' },
            { keywords: ['perry'], category: 'Perry' },
            { keywords: ['ale'], category: 'Ale' } // Generic fallback
        ];
        
        const lowerStyle = styleText.toLowerCase();
        
        // Find matching core type
        for (const type of coreTypes) {
            for (const keyword of type.keywords) {
                if (lowerStyle.includes(keyword)) {
                    return type.category;
                }
            }
        }
        
        return null; // Return null if no core type matches
    }
    
    async loadBeerAvailability() {
        if (!this.supabase) {
            console.warn('Supabase not available, skipping beer availability');
            return;
        }
        
        try {
            const { data, error } = await this.supabase
                .from('beer_availability')
                .select('brewery, beer_name, is_available, updated_by, updated_at');
            
            if (error) {
                console.warn('Beer availability table not found, skipping:', error.message);
                return;
            }
            
            // Store availability data in our map
            this.beerAvailability.clear();
            data.forEach(item => {
                const key = `${item.brewery}|${item.beer_name}`;
                this.beerAvailability.set(key, {
                    is_available: item.is_available,
                    updated_by: item.updated_by,
                    updated_at: item.updated_at
                });
            });
        } catch (error) {
            console.error('Error loading beer availability:', error);
        }
    }
    
    async toggleBeerAvailability(beer) {
        console.log('=== toggleBeerAvailability called ===', beer.brewery, beer.beer);
        
        if (!this.supabase) {
            alert('Beer availability feature is not available - Supabase not initialized');
            return;
        }
        
        const key = `${beer.brewery}|${beer.beer}`;
        
        // First, get the current status from the database to ensure accuracy
        let currentStatus = false;
        let recordExists = false;
        
        try {
            const { data: currentData, error: fetchError } = await this.supabase
                .from('beer_availability')
                .select('*')
                .eq('brewery', beer.brewery)
                .eq('beer_name', beer.beer)
                .single();
                
            console.log('Current record in DB:', currentData, 'Error:', fetchError);
                
            if (!fetchError && currentData) {
                currentStatus = currentData.is_available;
                recordExists = true;
                console.log(`Record exists: is_available=${currentStatus}`);
            } else {
                console.log('No record found or error occurred');
            }
        } catch (e) {
            console.log('Exception fetching record:', e);
        }
        
        const newStatus = !currentStatus;
        
        // Get a simple user identifier (could be improved with actual auth)
        const userId = this.getUserId();
        
        try {
            console.log('Attempting to update beer:', {
                brewery: beer.brewery,
                beer_name: beer.beer,
                record_exists: recordExists,
                current_status: currentStatus,
                new_status: newStatus,
                user_id: userId
            });
            
            // Let's see what the UI thinks the current status is
            const uiStatus = this.getBeerAvailability(beer);
            console.log('UI thinks status is:', uiStatus, 'DB says:', currentStatus);
            
            // Try different approaches based on whether record exists
            let error = null;
            
            if (recordExists) {
                console.log('Record exists, doing UPDATE...');
                const { error: updateError } = await this.supabase
                    .from('beer_availability')
                    .update({
                        is_available: newStatus,
                        updated_by: userId,
                        updated_at: new Date().toISOString()
                    })
                    .eq('brewery', beer.brewery)
                    .eq('beer_name', beer.beer);
                error = updateError;
            } else {
                console.log('Record does not exist, doing INSERT...');
                const { error: insertError } = await this.supabase
                    .from('beer_availability')
                    .insert({
                        brewery: beer.brewery,
                        beer_name: beer.beer,
                        is_available: newStatus,
                        updated_by: userId,
                        updated_at: new Date().toISOString()
                    });
                error = insertError;
            }
            
            if (error) {
                console.error('Supabase error details:', error);
                alert(`Could not update beer availability: ${error.message}`);
                return;
            }
            
            console.log('Database operation completed, reloading availability data...');
            
            // Always reload fresh data from database after any change
            await this.loadBeerAvailability();
            
            // Re-render table to show updated status
            this.renderTable();
        } catch (error) {
            console.error('Error updating beer availability:', error);
        }
    }
    
    getBeerAvailability(beer) {
        const key = `${beer.brewery}|${beer.beer}`;
        const data = this.beerAvailability.get(key);
        return data ? data.is_available : false;
    }
    
    getBeerAvailabilityInfo(beer) {
        const key = `${beer.brewery}|${beer.beer}`;
        return this.beerAvailability.get(key) || null;
    }
    
    getUserId() {
        // Simple user ID generation - stores in localStorage
        let userId = localStorage.getItem('beer_tracker_user_id');
        if (!userId) {
            userId = 'User_' + Math.random().toString(36).substr(2, 6);
            localStorage.setItem('beer_tracker_user_id', userId);
        }
        return userId;
    }
    
    formatTimeAgo(timestamp) {
        if (!timestamp) return '';
        
        const now = new Date();
        const then = new Date(timestamp);
        const diffMs = now - then;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return then.toLocaleDateString();
    }
    
    showActionMenu(event, beer) {
        // Check if menu is already open for this beer
        const existingMenu = document.querySelector('.action-menu');
        if (existingMenu) {
            const existingBeer = existingMenu.getAttribute('data-beer-key');
            const currentBeerKey = `${beer.brewery}|${beer.beer}`;
            
            // If clicking same row, just close the menu
            if (existingBeer === currentBeerKey) {
                existingMenu.remove();
                return;
            }
            
            // Otherwise remove existing menu to show new one
            existingMenu.remove();
        }
        
        const isAvailable = this.getBeerAvailability(beer);
        const availabilityInfo = this.getBeerAvailabilityInfo(beer);
        
        // Create action menu
        const menu = document.createElement('div');
        menu.className = 'action-menu';
        menu.setAttribute('data-beer-key', `${beer.brewery}|${beer.beer}`);
        
        let statusInfo = '';
        if (availabilityInfo && availabilityInfo.updated_by) {
            const timeAgo = this.formatTimeAgo(availabilityInfo.updated_at);
            const status = availabilityInfo.is_available ? 'available' : 'unavailable';
            statusInfo = `<div class="status-info">Currently marked ${status}<br>by ${availabilityInfo.updated_by} ${timeAgo}</div>`;
        }
        
        menu.innerHTML = `
            <div class="action-item" data-action="untappd">
                📱 View on Untappd
            </div>
            <div class="action-item" data-action="availability">
                ${isAvailable ? '❌ Mark Unavailable' : '✅ Mark Available'}
            </div>
            ${statusInfo}
        `;
        
        // Position menu near click point
        menu.style.left = event.pageX + 'px';
        menu.style.top = event.pageY + 'px';
        
        // Add click handlers
        menu.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = e.target.dataset.action;
            
            if (action === 'untappd') {
                this.openUntappd(beer);
            } else if (action === 'availability') {
                this.toggleBeerAvailability(beer);
            }
            
            menu.remove();
        });
        
        document.body.appendChild(menu);
        
        // Remove menu when clicking elsewhere
        setTimeout(() => {
            document.addEventListener('click', () => {
                if (menu.parentNode) {
                    menu.remove();
                }
            }, { once: true });
        }, 10);
    }
    
    populateFilters() {
        // Clear existing options (keep the "All" option)
        this.elements.barFilter.innerHTML = '<option value="">All Bars</option>';
        this.elements.styleFilter.innerHTML = '<option value="">All Styles</option>';
        
        // Populate bar filter with unique bars
        const bars = [...new Set(this.beers.map(beer => beer.bar))].filter(bar => bar).sort();
        bars.forEach(bar => {
            const option = document.createElement('option');
            option.value = bar;
            option.textContent = bar;
            this.elements.barFilter.appendChild(option);
        });
        
        // Populate style filter with only core beer types
        const styles = [...new Set(this.beers.map(beer => {
            return this.extractCleanBeerStyle(beer.style);
        }))].filter(style => style !== null).sort();
        
        styles.forEach(style => {
            const option = document.createElement('option');
            option.value = style;
            option.textContent = style;
            this.elements.styleFilter.appendChild(option);
        });
        
        // Set ABV range based on actual data
        const abvValues = this.beers.map(beer => beer.abv).filter(abv => abv > 0);
        if (abvValues.length > 0) {
            const minABV = Math.min(...abvValues);
            const maxABV = Math.max(...abvValues);
            
            this.elements.abvMin.min = Math.floor(minABV);
            this.elements.abvMin.max = Math.ceil(maxABV);
            this.elements.abvMin.value = Math.floor(minABV);
            this.elements.abvMinValue.textContent = Math.floor(minABV) + '%';
            
            this.elements.abvMax.min = Math.floor(minABV);
            this.elements.abvMax.max = Math.ceil(maxABV);
            this.elements.abvMax.value = Math.ceil(maxABV);
            this.elements.abvMaxValue.textContent = Math.ceil(maxABV) + '%';
        }
    }
    
    filterBeers() {
        const searchTerm = this.elements.searchInput.value.toLowerCase();
        const selectedBar = this.elements.barFilter.value;
        const selectedStyle = this.elements.styleFilter.value;
        const selectedAvailability = this.elements.availabilityFilter.value;
        const minABV = parseFloat(this.elements.abvMin.value);
        const maxABV = parseFloat(this.elements.abvMax.value);
        
        this.filteredBeers = this.beers.filter(beer => {
            // Search filter - search across multiple fields
            const matchesSearch = !searchTerm || 
                beer.brewery.toLowerCase().includes(searchTerm) ||
                beer.beer.toLowerCase().includes(searchTerm) ||
                beer.style.toLowerCase().includes(searchTerm) ||
                beer.location.toLowerCase().includes(searchTerm);
            
            // Bar filter
            const matchesBar = !selectedBar || beer.bar === selectedBar;
            
            // Style filter
            const matchesStyle = !selectedStyle || 
                this.extractCleanBeerStyle(beer.style).toLowerCase().includes(selectedStyle.toLowerCase()) ||
                beer.style.toLowerCase().includes(selectedStyle.toLowerCase());
            
            // Availability filter
            const isAvailable = this.getBeerAvailability(beer);
            const matchesAvailability = !selectedAvailability || 
                (selectedAvailability === 'available' && isAvailable) ||
                (selectedAvailability === 'unavailable' && !isAvailable);
            
            // ABV filter
            const matchesABV = beer.abv >= minABV && beer.abv <= maxABV;
            
            return matchesSearch && matchesBar && matchesStyle && matchesAvailability && matchesABV;
        });
        
        this.renderTable();
    }
    
    sortTable(column) {
        if (this.currentSort.column === column) {
            this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort.column = column;
            this.currentSort.direction = 'asc';
        }
        
        this.filteredBeers.sort((a, b) => {
            let aVal = a[column];
            let bVal = b[column];
            
            // Handle numeric sorting for ABV
            if (column === 'abv') {
                aVal = parseFloat(aVal) || 0;
                bVal = parseFloat(bVal) || 0;
            } else if (column === 'last_seen') {
                // Sort by timestamp for last seen (available only)
                const aInfo = this.getBeerAvailabilityInfo(a);
                const bInfo = this.getBeerAvailabilityInfo(b);
                aVal = aInfo && aInfo.updated_at && aInfo.is_available ? new Date(aInfo.updated_at).getTime() : 0;
                bVal = bInfo && bInfo.updated_at && bInfo.is_available ? new Date(bInfo.updated_at).getTime() : 0;
            } else {
                aVal = aVal.toString().toLowerCase();
                bVal = bVal.toString().toLowerCase();
            }
            
            let result = 0;
            if (aVal < bVal) result = -1;
            if (aVal > bVal) result = 1;
            
            return this.currentSort.direction === 'desc' ? -result : result;
        });
        
        this.updateSortIndicators();
        this.renderTable();
    }
    
    updateSortIndicators() {
        // Remove all sort indicators
        document.querySelectorAll('th').forEach(th => {
            th.classList.remove('sorted-asc', 'sorted-desc');
        });
        
        // Add current sort indicator
        if (this.currentSort.column) {
            const th = document.querySelector(`th[data-sort="${this.currentSort.column}"]`);
            if (th) {
                th.classList.add(`sorted-${this.currentSort.direction}`);
            }
        }
    }
    
    renderTable() {
        this.elements.tableBody.innerHTML = '';
        
        this.filteredBeers.forEach(beer => {
            const row = document.createElement('tr');
            const isAvailable = this.getBeerAvailability(beer);
            
            // Add availability styling
            if (isAvailable) {
                row.classList.add('beer-available');
            }
            
            const availabilityInfo = this.getBeerAvailabilityInfo(beer);
            const lastSeen = availabilityInfo && availabilityInfo.updated_at && availabilityInfo.is_available ? 
                this.formatTimeAgo(availabilityInfo.updated_at) : 'Never';
            
            row.innerHTML = `
                <td class="last-seen-cell">${lastSeen}</td>
                <td class="brewery-cell">${this.escapeHtml(beer.brewery)}</td>
                <td class="beer-cell">${this.escapeHtml(beer.beer)}</td>
                <td>${this.escapeHtml(beer.style)}</td>
                <td class="abv-cell">${beer.abv > 0 ? beer.abv + '%' : 'N/A'}</td>
                <td>${this.escapeHtml(beer.location)}</td>
                <td class="bar-cell">${this.escapeHtml(beer.bar)}</td>
            `;
            
            // Add click handler to show action menu
            row.addEventListener('click', (e) => {
                this.showActionMenu(e, beer);
            });
            
            this.elements.tableBody.appendChild(row);
        });
        
        const availableCount = this.filteredBeers.filter(beer => this.getBeerAvailability(beer)).length;
        this.elements.resultCount.textContent = `${this.filteredBeers.length} beers shown (${availableCount} available)`;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    openUntappd(beer) {
        // Create search query for Untappd
        const searchQuery = encodeURIComponent(`${beer.brewery} ${beer.beer}`);
        const untappdWebUrl = `https://untappd.com/search?q=${searchQuery}`;
        
        // Always open web version on both mobile and desktop
        window.open(untappdWebUrl, '_blank');
    }
    
    showError() {
        this.elements.loading.classList.add('hidden');
        this.elements.error.classList.remove('hidden');
        this.elements.error.innerHTML = `
            <h3>🍺 Oops, we spilled some beer!</h3>
            <p>Please refresh the page to try again.</p>
        `;
    }
    
    hideLoading() {
        this.elements.loading.classList.add('hidden');
        this.elements.table.classList.remove('hidden');
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new BeerFestivalApp();
});