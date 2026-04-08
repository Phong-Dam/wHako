// ============================================================
// Detail Page
// ============================================================

// ============================================================
// Init
// ============================================================
function initDetail() {
    injectComponents();
}

// ============================================================
// Build UI (called once on startup)
// ============================================================
function injectComponents() {
    const dp = document.getElementById('detailPage');
    dp.innerHTML = `
        <div class="dp-topbar">
            <div class="dp-topbar-inner">
                <button class="dp-back-btn" data-action="close">
                    <i class="fas fa-arrow-left"></i>
                    <span>Quay lại danh sách</span>
                </button>
            </div>
        </div>

        <!-- Skeleton (shown while loading) -->
        <div id="detailSkeleton" class="dp-skeleton dp-hidden">
            <div class="dp-skel-row">
                <div class="dp-skel-cover"></div>
                <div class="dp-skel-right">
                    <div class="dp-skel-title"></div>
                    <div class="dp-skel-meta"></div>
                    <div class="dp-skel-meta" style="width:120px"></div>
                    <div class="dp-skel-tags"></div>
                </div>
            </div>
            <div class="dp-skel-summary"></div>
            <div class="dp-skel-vol"></div>
            <div class="dp-skel-vol"></div>
        </div>

        <!-- Real content (hidden until loaded) -->
        <div id="detailContent" class="dp-content dp-hidden">
            <!-- Header -->
            <div class="dp-header">
                <div class="dp-header-bg" id="detailCoverBg"></div>
                <div class="dp-header-inner">
                    <img id="detailCover" src="" alt="" class="dp-cover">
                    <div class="dp-info">
                        <h1 id="detailTitle" class="dp-title"></h1>
                        <div id="detailMeta" class="dp-meta"></div>
                        <div id="detailGenres" class="dp-genres"></div>
                    </div>
                </div>
            </div>

            <!-- Summary -->
            <div class="dp-section">
                <div class="dp-section-label">Tóm tắt</div>
                <div id="detailSummary" class="dp-summary"></div>
            </div>

            <!-- Volumes -->
            <div id="detailVolumes" class="dp-volumes"></div>
        </div>
    `;
}

// ============================================================
// State
// ============================================================
let currentDetail = null;
let isDetailLoading = false;
let openVolumes = new Set();
let savedScrollY = 0;
let readerScriptEl = null;  // Track dynamic reader.js script tag

// Cleanup reader.js script tag to prevent DOM accumulation
function cleanupReader() {
    if (readerScriptEl) {
        readerScriptEl.remove();
        readerScriptEl = null;
    }
}

// ============================================================
// Open / Close
// ============================================================
async function openDetail(slug, pendingChapterUrl) {
    if (isDetailLoading) return;
    isDetailLoading = true;
    // Lưu scroll position của trang chính
    savedScrollY = window.scrollY || document.documentElement.scrollTop;

    document.getElementById('comicMain').style.display = 'none';
    document.getElementById('loadMoreIndicator').style.display = 'none';
    document.querySelector('.pagination').style.display = 'none';
    document.getElementById('stats').closest('div').style.display = 'none';
    document.getElementById('currentPageIndicator').style.display = 'none';

    const dp = document.getElementById('detailPage');
    dp.classList.remove('hidden');
    dp.classList.add('detail-scroll');
    dp.scrollTop = 0;
    document.getElementById('detail-container').classList.add('detail-active');
    document.getElementById('detail-container').style.display = 'block';

    // Event delegation for detail page clicks
    dp.onclick = async function(e) {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        const action = el.dataset.action;
        if (action === 'close')               closeDetail();
        else if (action === 'toggle-volume')  toggleVolume(el.dataset.id);
        else if (action === 'open-chapter') { e.preventDefault(); await openChapter(el.dataset.url); }
    };

    document.getElementById('detailSkeleton').classList.remove('dp-hidden');
    document.getElementById('detailContent').classList.add('dp-hidden');

    try {
        const detail = await window.electronAPI.scrapeDetail({ slug });

        if (detail && !detail.error) {
            currentDetail = detail;
            openVolumes.clear();
            renderDetail(detail);
            document.getElementById('detailSkeleton').classList.add('dp-hidden');
            document.getElementById('detailContent').classList.remove('dp-hidden');

            // If opened from history, auto-open the chapter reader
            if (pendingChapterUrl) {
                openChapter(pendingChapterUrl);
            }
        } else {
            document.getElementById('detailSkeleton').classList.add('dp-hidden');
            document.getElementById('detailContent').classList.remove('dp-hidden');
            document.getElementById('detailSummary').innerHTML =
                `<p class="dp-summary-error">${escHtml('Không thể tải: ' + (detail?.error || 'Lỗi không xác định'))}</p>`;
        }
    } catch (err) {
        document.getElementById('detailSkeleton').classList.add('dp-hidden');
        document.getElementById('detailContent').classList.remove('dp-hidden');
        document.getElementById('detailSummary').innerHTML =
            `<p class="dp-summary-error">${escHtml('Lỗi: ' + err.message)}</p>`;
    } finally {
        isDetailLoading = false;
    }
}

function closeDetail() {
    const dp = document.getElementById('detailPage');
    dp.classList.add('hidden');
    dp.classList.remove('detail-scroll');
    dp.onclick = null;
    document.getElementById('detail-container').classList.remove('detail-active');
    document.getElementById('detail-container').style.display = 'none';
    document.getElementById('comicMain').style.display = '';
    document.getElementById('loadMoreIndicator').style.display = '';
    document.querySelector('.pagination').style.display = '';
    document.getElementById('stats').closest('div').style.display = '';
    document.getElementById('currentPageIndicator').style.display = '';
    currentDetail = null;
    openVolumes.clear();
    window.scrollTo({ top: savedScrollY, behavior: 'instant' });
    cleanupReader();
}

