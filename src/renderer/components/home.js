// ============================================================
// App State
// ============================================================
let comics = [];
let currentPage = 1;
let isLoading = false;
let isLoadingMore = false;
let hasMorePages = false;
let lastScrollTop = 0;
let isScrollingUp = false;
let totalPagesLoaded = 0;

// Cache for loaded pages (in-memory only, cleared on close)
let loadedPages = {};
let allComics = [];

// Handler references for cleanup
const scrollHandler = handleScroll;
let retryBtnHandler = null;
let homeCleanup = null;

// ============================================================
// Constants - Named magic numbers
// ============================================================
const MAX_COMICS_IN_MEMORY = 500; // Prevent memory leak from infinite scroll
const COMICS_PER_PAGE = 42;      // Used for scroll-position estimation
const INFINITE_SCROLL_THRESHOLD = 500; // px from bottom to trigger load
const SCROLL_DEBOUNCE_MS = 1000;
const LOAD_MORE_DEBOUNCE_MS = 500;

// Config (sẽ được load từ main process)
let BASE_URL = '';

// ============================================================
// Config
// ============================================================
async function loadConfig() {
    try {
        const config = await window.electronAPI.getConfig();
        BASE_URL = config.BASE_URL ;
        console.log('Config loaded:', BASE_URL);
    } catch (error) {
        console.error('Lỗi load config:', error);
    }
}

// ============================================================
// API & Data
// ============================================================
async function loadComics(append = false) {
    console.log('[loadComics] called with append=', append, 'currentPage=', currentPage);

    // Skip if page already cached
    if (loadedPages[currentPage]) {
        console.log(`[loadComics] Page ${currentPage} already cached, skipping...`);
        renderAllPages();
        updateStats();
        updatePagination();
        updateSortDisplay();
        return;
    }

    if (isLoading) {
        console.log('[loadComics] Already loading, skipping...');
        return;
    }
    isLoading = true;
    hideError();

    // Show centered spinner on first load (not cached pages, not append)
    if (!append && !loadedPages[currentPage]) {
        hidePageLoader();
        showPageLoader();
    }

    try {
        const options = {
            page: currentPage,
            sort: currentFilters.sort,
            types: currentFilters.type,
            statuses: currentFilters.status
        };

        console.log(`[loadComics] Scraping page ${currentPage} with options:`, JSON.stringify(options));
        const result = await window.electronAPI.scrapePage(options);
        console.log(`[loadComics] scrapePage result:`, result ? JSON.stringify(result).substring(0, 200) : 'null/undefined');

        if (result.error) {
            // API-level error (network, timeout, etc.)
            throw new Error(result.error);
        }

        if (result.comics && result.comics.length > 0) {
            // Cache the page data
            loadedPages[currentPage] = { comics: [...result.comics], timestamp: Date.now() };

            // Limit memory: only keep last MAX_COMICS_IN_MEMORY entries
            allComics = [...allComics, ...result.comics];
            if (allComics.length > MAX_COMICS_IN_MEMORY) {
                allComics = allComics.slice(-MAX_COMICS_IN_MEMORY);
            }

            totalPagesLoaded = Math.max(totalPagesLoaded, currentPage);

            // Assume there are more pages if we got comics
            hasMorePages = true;
            console.log(`[loadComics] Page ${currentPage}: ${result.comics.length} comics loaded | Total: ${allComics.length}`);

            // For infinite scroll / adjacent page: append new comics instead of re-rendering everything
            if (append) {
                const container = document.getElementById('comicList');
                const newHtml = result.comics.map(comic => createComicCard(comic)).join('');
                container.insertAdjacentHTML('beforeend', newHtml);
                hidePageLoader();
            } else {
                // Full re-render for page navigation
                renderAllPages();
            }
        } else {
            // No comics returned - this is the last page
            hasMorePages = false;
            console.log(`[loadComics] Page ${currentPage}: No comics returned`);
            renderAllPages();
        }

        updateStats();
        updatePagination();
        updateSortDisplay();

    } catch (error) {
        console.error('[loadComics] Lỗi scrape:', error);
        hasMorePages = false;
        hidePageLoader();
        showError(error.message || 'Không thể tải dữ liệu. Vui lòng kiểm tra kết nối mạng.');
        updatePagination();
    } finally {
        isLoading = false;
        isLoadingMore = false;
        const indicator = document.getElementById('loadMoreIndicator');
        if (indicator) indicator.style.display = 'none';
    }
}

