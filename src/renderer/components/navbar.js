// ============================================================
// Filter State
// ============================================================
let currentFilters = {
    type: ['truyendich'],
    status: ['dangtienhanh'],
    sort: 'top'
};

// ============================================================
// Sidebar
// ============================================================
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('active');
    document.getElementById('sidebarOverlay').classList.toggle('active');
}

// ============================================================
// Filters
// ============================================================
function updateSortDisplay() {
    const sortLabels = {
        'top': 'Top toàn thời gian',
        'topthang': 'Top tháng',
        'capnhat': 'Mới cập nhật',
        'truyenmoi': 'Truyện mới',
        'theodoi': 'Theo dõi',
        'sotu': 'Số từ',
        'tentruyen': 'A - Z',
        'tentruyenza': 'Z - A'
    };
    document.getElementById('currentSort').textContent = sortLabels[currentFilters.sort] || '';
}

// ============================================================
// Init
// ============================================================
async function initNavbar() {
    initEventListeners();
    syncSortRadio();
}

// ============================================================
// Sync sort radio to currentFilters
// ============================================================
function syncSortRadio() {
    document.querySelectorAll('input[name="sortRadio"]').forEach(radio => {
        radio.checked = radio.value === currentFilters.sort;
    });
}

// ============================================================
// Event Listeners
// ============================================================
function initEventListeners() {
    // Filter tags
    document.querySelectorAll('.filter-tag[data-filter]').forEach(btn => {
        btn.addEventListener('click', function() {
            const filterType = this.dataset.filter;
            const filterValue = this.dataset.value;

            const index = currentFilters[filterType].indexOf(filterValue);
            if (index > -1) {
                currentFilters[filterType].splice(index, 1);
                this.classList.remove('active');
            } else {
                currentFilters[filterType].push(filterValue);
                this.classList.add('active');
            }

            if (currentFilters[filterType].length === 0) {
                currentFilters[filterType].push(filterValue);
                this.classList.add('active');
            }

            currentPage = 1;
            clearPageCache();
            loadComics();
        });
    });

    // Sort radio buttons
    document.querySelectorAll('input[name="sortRadio"]').forEach(radio => {
        radio.addEventListener('change', function() {
            currentFilters.sort = this.value;
            syncSortRadio();
            currentPage = 1;
            clearPageCache();
            loadComics();
        });
    });
}
