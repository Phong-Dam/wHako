// ============================================================
// Reader — Inline reader overlay
// State is global but scoped to this module (IIFE)
// ============================================================
(function () {
    'use strict';

    // ---- State ----
    let currentChapter = null;
    let currentComic   = null;
    let readerReady    = false;
    let eventsBound    = false;   // true after one-time event bindings

    // ============================================================
    // One-time event bindings (shared by inline reader & standalone)
    // ============================================================
    function bindEvents() {
        if (eventsBound) return;
        eventsBound = true;

        // Back button
        document.getElementById('rdBackBtn').onclick = () => {
            const isStandalone = !!new URLSearchParams(window.location.search).get('url');
            if (isStandalone) {
                window.close();
            } else {
                closeReader();
            }
        };

        // Detail back button - go back to detail page
        document.getElementById('rdDetailBackBtn').onclick = () => {
            if (currentComic?.slug && typeof window.openDetail === 'function') {
                closeReader();
                window.openDetail(currentComic.slug);
            }
        };

        // Chapter navigation
        document.getElementById('rdPrevBtn').onclick = () => navigateChapter('prev');
        document.getElementById('rdNextBtn').onclick = () => navigateChapter('next');

        // TTS button — uses the floating tts-panel from TTS module
        // rdTtsPlay/rdTtsStop/rdTtsBtn are gone, using tts.js panel instead
    }

    // ============================================================
    // Open / Close
    // ============================================================
    window.openReader = async function (options = {}) {
        const { chapterUrl, comicName, comicCover, comicSlug } = options;
        console.log('[Reader] openReader called', { chapterUrl, comicName, comicCover, comicSlug });
        if (!chapterUrl) return;

        // First open: bind events once, init TTS
        if (!eventsBound) {
            bindEvents();
            initTTS();
        }

        currentComic = { slug: comicSlug, name: comicName, cover: comicCover };
        readerReady  = true;

        const container = document.getElementById('reader-container');
        container.style.display = 'block';
        container.scrollTop = 0;  // reset scroll

        // Show TTS FAB when reader opens
        showReaderTTS();

        if (comicName) {
            document.getElementById('rdComicName').textContent = comicName;
        }

        await fetchChapter(chapterUrl);
    };

    window.closeReader = function () {
        if (window.TTS) window.TTS.stop();
        document.getElementById('reader-container').style.display = 'none';
        // Hide the floating TTS FAB and Filter FAB
        const fab = document.getElementById('ttsFab');
        const panel = document.querySelector('.tts-panel');
        const filterFab = document.getElementById('filterFab');
        const filterPanel = document.getElementById('filterPanel');
        if (fab) fab.style.display = 'none';
        if (filterFab) filterFab.style.display = 'none';
        if (panel) panel.classList.remove('open');
        if (filterPanel) filterPanel.classList.remove('open');
        currentChapter = null;
        readerReady    = false;
    };

    window.showReaderTTS = function () {
        // Show the floating TTS FAB and Filter FAB when reader opens
        var fab = document.getElementById('ttsFab');
        var panel = document.querySelector('.tts-panel');
        var filterFab = document.getElementById('filterFab');
        if (fab) fab.style.display = '';
        if (filterFab) filterFab.style.display = 'block';
        if (panel) panel.classList.remove('open');
    };

    // Alias for detail/history
    window.initReader = window.openReader;

    // ============================================================
    // TTS
    // ============================================================
    function initTTS() {
        if (typeof window.TTS === 'undefined') return;
        window.TTS.init();

        window.TTS.setNavCallback((direction) => {
            if (window.TTS) window.TTS.stop();
            navigateChapter(direction);
        });
    }

    // ============================================================
    // Fetch Chapter
    // ============================================================
    async function fetchChapter(url) {
        const loading = document.getElementById('rdLoading');
        const content = document.getElementById('rdContent');
        const error   = document.getElementById('rdError');
        const nav     = document.getElementById('rdNav');

        if (!loading) return;

        loading.style.display = 'flex';
        if (content) content.classList.add('dp-hidden');
        if (error)   error.classList.add('dp-hidden');
        if (nav)     nav.style.display = 'none';

        if (window.TTS) window.TTS.stop();

        try {
            const chapter = await window.electronAPI.scrapeChapter({ url });

            if (!chapter || chapter.error) {
                if (error) {
                    const errText = document.getElementById('rdErrorText');
                    if (errText) errText.textContent =
                        `Lỗi: ${escHtml(chapter?.error || 'Không thể tải chương này.')}`;
                    error.classList.remove('dp-hidden');
                }
                if (loading) loading.style.display = 'none';
                return;
            }

            currentChapter = chapter;
            renderChapter(chapter);

            if (currentComic?.name && chapter.chapterTitle) {
                console.log('[Reader] Adding history:', {
                    slug: currentComic.slug,
                    comicName: currentComic.name,
                    chapterTitle: chapter.chapterTitle,
                    chapterUrl: url,
                    hasNext: !!chapter.nextUrl,
                    hasPrev: !!chapter.prevUrl
                });
                window.electronAPI.addHistory({
                    slug:        currentComic.slug,
                    comicName:   currentComic.name,
                    comicCover:  currentComic.cover,
                    chapterTitle: chapter.chapterTitle,
                    chapterUrl:  url,
                    volumeTitle: chapter.volumeTitle || '',
                }).then(() => console.log('[Reader] addHistory done')).catch((e) => console.error('[Reader] addHistory error:', e));
            } else {
                console.log('[Reader] Skipping history - missing comic:', currentComic, 'or chapter:', chapter.chapterTitle);
            }

            if (loading) loading.style.display = 'none';
            if (content) content.classList.remove('dp-hidden');
            if (nav)     nav.style.display = 'flex';

        } catch (err) {
            if (error) {
                const errText = document.getElementById('rdErrorText');
                if (errText) errText.textContent = `Lỗi kết nối: ${escHtml(err.message)}`;
                error.classList.remove('dp-hidden');
            }
            if (loading) loading.style.display = 'none';
        }
    }

    // ============================================================
    // Render Chapter
    // ============================================================
    function renderChapter(chapter) {
        const chapterNameEl = document.getElementById('rdChapterName');
        const volTitleEl   = document.getElementById('rdVolTitle');
        const chTitleEl    = document.getElementById('rdChTitle');
        const textEl       = document.getElementById('rdText');
        const imagesEl     = document.getElementById('rdImages');

        if (chapterNameEl) chapterNameEl.textContent = chapter.chapterTitle || 'Chương';
        if (volTitleEl)   volTitleEl.textContent   = chapter.volumeTitle || '';
        if (chTitleEl)    chTitleEl.textContent    = chapter.chapterTitle || '';
        if (textEl)       textEl.innerHTML         = '';
        if (imagesEl)     imagesEl.innerHTML       = '';

        if (chapter.content) {
            const div = document.createElement('div');
            div.className = 'rd-text';
            chapter.content.split('\n\n').forEach(p => {
                if (p.trim()) {
                    const pp = document.createElement('p');
                    pp.textContent = p;
                    div.appendChild(pp);
                }
            });
            if (textEl) textEl.appendChild(div);

            // Auto-play TTS with new chapter content if not already playing
            if (window.TTS && !window.TTS.isPlaying() && chapter.content?.trim()) {
                window.TTS.onChapterLoaded();
                window.TTS.play((direction) => {
                    if (direction === 'next' && currentChapter?.nextUrl) {
                        navigateChapter('next');
                    } else if (direction === 'prev' && currentChapter?.prevUrl) {
                        navigateChapter('prev');
                    }
                });
            }
        }

        if (chapter.images) {
            chapter.images.forEach((src, i) => {
                const img = document.createElement('img');
                img.src    = src;
                img.alt    = `Trang ${i + 1}`;
                img.loading = 'lazy';
                img.onerror = () => img.parentElement && img.parentElement.removeChild(img);
                if (imagesEl) imagesEl.appendChild(img);
            });
        }

        const prevBtn = document.getElementById('rdPrevBtn');
        const nextBtn = document.getElementById('rdNextBtn');
        if (prevBtn) prevBtn.disabled = !chapter.prevUrl;
        if (nextBtn) nextBtn.disabled = !chapter.nextUrl;
    }

    // ============================================================
    // Navigate
    // ============================================================
    function navigateChapter(direction) {
        const url = direction === 'prev'
            ? currentChapter?.prevUrl
            : currentChapter?.nextUrl;
        console.log('[Reader] navigateChapter:', direction, { url, prevUrl: currentChapter?.prevUrl, nextUrl: currentChapter?.nextUrl });
        if (url) {
            if (window.TTS) {
                window.TTS.stop();
                window.TTS.setJustNavigated();
            }
            document.getElementById('reader-container').scrollTop = 0;
            fetchChapter(url);
        }
    }

    // ============================================================
    // Standalone reader window (has URL params) — auto-init
    // ============================================================
    window.addEventListener('DOMContentLoaded', () => {
        const params     = new URLSearchParams(window.location.search);
        const chapterUrl = params.get('url');

        if (!chapterUrl) return;   // not a standalone reader window

        bindEvents();
        initTTS();

        const comicSlug  = params.get('slug');
        const comicName  = params.get('name');
        const comicCover = params.get('cover');
        currentComic = { slug: comicSlug, name: comicName, cover: comicCover };

        document.getElementById('rdComicName').textContent = comicName || '';

        fetchChapter(chapterUrl);
    });
})();