// ============================================================
// Load More / Prev
// ============================================================
async function loadMore() {
    // Prevent duplicate calls
    if (isLoading || isLoadingMore) {
        console.log('Already loading, skipping...');
        return;
    }

    // Skip if next page already cached
    if (loadedPages[currentPage + 1]) {
        console.log('Next page already cached, skipping...');
        return;
    }

    isLoadingMore = true;
    currentPage++;
    scrollHandlerActive = false; // Prevent multiple triggers

    document.getElementById('loadMoreIndicator').style.display = 'flex';
    console.log('Loading more pages, currentPage:', currentPage);
    await loadComics(true);
    setTimeout(() => { scrollHandlerActive = true; }, LOAD_MORE_DEBOUNCE_MS); // Re-enable after debounce
}

async function loadPrevPage() {
    if (isLoading || currentPage <= 1) return;

    currentPage--;
    isLoadingMore = true;

    if (loadedPages[currentPage]) {
        // Page already cached, just show it
        renderAllPages();
        updatePagination();
        isLoadingMore = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        // Need to load this page
        document.getElementById('loadMoreIndicator').style.display = 'flex';
        await loadComics();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// ============================================================
// Navigation
// ============================================================
async function goToPage(page) {
    const pageNum = parseInt(page);
    if (pageNum < 1) return;
    if (pageNum === currentPage) return;

    allComics = [];
    loadedPages = {};
    totalPagesLoaded = 0;
    currentPage = pageNum;
    await loadComics();
    scrollToPagePosition(currentPage);
}

async function prevPage() {
    if (currentPage <= 1) return;
    if (isLoading) return;

    const targetPage = currentPage - 1;
    if (loadedPages[targetPage]) {
        currentPage = targetPage;
        updatePagination();
        scrollToPagePosition(currentPage);
    }
}

async function nextPage() {
    if (isLoading) return;

    const targetPage = currentPage + 1;
    if (loadedPages[targetPage]) {
        currentPage = targetPage;
        updatePagination();
        scrollToPagePosition(currentPage);
    } else {
        isLoadingMore = true;
        document.getElementById('loadMoreIndicator').style.display = 'flex';
        currentPage = targetPage;
        await loadComics(true);
        scrollToPagePosition(currentPage);
    }
}

// ============================================================
// Refresh
// ============================================================
async function refreshPage() {
    console.log('Refreshing page', currentPage);

    // Clear all state
    clearPageCache();
    currentPage = 1;
    totalPagesLoaded = 0;
    hasMorePages = false;
    isLoadingMore = false;
    scrollHandlerActive = true;

    // Clear DOM
    document.getElementById('comicList').innerHTML = '';
    updatePagination();

    await loadComics();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// Scroll - Infinite scroll
// ============================================================
let lastScrollY = 0;
let scrollHandlerActive = true;

function handleScroll() {
    const scrollTop = window.scrollY;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = window.innerHeight;
    const scrollPosition = scrollTop + clientHeight;

    // Update page indicator when scrolling down past first viewport
    const indicator = document.getElementById('currentPageIndicator');
    if (scrollTop > clientHeight * 0.5) {
        indicator.style.display = 'block';
        document.getElementById('currentPageText').textContent = `Trang ${currentPage}`;
    } else {
        indicator.style.display = 'none';
    }

    if (!scrollHandlerActive) {
        return;
    }

    // Load more when near bottom (within threshold px)
    if (scrollHeight - scrollPosition < INFINITE_SCROLL_THRESHOLD) {
        console.log('Near bottom, calling loadMore...');
        scrollHandlerActive = false;
        loadMore();
        setTimeout(() => { scrollHandlerActive = true; }, SCROLL_DEBOUNCE_MS);
    }
}

function scrollToPagePosition(pageNum) {
    const container = document.getElementById('comicList');
    const cards = container.querySelectorAll('.comic-card');
    const comicsPerRow = getComicsPerRow();
    const startIndex = (pageNum - 1) * COMICS_PER_PAGE;

    if (cards.length > 0) {
        const cardHeight = cards[0].offsetHeight + 16;
        const scrollTo = Math.max(0, (startIndex / comicsPerRow) * cardHeight - 100);
        window.scrollTo({ top: scrollTo, behavior: 'smooth' });
    }
}

function getComicsPerRow() {
    const containerWidth = document.getElementById('comicList').offsetWidth;
    const cardMinWidth = 166;
    return Math.max(1, Math.floor(containerWidth / cardMinWidth));
}

// ============================================================
// Render
// ============================================================
function showPageLoader() {
    const el = document.getElementById('pageLoader');
    if (el) el.style.display = 'flex';
}

function hidePageLoader() {
    const el = document.getElementById('pageLoader');
    if (el) el.style.display = 'none';
}

function showError(message) {
    const el = document.getElementById('pageError');
    const msgEl = document.getElementById('pageErrorMsg');
    if (el) el.style.display = 'flex';
    if (msgEl) msgEl.textContent = message;
}

function hideError() {
    const el = document.getElementById('pageError');
    if (el) el.style.display = 'none';
}

function createComicCard(comic) {
    const imgSrc = window.electronAPI.getCachedImageUrl(comic.cover)
        || comic.cover
        || 'https://via.placeholder.com/300x400/1a1a1a/666?text=No+Image';
    return `
    <div class="comic-card" onclick="openComic('${comic.slug}')">
        <div class="comic-cover">
            <img src="${imgSrc}"
                 alt="${comic.name}"
                 loading="lazy"
                 onerror="this.src='https://via.placeholder.com/300x400/1a1a1a/666?text=No+Image'">
            <div class="tooltip">
                <div class="stats">
                    <span><i class="fas fa-eye"></i> ${formatNumber(comic.views)}</span>
                    <span><i class="fas fa-heart"></i> ${formatNumber(comic.likes)}</span>
                </div>
            </div>
        </div>
        <div class="comic-info">
            <div class="comic-title" title="${comic.name}">${comic.name}</div>
            <div class="comic-meta">
                ${(comic.latestChapter?.title || 'N/A').replace(/^Chương\s*\d+[\s.-]*/i, 'Ch.')}
            </div>
        </div>
    </div>
    `;
}

function renderComics(comicsToRender, append = false, prepend = false) {
    hidePageLoader();
    const container = document.getElementById('comicList');

    if (comicsToRender.length === 0) {
        container.innerHTML = '<div class="loading"><i class="fas fa-folder-open"></i><span>Không tìm thấy truyện nào</span></div>';
        return;
    }

    const html = comicsToRender.map(comic => createComicCard(comic)).join('');

    if (prepend) {
        container.insertAdjacentHTML('afterbegin', html);
    } else if (append) {
        container.insertAdjacentHTML('beforeend', html);
    } else {
        container.innerHTML = html;
    }
}

function renderAllPages() {
    hidePageLoader();
    const container = document.getElementById('comicList');

    // Only render comics up to current page
    let html = '';
    for (let p = 1; p <= currentPage; p++) {
        if (loadedPages[p]) {
            html += loadedPages[p].comics.map(comic => createComicCard(comic)).join('');
        }
    }
    container.innerHTML = html || '<div class="loading"><i class="fas fa-folder-open"></i><span>Không tìm thấy truyện nào</span></div>';
    hidePageLoader();
}

function updateStats() {
    const totalLoaded = Object.keys(loadedPages).length;
    const statsText = totalLoaded > 1
        ? `${allComics.length} truyện (${totalLoaded} trang)`
        : `${allComics.length} truyện`;
    document.getElementById('stats').textContent = statsText;
}

function updatePagination() {
    document.getElementById('pageInput').value = currentPage;
    document.getElementById('prevBtn').disabled = currentPage <= 1;
    // Always allow next page - we'll find out if there are more when we load
    document.getElementById('nextBtn').disabled = !hasMorePages && totalPagesLoaded > 0;
}

// ============================================================
// Comic Actions
// ============================================================
function openComic(slug) {
    openDetail(slug);
}

// ============================================================
// TTS Test
// ============================================================
function showTTSTest() {
    document.getElementById('ttsTestSection').classList.toggle('hidden');
}

function testTTS() {
    const text = document.getElementById('ttsTestInput').value.trim();
    if (!text) {
        document.getElementById('ttsTestStatus').textContent = 'Nhập text trước!';
        return;
    }
    if (!window.TTS || typeof window.TTS.testTTSAPI === 'undefined') {
        document.getElementById('ttsTestStatus').textContent = 'TTS chưa load xong!';
        return;
    }
    document.getElementById('ttsTestStatus').textContent = 'Đang gọi API...';
    window.TTS.testTTSAPI(text, 'vi').then(result => {
        if (result.success) {
            document.getElementById('ttsTestStatus').textContent = 'Phát thành công!';
        } else {
            document.getElementById('ttsTestStatus').textContent = 'Lỗi: ' + result.error;
        }
    });
}

// ============================================================
// Cache
// ============================================================
function clearPageCache() {
    loadedPages = {};
    allComics = [];
}

// ============================================================
// Init
// ============================================================
async function initHome() {
    console.log('[Home] initHome started');

    // Check if required elements exist
    const comicList = document.getElementById('comicList');
    if (!comicList) {
        console.error('[Home] ERROR: comicList element not found!');
        document.getElementById('home-container').innerHTML =
            '<div style="color:#ef4444;padding:40px;text-align:center;">Lỗi: Không tìm thấy phần tử comicList</div>';
        return;
    }
    console.log('[Home] comicList element found');

    // Check if navbar is loaded
    const navbar = document.getElementById('navbar-container');
    if (!navbar || !navbar.innerHTML.trim()) {
        console.warn('[Home] WARNING: navbar may not be loaded yet');
    } else {
        console.log('[Home] navbar loaded OK');
    }

    // Check if window.electronAPI exists
    if (typeof window.electronAPI === 'undefined') {
        console.error('[Home] ERROR: window.electronAPI is undefined!');
        comicList.innerHTML = '<div style="color:#ef4444;padding:40px;text-align:center;">Lỗi: electronAPI không khả dụng</div>';
        return;
    }
    console.log('[Home] electronAPI available');

    try {
        await window.electronAPI.getCachedImageMap();
        console.log('[Home] getCachedImageMap done');
    } catch (e) {
        console.error('[Home] getCachedImageMap error:', e);
    }

    try {
        await loadConfig();
        console.log('[Home] loadConfig done, BASE_URL:', BASE_URL);
    } catch (e) {
        console.error('[Home] loadConfig error:', e);
    }

    // Show loading state
    const pageLoader = document.getElementById('pageLoader');
    if (pageLoader) {
        console.log('[Home] pageLoader visible');
        pageLoader.style.display = 'flex';
    } else {
        console.warn('[Home] pageLoader not found');
    }

    loadComics();
    console.log('[Home] loadComics called');

    window.addEventListener('scroll', scrollHandler, { passive: true });
    homeCleanup = () => window.removeEventListener('scroll', scrollHandler);

    const retryBtn = document.getElementById('retryBtn');
    if (retryBtn) {
        if (retryBtnHandler) retryBtn.removeEventListener('click', retryBtnHandler);
        retryBtnHandler = () => {
            console.log('[Home] Retry clicked');
            clearPageCache();
            currentPage = 1;
            totalPagesLoaded = 0;
            hasMorePages = false;
            comicList.innerHTML = '';
            loadComics();
        };
        retryBtn.addEventListener('click', retryBtnHandler);
        console.log('[Home] retryBtn event listener added');
    } else {
        console.warn('[Home] retryBtn not found');
    }

    console.log('[Home] initHome completed');
}

window.destroyHome = () => {
    if (homeCleanup) homeCleanup();
    const retryBtn = document.getElementById('retryBtn');
    if (retryBtn && retryBtnHandler) {
        retryBtn.removeEventListener('click', retryBtnHandler);
        retryBtnHandler = null;
    }
    homeCleanup = null;
};