// ============================================================
// Open Reader (new window)
// ============================================================
async function openChapter(url) {
    // Lazy load reader.js if not already loaded
    console.log('[Detail] openChapter called', { url, hasCurrentDetail: !!currentDetail, detailName: currentDetail?.name });
    if (typeof window.openReader !== 'function') {
        // Remove any previous reader script tag first
        cleanupReader();

        readerScriptEl = document.createElement('script');
        readerScriptEl.src = 'components/reader.js';
        readerScriptEl.onload = () => { console.log('[Detail] reader.js loaded'); };
        readerScriptEl.onerror = () => { console.error('[Detail] Failed to load reader.js'); };
        document.head.appendChild(readerScriptEl);

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => { reject(new Error('reader.js load timeout')); }, 5000);
            readerScriptEl.onload = () => { clearTimeout(timeout); resolve(); };
            readerScriptEl.onerror = () => { clearTimeout(timeout); reject(new Error('reader.js failed')); };
        });
    }

    if (currentDetail) {
        openReader({
            chapterUrl: url,
            comicSlug: currentDetail.slug,
            comicName: currentDetail.name,
            comicCover: currentDetail.cover,
        });
    } else {
        openReader({ chapterUrl: url });
    }
}

// ============================================================
// Render
// ============================================================
function renderDetail(detail) {
    currentDetail = detail;
    const coverSrc = window.electronAPI.getCachedImageUrl(detail.cover) || detail.cover;
    document.getElementById('detailCover').src = coverSrc;
    document.getElementById('detailCover').onerror = function () {
        this.src = detail.cover || 'https://via.placeholder.com/150x215/1a1a1a/666?text=No+Image';
    };
    document.getElementById('detailCoverBg').style.backgroundImage = `url('${coverSrc}')`;

    document.getElementById('detailTitle').textContent = detail.name;

    const metaEl = document.getElementById('detailMeta');
    const items = [];
    if (detail.author)  items.push(`<span class="dp-meta-item"><i class="fas fa-pen"></i> ${escHtml(detail.author)}</span>`);
    if (detail.artist)  items.push(`<span class="dp-meta-item"><i class="fas fa-palette"></i> ${escHtml(detail.artist)}</span>`);
    if (detail.status)  items.push(`<span class="dp-meta-item"><i class="fas fa-circle-notch"></i> ${escHtml(detail.status)}</span>`);
    const total = (detail.volumes || []).reduce((s, v) => s + (v.chapters || []).length, 0);
    if (total > 0)      items.push(`<span class="dp-meta-item"><i class="fas fa-list"></i> ${total} chương</span>`);
    metaEl.innerHTML = items.join('');

    const genresEl = document.getElementById('detailGenres');
    genresEl.innerHTML = (detail.genres || []).map(g => `<span class="dp-genre-tag">${escHtml(g.title || g)}</span>`).join('');

    const descEl = document.getElementById('detailSummary');
    if (detail.description && detail.description.trim()) {
        descEl.innerHTML = detail.description;
    } else {
        descEl.innerHTML = '<p class="dp-summary-empty">Không có tóm tắt.</p>';
    }

    const volumesEl = document.getElementById('detailVolumes');
    if (!detail.volumes || detail.volumes.length === 0) {
        volumesEl.innerHTML = '<div class="dp-vol-empty"><i class="fas fa-folder-open"></i><span>Không có danh sách chương</span></div>';
        return;
    }

    volumesEl.innerHTML = detail.volumes.map((vol, vi) => {
        const id = `vol-${vi}`;
        const open = openVolumes.has(id);
        return `
        <div class="dp-vol ${open ? 'dp-vol--open' : ''}" id="${id}">
            <div class="dp-vol-header" data-action="toggle-volume" data-id="${id}">
                ${vol.cover
                    ? `<img src="${window.electronAPI.getCachedImageUrl(vol.cover) || vol.cover}" class="dp-vol-cover" alt="" onerror="this.style.display='none'">`
                    : `<div class="dp-vol-cover" style="background:#1e1e1e"></div>`}
                <div class="dp-vol-info">
                    <div class="dp-vol-title">${escHtml(vol.title || ('Tập ' + (vi + 1)))}</div>
                    <div class="dp-vol-sub">${vol.chapters.length} chương${vol.time ? ' · ' + escHtml(vol.time) : ''}</div>
                </div>
                <i class="fas fa-chevron-down dp-vol-arrow"></i>
            </div>
            <div class="dp-vol-chapters">
                ${(vol.chapters || []).map(ch => `
                <div class="dp-ch" data-action="open-chapter" data-url="${ch.url}">
                    <span class="dp-ch-title">${escHtml(ch.title || 'Chương')}</span>
                    ${ch.hasImage ? '<i class="fas fa-image dp-ch-badge"></i>' : ''}
                </div>
                `).join('')}
            </div>
        </div>`;
    }).join('');
}

function toggleVolume(id) {
    const el = document.getElementById(id);
    if (openVolumes.has(id)) {
        openVolumes.delete(id);
        el.classList.remove('dp-vol--open');
    } else {
        openVolumes.add(id);
        el.classList.add('dp-vol--open');
    }
}
