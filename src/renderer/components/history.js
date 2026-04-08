// ============================================================
// Lịch sử đọc truyện
// ============================================================
(function () {
    'use strict';

    var historyList = [];
    var readerScriptEl = null;

    function cleanupReader() {
        if (readerScriptEl) {
            readerScriptEl.remove();
            readerScriptEl = null;
        }
    }

    function formatTime(ts) {
        const now = Date.now();
        const diff = now - ts;
        const s = Math.floor(diff / 1000);
        if (s < 60) return 'Vừa xong';
        const m = Math.floor(s / 60);
        if (m < 60) return m + ' phút trước';
        const h = Math.floor(m / 60);
        if (h < 24) return h + ' giờ trước';
        const d = Math.floor(h / 24);
        if (d < 30) return d + ' ngày trước';
        const date = new Date(ts);
        return date.toLocaleDateString('vi-VN', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function esc(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function renderHistoryList() {
        const listEl = document.getElementById('historyList');
        const emptyEl = document.getElementById('historyEmpty');
        const loadingEl = document.getElementById('historyLoading');

        loadingEl.style.display = 'none';

        if (!historyList || !historyList.length) {
            listEl.innerHTML = '';
            emptyEl.style.display = 'flex';
            return;
        }

        // Deduplicate by slug — keep only the latest entry per comic
        const seen = new Set();
        const uniqueList = historyList.filter(function (item) {
            if (seen.has(item.slug)) return false;
            seen.add(item.slug);
            return true;
        });

        emptyEl.style.display = 'none';
        listEl.innerHTML = uniqueList.map(function (item) {
            return '<div class="history-item" data-url="' + esc(item.chapterUrl) + '" data-slug="' + esc(item.slug || '') + '">' +
                '<img class="history-cover" src="' + (window.electronAPI.getCachedImageUrl(item.comicCover) || item.comicCover || 'https://via.placeholder.com/80x115/1a1a1a/666?text=?') + '" alt="' + esc(item.comicName || '') + '" onerror="this.src=\'https://via.placeholder.com/80x115/1a1a1a/666?text=?\'">' +
                '<div class="history-info">' +
                '<div class="history-comic-name">' + esc(item.comicName || 'Không rõ') + '</div>' +
                '<div class="history-chapter-title">' + esc(item.chapterTitle || 'Chương') + '</div>' +
                '<div class="history-time">' + formatTime(item.readAt) + '</div>' +
                '</div>' +
                '<div class="history-actions">' +
                '<button class="history-remove-btn" data-url="' + esc(item.chapterUrl) + '" title="Xóa khỏi lịch sử">' +
                '<i class="fas fa-times"></i>' +
                '</button>' +
                '</div>' +
                '</div>';
        }).join('');

        // Click to read
        listEl.querySelectorAll('.history-item').forEach(function (el) {
            el.addEventListener('click', function (e) {
                if (e.target.closest('.history-remove-btn')) return;
                var url = this.dataset.url;
                var slug = this.dataset.slug;
                openComicFromHistory(url, slug);
            });
        });

        // Remove button handlers
        listEl.querySelectorAll('.history-remove-btn').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var url = this.dataset.url;
                removeHistoryItem(url);
            });
        });
    }

    async function openComicFromHistory(chapterUrl, slug) {
        hideHistory();
        cleanupReader();

        // Find comic name from history list
        var entry = historyList.find(function (h) { return h.chapterUrl === chapterUrl || h.slug === slug; });

        if (typeof window.openReader !== 'function') {
            readerScriptEl = document.createElement('script');
            readerScriptEl.src = 'components/reader.js';
            readerScriptEl.onload = function () { console.log('[History] reader.js loaded'); };
            readerScriptEl.onerror = function () { console.error('[History] Failed to load reader.js'); };
            document.head.appendChild(readerScriptEl);

            await new Promise(function (resolve, reject) {
                var timeout = setTimeout(function () { reject(new Error('reader.js load timeout')); }, 5000);
                readerScriptEl.onload = function () { clearTimeout(timeout); resolve(); };
                readerScriptEl.onerror = function () { clearTimeout(timeout); reject(new Error('reader.js failed')); };
            });
        }
        openReader({
            chapterUrl: chapterUrl,
            comicSlug: slug,
            comicName: entry ? entry.comicName : null,
            comicCover: entry ? entry.comicCover : null
        });
    }

    async function loadHistory() {
        var loadingEl = document.getElementById('historyLoading');
        var listEl = document.getElementById('historyList');
        var emptyEl = document.getElementById('historyEmpty');

        loadingEl.style.display = 'flex';
        listEl.innerHTML = '';
        emptyEl.style.display = 'none';

        try {
            var result = await window.electronAPI.getHistory();
            historyList = result || [];
            renderHistoryList();
        } catch (e) {
            console.error('[History] loadHistory error:', e);
            historyList = [];
            renderHistoryList();
        }
    }

    async function removeHistoryItem(chapterUrl) {
        var decoded = decodeURIComponent(chapterUrl);
        var entry = historyList.find(function (h) { return h.chapterUrl === decoded; });
        if (!entry) return;
        var slug = entry.slug;

        var chapterUrlsToRemove = historyList.filter(function (h) { return h.slug === slug; }).map(function (h) { return h.chapterUrl; });

        historyList = historyList.filter(function (h) { return h.slug !== slug; });

        for (var i = 0; i < chapterUrlsToRemove.length; i++) {
            await window.electronAPI.removeHistory(chapterUrlsToRemove[i]);
        }

        renderHistoryList();
    }

    async function clearAllHistory() {
        if (!historyList.length) return;
        if (!confirm('Xóa toàn bộ lịch sử đọc?')) return;
        historyList = [];
        await window.electronAPI.clearHistory();
        renderHistoryList();
    }

    function showHistory() {
        var el = document.getElementById('history-container');
        if (!el) return;
        el.classList.remove('dp-hidden');
        loadHistory();
    }

    function hideHistory() {
        var el = document.getElementById('history-container');
        if (!el) return;
        el.classList.add('dp-hidden');
        cleanupReader();
    }

    // Expose to global
    window.showHistory = showHistory;
    window.hideHistory = hideHistory;
    window.loadHistory = loadHistory;
    window.removeHistoryItem = removeHistoryItem;
    window.clearAllHistory = clearAllHistory;
    window.openComicFromHistory = openComicFromHistory;
})();