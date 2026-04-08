(function () {
    'use strict';

    let isPlaying = false;
    let isPaused = false;
    let isJumpInProgress = false;
    let audioCtx = null;
    let gainNode = null;
    let currentSource = null;
    let currentSentences = [];
    let queuedParagraphs = [];
    let currentIndex = 0;
    let errorCount = 0;
    const MAX_ERRORS = 3;
    let lastPlayedIndex = -1;

    let rawText = '';
    let chunkOffsets = [];
    let currentHighlightEl = null;

    let onChapterEnd = null;
    let isAutoNextDone = false;
    let justNavigated = false;

    const TTS_LANG = 'vi';
    const PREFETCH_COUNT = 6;
    const TTS_CHUNK_SIZE = 3800;
    const MIN_AUDIO_LENGTH = 200;
    const AUDIO_TIMEOUT_MS = 30000;
    const RETRY_DELAY_MS = 500;
    
    let audioCache = new Map();
    let prefetchQueue = [];
    let isPrefetching = false;
    let isPlayNextRunning = false;
    
    let playbackToken = 0; 

    let settings = {
        rate: 1.0,
        pitch: 1.0,
        autoNext: false,
        autoScroll: true,
        readChapterTitle: false,
    };

    let filterPatterns = [];
    let panelClickHandler = null;
    let ttsFabClickHandler = null;

    function loadFilterPatterns() {
        try {
            const saved = localStorage.getItem('whako_tts_filters');
            if (saved) filterPatterns = JSON.parse(saved);
        } catch (e) { filterPatterns = []; }
    }

    function saveFilterPatterns() {
        localStorage.setItem('whako_tts_filters', JSON.stringify(filterPatterns));
    }

    function addFilterPattern(pattern) {
        if (!pattern || !pattern.trim()) return;
        const p = pattern.trim();
        if (!filterPatterns.includes(p)) {
            filterPatterns.push(p);
            saveFilterPatterns();
        }
    }

    function removeFilterPattern(pattern) {
        filterPatterns = filterPatterns.filter(f => f !== pattern);
        saveFilterPatterns();
    }

    function filterText(text) {
        return filterPatterns.reduce((txt, pattern) => txt.replace(new RegExp(pattern, 'gi'), ''), text);
    }

    function getAudioCtx() {
        if (!audioCtx || audioCtx.state === 'closed') {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            gainNode = audioCtx.createGain();
            gainNode.connect(audioCtx.destination);
        }
        return audioCtx;
    }

    function pitchToDetune(ratio) {
        return 1200 * Math.log2(ratio);
    }

    function stopCurrentAudio() {
        if (currentSource) {
            try { currentSource.stop(); } catch (_) {}
            currentSource.disconnect();
            currentSource = null;
        }
    }

    function stopAllAudio() {
        stopCurrentAudio();
        if (audioCtx) {
            audioCtx.close().catch(() => {});
            audioCtx = null;
            gainNode = null;
        }
    }

    function init() {
        loadSettings();
        loadFilterPatterns();
        destroyUI();
        injectStyles();
        injectUI();
        bindEvents();

        const fab = document.getElementById('ttsFab');
        if (fab) fab.style.display = 'none';
        const panel = document.querySelector('.tts-panel');
        if (panel) panel.classList.remove('open');
    }

    function loadSettings() {
        try {
            const saved = localStorage.getItem('whako_tts_settings');
            if (saved) Object.assign(settings, JSON.parse(saved));
            settings.rate = Math.max(0.5, Math.min(2.0, settings.rate || 1.0));
            settings.pitch = Math.max(0.5, Math.min(2.0, settings.pitch || 1.0));
            settings.autoScroll = !!settings.autoScroll;
            settings.readChapterTitle = !!settings.readChapterTitle;
        } catch (e) {}
    }

    function saveSettings() {
        try {
            localStorage.setItem('whako_tts_settings', JSON.stringify(settings));
        } catch (e) {}
    }

    function injectStyles() {
        if (document.getElementById('tts-styles')) return;
        const s = document.createElement('style');
        s.id = 'tts-styles';
        s.textContent = `
            .tts-fab { position: fixed; bottom: 80px; right: 20px; width: 52px; height: 52px; border-radius: 50%; background: linear-gradient(135deg, #6366f1, #8b5cf6); border: none; color: #fff; font-size: 22px; cursor: pointer; z-index: 999; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 20px rgba(99,102,241,0.4); transition: transform 0.2s, box-shadow 0.2s; }
            .tts-fab:hover { transform: scale(1.1); box-shadow: 0 6px 28px rgba(99,102,241,0.55); }
            .tts-fab.playing { background: linear-gradient(135deg, #ef4444, #f97316); box-shadow: 0 4px 20px rgba(239,68,68,0.4); animation: tts-pulse 2s infinite; }
            @keyframes tts-pulse { 0%,100%{box-shadow:0 4px 20px rgba(239,68,68,0.4)} 50%{box-shadow:0 4px 30px rgba(239,68,68,0.7)} }
            .tts-panel { position: fixed; bottom: 145px; right: 20px; width: 310px; background: #1a1a2e; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; z-index: 1000; box-shadow: 0 12px 40px rgba(0,0,0,0.5); overflow: hidden; transform: scale(0.9); opacity: 0; pointer-events: none; transition: transform 0.25s ease, opacity 0.25s ease; }
            .tts-panel.open { transform: scale(1); opacity: 1; pointer-events: all; }
            .tts-hdr { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.06); background: rgba(99,102,241,0.07); }
            .tts-hdr-title { font-size: 13px; font-weight: 600; color: #e0e0e0; display: flex; align-items: center; gap: 7px; }
            .tts-hdr-title i { color: #6366f1; }
            .tts-close { background: none; border: none; color: #666; font-size: 15px; cursor: pointer; padding: 4px; border-radius: 4px; }
            .tts-close:hover { color: #fff; }
            .tts-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
            .tts-progress-wrap { display: none; }
            .tts-progress-wrap.visible { display: block; }
            .tts-progress-info { display: flex; justify-content: space-between; font-size: 11px; color: #888; margin-bottom: 5px; }
            .tts-progress-bar { height: 22px; background: #2a2a3a; border-radius: 4px; overflow: hidden; cursor: pointer; }
            .tts-progress-fill { height: 100%; background: linear-gradient(90deg, #6366f1, #8b5cf6); border-radius: 2px; width: 0%; transition: width 0.3s; }
            .tts-sentence-preview { font-size: 11px; color: #6366f1; min-height: 14px; margin-top: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .tts-ctrl-row { display: flex; align-items: center; justify-content: center; gap: 10px; }
            .tts-btn { width: 42px; height: 42px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #c0c0c0; font-size: 15px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.15s, border-color 0.15s, color 0.15s; }
            .tts-btn:hover { background: rgba(99,102,241,0.2); border-color: rgba(99,102,241,0.4); color: #a5b4fc; }
            .tts-btn.primary { width: 50px; height: 50px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border: none; color: #fff; font-size: 18px; }
            .tts-btn.primary:hover { box-shadow: 0 4px 16px rgba(99,102,241,0.5); transform: scale(1.05); }
            .tts-btn:disabled { opacity: 0.3; cursor: not-allowed; }
            .tts-btn:disabled:hover { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); color: #c0c0c0; transform: none; box-shadow: none; }
            .tts-range-row { display: flex; align-items: center; gap: 10px; }
            .tts-range-label { font-size: 12px; color: #888; min-width: 55px; }
            .tts-range-value { font-size: 11px; color: #6366f1; min-width: 30px; text-align: right; }
            .tts-range { flex: 1; -webkit-appearance: none; height: 4px; border-radius: 2px; background: #2a2a3a; outline: none; cursor: pointer; }
            .tts-range::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #6366f1; cursor: pointer; }
            .tts-clickable { cursor: pointer; color: #6366f1; }
            .tts-clickable:hover { color: #fff; }
            .tts-toggle-row { display: flex; align-items: center; justify-content: space-between; }
            .tts-toggle-label { font-size: 12px; color: #888; }
            .tts-toggle { position: relative; width: 38px; height: 20px; background: #2a2a3a; border-radius: 10px; cursor: pointer; transition: background 0.2s; }
            .tts-toggle.on { background: #6366f1; }
            .tts-toggle::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform 0.2s; }
            .tts-toggle.on::after { transform: translateX(18px); }
            .tts-status { text-align: center; font-size: 11px; color: #666; min-height: 16px; }
            .tts-chunk-info { text-align: center; font-size: 10px; color: #555; min-height: 14px; }
            .filter-fab { position: fixed; bottom: 150px; right: 20px; width: 48px; height: 48px; border-radius: 50%; background: #444; border: none; color: #fff; font-size: 18px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.3); z-index: 9998; display: none; }
            .filter-fab:hover { background: #555; }
            .filter-panel { display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 320px; background: #1a1a2e; border: 1px solid #333; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); z-index: 9999; }
            .filter-panel.open { display: block; }
            .filter-hdr { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #333; }
            .filter-hdr-title { font-size: 14px; font-weight: 600; color: #fff; }
            .filter-close { background: none; border: none; color: #888; cursor: pointer; font-size: 16px; padding: 4px; }
            .filter-close:hover { color: #fff; }
            .filter-body { padding: 12px 16px; }
            .filter-input-row { display: flex; gap: 8px; margin-bottom: 12px; }
            .filter-input { flex: 1; padding: 8px 12px; border: 1px solid #444; border-radius: 6px; background: #2a2a3e; color: #fff; font-size: 13px; }
            .filter-input:focus { outline: none; border-color: #6366f1; }
            .filter-btn { padding: 8px 16px; background: #6366f1; border: none; border-radius: 6px; color: #fff; cursor: pointer; font-size: 13px; }
            .filter-btn:hover { background: #5558e3; }
            .filter-list { display: flex; flex-wrap: wrap; gap: 6px; max-height: 200px; overflow-y: auto; }
            .filter-tag { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: #333; border-radius: 12px; font-size: 12px; color: #ccc; }
            .filter-tag button { background: none; border: none; color: #888; cursor: pointer; padding: 0; font-size: 14px; line-height: 1; }
            .filter-tag button:hover { color: #f00; }
        `;
        document.head.appendChild(s);
    }

    function destroyUI() {
        ['ttsFab', 'tts-panel', 'filterFab', 'filterPanel'].forEach(id => {
            const el = document.getElementById(id) || document.querySelector('.' + id);
            if (el) el.remove();
        });
        if (panelClickHandler) document.removeEventListener('click', panelClickHandler);
        if (ttsFabClickHandler) {
            const fabEl = document.getElementById('ttsFab');
            if (fabEl) fabEl.removeEventListener('click', ttsFabClickHandler);
        }
        panelClickHandler = ttsFabClickHandler = null;
    }

    function injectUI() {
        if (document.getElementById('ttsFab')) return;
        
        const createEl = (tag, id, className, innerHTML) => {
            const el = document.createElement(tag);
            if (id) el.id = id;
            if (className) el.className = className;
            if (innerHTML) el.innerHTML = innerHTML;
            document.body.appendChild(el);
            return el;
        };

        createEl('div', null, 'tts-panel', `
            <div class="tts-hdr">
                <div class="tts-hdr-title"><i class="fas fa-volume-up"></i> Đọc truyện</div>
                <button class="tts-close" id="ttsCloseBtn"><i class="fas fa-times"></i></button>
            </div>
            <div class="tts-body">
                <div class="tts-progress-wrap" id="ttsProgressWrap">
                    <div class="tts-progress-info">
                        <span id="ttsProgressLabel">0%</span>
                        <span id="ttsProgressPart"></span>
                    </div>
                    <div class="tts-progress-bar" id="ttsProgressBar">
                        <div class="tts-progress-fill" id="ttsProgressFill"></div>
                    </div>
                    <div class="tts-sentence-preview" id="ttsSentencePreview"></div>
                </div>
                <div class="tts-ctrl-row">
                    <button class="tts-btn" id="ttsPrevBtn" disabled title="Chương trước"><i class="fas fa-step-backward"></i></button>
                    <button class="tts-btn primary" id="ttsStopBtn" title="Dừng"><i class="fas fa-stop"></i></button>
                    <button class="tts-btn" id="ttsNextBtn" disabled title="Chương sau"><i class="fas fa-step-forward"></i></button>
                </div>
                <div class="tts-range-row">
                    <span class="tts-range-label">Tốc độ</span>
                    <input type="range" class="tts-range" id="ttsRateRange" min="0.5" max="2" step="0.25" value="${settings.rate}">
                    <span class="tts-range-value tts-clickable" id="ttsRateValue" title="Click để sửa">${settings.rate.toFixed(2)}</span>
                </div>
                <div class="tts-range-row">
                    <span class="tts-range-label">Pitch</span>
                    <input type="range" class="tts-range" id="ttsPitchRange" min="0.5" max="2" step="0.25" value="${settings.pitch}">
                    <span class="tts-range-value tts-clickable" id="ttsPitchValue" title="Click để sửa">${settings.pitch.toFixed(2)}</span>
                </div>
                <div class="tts-toggle-row">
                    <span class="tts-toggle-label">Tự động chuyển chương</span>
                    <div class="tts-toggle${settings.autoNext ? ' on' : ''}" id="ttsAutoNextToggle"></div>
                </div>
                <div class="tts-toggle-row">
                    <span class="tts-toggle-label">Tự động cuộn</span>
                    <div class="tts-toggle${settings.autoScroll ? ' on' : ''}" id="ttsAutoScrollToggle"></div>
                </div>
                <div class="tts-toggle-row">
                    <span class="tts-toggle-label">Đọc tên chương</span>
                    <div class="tts-toggle${settings.readChapterTitle ? ' on' : ''}" id="ttsReadChapterTitleToggle"></div>
                </div>
                <div class="tts-status" id="ttsStatus">Sẵn sàng</div>
                <div class="tts-chunk-info" id="ttsChunkInfo"></div>
            </div>
        `);

        createEl('button', 'filterFab', 'filter-fab', '<i class="fas fa-filter"></i>').title = 'Lọc ký tự';
        
        createEl('div', 'filterPanel', 'filter-panel', `
            <div class="filter-hdr">
                <div class="filter-hdr-title"><i class="fas fa-filter"></i> Lọc ký tự</div>
                <button class="filter-close" id="filterCloseBtn"><i class="fas fa-times"></i></button>
            </div>
            <div class="filter-body">
                <div class="filter-input-row">
                    <input type="text" class="filter-input" id="filterInput" placeholder="Nhập ký tự cần lọc...">
                    <button class="filter-btn" id="filterAddBtn">+ Thêm</button>
                </div>
                <div class="filter-list" id="filterList"></div>
            </div>
        `);

        createEl('button', 'ttsFab', 'tts-fab', '<i class="fas fa-volume-up"></i>').title = 'Đọc truyện (TTS)';
    }

    function renderFilterList() {
        const list = document.getElementById('filterList');
        if (!list) return;
        list.innerHTML = filterPatterns.length ? filterPatterns.map(f =>
            `<span class="filter-tag">${escHtml(f)} <button onclick="window.TTS.removeFilter('${escHtml(f).replace(/'/g, "\\'")}')">&times;</button></span>`
        ).join('') : '<span style="color:#666;font-size:11px;">Chưa có filter</span>';
    }

    function bindSync(rangeId, inputId, valueId, key, min, max, suffix, paramUpdater) {
        const range = document.getElementById(rangeId);
        const input = inputId ? document.getElementById(inputId) : null;
        const valEl = document.getElementById(valueId);

        const update = (val) => {
            let v = parseFloat(val);
            if (isNaN(v)) return;
            v = Math.max(min, Math.min(max, v));
            settings[key] = v;
            range.value = v;
            if (input) input.value = v;
            valEl.textContent = v.toFixed(2) + suffix;
            saveSettings();
            paramUpdater(v);
        };

        range.addEventListener('input', e => update(e.target.value));
        if (input) input.addEventListener('input', e => update(e.target.value));
    }

    function bindEvents() {
        const addToggleEvent = (btnId, panelSelector, toggleClass = 'open') => {
            const btn = document.getElementById(btnId);
            const panel = document.querySelector(panelSelector);
            if (btn && panel) btn.addEventListener('click', () => panel.classList.toggle(toggleClass));
        };

        addToggleEvent('ttsFab', '.tts-panel');
        addToggleEvent('filterFab', '#filterPanel');
        
        document.getElementById('filterCloseBtn')?.addEventListener('click', () => document.getElementById('filterPanel').classList.remove('open'));
        document.getElementById('ttsCloseBtn')?.addEventListener('click', () => document.querySelector('.tts-panel').classList.remove('open'));

        const filterAddBtn = document.getElementById('filterAddBtn');
        const filterInput = document.getElementById('filterInput');
        
        const addFilter = () => {
            const val = filterInput.value.trim();
            if (val) {
                addFilterPattern(val);
                filterInput.value = '';
                renderFilterList();
            }
        };

        filterAddBtn?.addEventListener('click', addFilter);
        filterInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') addFilter(); });
        renderFilterList();

        document.getElementById('ttsStopBtn').addEventListener('click', () => isPlaying || isPaused ? stop() : play());
        document.getElementById('ttsPrevBtn').addEventListener('click', () => onChapterEnd && onChapterEnd('prev'));
        document.getElementById('ttsNextBtn').addEventListener('click', () => onChapterEnd && onChapterEnd('next'));

        bindSync('ttsRateRange', null, 'ttsRateValue', 'rate', 0.5, 2.0, '', v => currentSource && (currentSource.playbackRate.value = v));
        bindSync('ttsPitchRange', null, 'ttsPitchValue', 'pitch', 0.5, 2.0, '', v => currentSource && (currentSource.detune.value = pitchToDetune(v)));

        document.getElementById('ttsAutoNextToggle').addEventListener('click', function () {
            settings.autoNext = !settings.autoNext;
            this.classList.toggle('on', settings.autoNext);
            saveSettings();
        });

        document.getElementById('ttsAutoScrollToggle').addEventListener('click', function () {
            settings.autoScroll = !settings.autoScroll;
            this.classList.toggle('on', settings.autoScroll);
            saveSettings();
        });

        document.getElementById('ttsReadChapterTitleToggle').addEventListener('click', function () {
            settings.readChapterTitle = !settings.readChapterTitle;
            this.classList.toggle('on', settings.readChapterTitle);
            saveSettings();
        });

        // Click on rate/pitch value to edit manually
        let makeInlineEditor = (valueEl, rangeEl, key, min, max, applyFn) => {
            valueEl.style.cursor = 'pointer';
            valueEl.addEventListener('click', function () {
                const input = document.createElement('input');
                input.type = 'number';
                input.value = settings[key];
                input.min = min;
                input.max = max;
                input.step = 0.05;
                input.style.cssText = 'width:50px;background:#2a2a3a;color:#fff;border:1px solid #6366f1;border-radius:4px;padding:2px 4px;font-size:11px;text-align:center;outline:none;';
                input.addEventListener('blur', () => {
                    const v = parseFloat(input.value);
                    if (!isNaN(v)) {
                        settings[key] = Math.max(min, Math.min(max, v));
                        rangeEl.value = settings[key];
                        valueEl.textContent = settings[key].toFixed(2);
                        saveSettings();
                        applyFn(settings[key]);
                    }
                    valueEl.style.display = '';
                    input.remove();
                });
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') input.blur();
                    if (e.key === 'Escape') { input.remove(); valueEl.style.display = ''; }
                });
                valueEl.style.display = 'none';
                valueEl.parentNode.insertBefore(input, valueEl);
                input.focus();
                input.select();
            });
        };

        makeInlineEditor(document.getElementById('ttsRateValue'), document.getElementById('ttsRateRange'), 'rate', 0.5, 2.0, v => currentSource && (currentSource.playbackRate.value = v));
        makeInlineEditor(document.getElementById('ttsPitchValue'), document.getElementById('ttsPitchRange'), 'pitch', 0.5, 2.0, v => currentSource && (currentSource.detune.value = pitchToDetune(v)));

        document.getElementById('ttsProgressBar').addEventListener('click', function (e) {
            if (!currentSentences.length) return;
            const rect = this.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            jumpTo(Math.floor(ratio * currentSentences.length));
        });
    }

    function splitIntoChunks(text) {
        if (!text || !text.trim()) return [];
        return text.trim().split(/\n\n/).filter(seg => seg.trim()).map(seg => ({
            text: seg.trim(),
            start: 0, 
            end: seg.length
        }));
    }

    function highlightSentence(index) {
        clearHighlight();
        if (index < 0 || index >= chunkOffsets.length) return;

        const { start, end } = chunkOffsets[index];

        // Skip highlight for chapter title (marked with start=-1) — it's not in DOM
        if (start === -1) return;

        const textEl = document.getElementById('rdText');
        if (!textEl) return;

        const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT, null);
        let charPos = 0, node, openMark = null;

        while ((node = walker.nextNode())) {
            const nodeEnd = charPos + node.textContent.length;
            if (start < nodeEnd && end > charPos) {
                const splitOffset = start - charPos;
                if (splitOffset > 0) node.splitText(splitOffset);
                const splitEnd = end - charPos - splitOffset;
                if (splitEnd < node.textContent.length) node.splitText(splitEnd);

                openMark = document.createElement('mark');
                openMark.style.cssText = 'background:#6366f133;border-radius:2px;padding:0 1px;display:inline;';
                node.parentNode.insertBefore(openMark, node);
                openMark.appendChild(node);

                // Scroll the highlight into view if setting enabled and not visible
                if (settings.autoScroll) {
                    openMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                break;
            }
            charPos = nodeEnd;
        }
        currentHighlightEl = openMark;
    }

    function clearHighlight() {
        if (currentHighlightEl && currentHighlightEl.parentNode) {
            const parent = currentHighlightEl.parentNode;
            while (currentHighlightEl.firstChild) parent.insertBefore(currentHighlightEl.firstChild, currentHighlightEl);
            parent.removeChild(currentHighlightEl);
        }
        currentHighlightEl = null;

        document.querySelectorAll('#rdText mark').forEach(m => {
            const p = m.parentNode;
            while (m.firstChild) p.insertBefore(m.firstChild, m);
            p.removeChild(m);
        });
    }

    function addParagraph(paragraph) {
        const p = filterText((paragraph || '').trim());
        if (p) {
            currentSentences.push(p);
            queuedParagraphs.push(p);
        }
    }

    function clearParagraphs() {
        currentSentences = [];
        queuedParagraphs = [];
        chunkOffsets = [];
    }

    function ensureContentLoaded() {
        if (currentSentences.length === 0) {
            if (queuedParagraphs.length === 0) {
                clearParagraphs();
                // Rebuild currentSentences + chunkOffsets from DOM (for highlighting)
                let charIdx = 0;
                document.querySelectorAll('.rd-text p').forEach(p => {
                    const text = filterText((p.textContent || '').trim());
                    if (!text) return;
                    currentSentences.push(text);
                    queuedParagraphs.push(text);
                    chunkOffsets.push({ start: charIdx, end: charIdx + text.length });
                    charIdx += text.length + 2;
                });
                if (currentSentences.length === 0) {
                    setStatus('Không có nội dung');
                    return false;
                }
            } else {
                currentSentences = [...queuedParagraphs];
            }
        }
        return true;
    }

    // Called when reader loads a new chapter — resets TTS content
    function onChapterLoaded() {
        currentSentences = [];
        queuedParagraphs = [];
        chunkOffsets = [];
        currentIndex = 0;

        const textEl = document.getElementById('rdText');
        if (!textEl) return;

        // Prepend chapter title if setting is on
        if (settings.readChapterTitle) {
            const chTitleEl = document.getElementById('rdChTitle');
            const titleText = (chTitleEl?.textContent || '').trim();
            if (titleText) {
                const filtered = filterText(titleText);
                currentSentences.push(filtered);
                queuedParagraphs.push(filtered);
                chunkOffsets.push({ start: -1, end: -1 }); // -1 = skip highlight (not in DOM)
            }
        }

        const domParagraphs = Array.from(textEl.querySelectorAll('p'));
        domParagraphs.forEach((pEl) => {
            const rawText = pEl.textContent || '';
            const filteredText = filterText(rawText.trim());
            if (!filteredText) return;

            // Find the actual DOM position of this paragraph using TreeWalker
            const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT, null);
            let charPos = 0;
            let start = -1;
            let end = -1;
            let node;
            let charCount = 0;

            // Walk through all text nodes to find where this paragraph starts/ends
            while ((node = walker.nextNode())) {
                const nodeLen = node.textContent.length;

                // Check if this node is inside our target paragraph
                if (textEl.contains(node) && isDescendantOf(node, pEl)) {
                    if (start === -1) {
                        start = charPos;
                        charCount = 0;
                    }
                    charCount += nodeLen;
                } else if (start !== -1) {
                    // We've left the paragraph
                    end = charPos;
                    break;
                }

                charPos += nodeLen;
            }

            // Fallback if walker didn't capture it
            if (start === -1) start = charPos;
            if (end === -1) end = charPos + charCount;

            currentSentences.push(filteredText);
            queuedParagraphs.push(filteredText);
            chunkOffsets.push({ start, end });
        });
    }

    function isDescendantOf(node, ancestor) {
        let n = node;
        while (n) {
            if (n === ancestor) return true;
            n = n.parentNode;
        }
        return false;
    }

    async function play(navigationCallback) {
        if (isPlaying) return;
        if (!ensureContentLoaded()) return;

        playbackToken++;
        stopAllAudio();
        isPlayNextRunning = false; 

        currentSentences = [...queuedParagraphs];
        onChapterEnd = navigationCallback || onChapterEnd;
        isAutoNextDone = false;
        lastPlayedIndex = -1;

        document.getElementById('ttsChunkInfo').textContent = `${currentSentences.length} đoạn`;
        const shouldAutoPlay = justNavigated;
        justNavigated = false;

        isPlaying = true;
        isPaused = false;
        updateUI();
        showProgress(true);
        setStatus('Đang đọc...');

        shouldAutoPlay ? setTimeout(() => isPlaying && playNext(), 50) : playNext();
    }

    async function playWithText(text, navigationCallback) {
        if (!text || !text.trim()) return setStatus('Không có nội dung');
        clearParagraphs();
        splitIntoChunks(text).forEach(c => addParagraph(c.text));
        await play(navigationCallback);
    }

    async function jumpTo(index) {
        if (!ensureContentLoaded() || index < 0 || index >= currentSentences.length) return;

        playbackToken++;
        stopAllAudio();
        isPlayNextRunning = false; 
        
        isPlaying = true;
        isPaused = false;
        updateUI();
        showProgress(true);

        currentIndex = index;
        lastPlayedIndex = -1;
        errorCount = 0;
        audioCache.clear();
        prefetchQueue = [];
        isPrefetching = false;
        
        updateProgress(currentIndex, currentSentences.length, currentSentences[currentIndex]);
        await playNext();
    }

    async function playNext() {
        if (!isPlaying || isPlayNextRunning) return;
        isPlayNextRunning = true;
        const currentToken = playbackToken;

        try {
            while (isPlaying && currentToken === playbackToken) {
                if (lastPlayedIndex === currentIndex) {
                    currentIndex++;
                    if (currentIndex >= currentSentences.length) return onFinish();
                }
                lastPlayedIndex = currentIndex;

                if (currentIndex >= currentSentences.length) return onFinish();

                const sentence = currentSentences[currentIndex];
                updateProgress(currentIndex, currentSentences.length, sentence.length > 60 ? sentence.substring(0, 60) + '...' : sentence);
                setStatus('Đang đọc...');
                runPrefetch(currentIndex);

                let arrayBuffer;
                const cached = audioCache.get(currentIndex);
                
                if (cached) {
                    arrayBuffer = cached.arrayBuffer;
                    audioCache.delete(currentIndex);
                } else {
                    const result = await window.electronAPI.fetchTTS({ text: sentence, lang: TTS_LANG });
                    if (currentToken !== playbackToken || !isPlaying) return;
                    if (!result || result.error || !result.base64Audio || result.base64Audio.length < MIN_AUDIO_LENGTH) {
                        currentIndex++;
                        continue;
                    }
                    arrayBuffer = base64ToArrayBuffer(result.base64Audio);
                }

                stopCurrentAudio();
                const ctx = getAudioCtx();
                const localGainNode = gainNode;
                let audioBuffer;
                
                try {
                    audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
                } catch (err) {
                    if (currentToken === playbackToken) currentIndex++;
                    continue; 
                }

                if (currentToken !== playbackToken || !isPlaying || !localGainNode) return;
                if (ctx !== localGainNode.context) return;

                currentSource = ctx.createBufferSource();
                currentSource.buffer = audioBuffer;
                currentSource.playbackRate.value = settings.rate;
                currentSource.detune.value = pitchToDetune(settings.pitch);
                currentSource.connect(localGainNode);
                localGainNode.gain.value = 1.0;

                await new Promise((resolve) => {
                    currentSource.onended = resolve;
                    currentSource.onerror = resolve;
                    const timeout = setTimeout(resolve, AUDIO_TIMEOUT_MS);
                    highlightSentence(currentIndex);
                    currentSource.start(0);
                    currentSource.onended = () => { clearTimeout(timeout); resolve(); };
                });

                if (currentToken !== playbackToken || !isPlaying) return;
                
                currentIndex++;
                updateProgress(currentIndex, currentSentences.length, null);
                await delay(10);
            }
        } finally {
            if (currentToken === playbackToken) {
                isPlayNextRunning = false;
            }
        }
    }

    async function prefetchNext(sentence, index) {
        try {
            const result = await window.electronAPI.fetchTTS({ text: sentence, lang: TTS_LANG });
            if (!result.error && result.base64Audio && result.base64Audio.length >= MIN_AUDIO_LENGTH) {
                audioCache.set(index, { arrayBuffer: base64ToArrayBuffer(result.base64Audio), sentence });
            }
        } catch (_) {}
    }

    function runPrefetch(fromIndex) {
        for (let i = 1; i <= PREFETCH_COUNT; i++) {
            const idx = fromIndex + i;
            if (idx >= currentSentences.length) break;
            if (!audioCache.has(idx)) prefetchQueue.push(idx);
        }
        if (!isPrefetching) {
            isPrefetching = true;
            processPrefetchQueue();
        }
    }

    async function processPrefetchQueue() {
        while (prefetchQueue.length > 0 && isPlaying) {
            const idx = prefetchQueue.shift();
            if (!audioCache.has(idx)) await prefetchNext(currentSentences[idx], idx);
            await delay(50);  
        }
        isPrefetching = false;
    }

    function base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        return bytes.buffer;
    }

    function pause() {
        if (!isPlaying) return;
        playbackToken++; 
        isPlaying = false;
        isPaused = true;
        stopAllAudio();
        updateUI();
        setStatus('Đã tạm dừng');
    }

    function resume() {
        if (!isPaused || isPlaying) return; 
        isPaused = false;
        isPlaying = true;
        if (audioCtx) audioCtx.resume().catch(() => {});
        updateUI();
        setStatus('Đang đọc...');
        playNext(); 
    }

    function stop() {
        playbackToken++;
        stopAllAudio();
        isPlayNextRunning = false;
        isPlaying = isPaused = false;
        audioCache.clear();
        prefetchQueue = [];
        isPrefetching = false;
        errorCount = 0;
        lastPlayedIndex = -1;
        justNavigated = isAutoNextDone = false;
        clearHighlight();
        setStatus('Đã dừng');
        updateUI();
    }

    function onFinish() {
        isPlaying = isPaused = false;
        currentIndex = 0;
        updateUI();
        showProgress(false);
        setStatus('Hoàn tất');
        if (settings.autoNext && onChapterEnd && !isAutoNextDone) {
            isAutoNextDone = true;
            setTimeout(() => onChapterEnd('next'), 1500);
        }
    }

    function escHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function updateUI() {
        const stopBtn = document.getElementById('ttsStopBtn');
        const fab = document.getElementById('ttsFab');
        
        stopBtn.innerHTML = isPlaying || isPaused ? '<i class="fas fa-stop"></i>' : '<i class="fas fa-play"></i>';
        fab.classList.toggle('playing', isPlaying || isPaused);

        document.getElementById('ttsPrevBtn').disabled = !onChapterEnd;
        document.getElementById('ttsNextBtn').disabled = !onChapterEnd;
    }

    function updateProgress(current, total, textPreview) {
        const pct = total > 0 ? Math.round((current / total) * 100) : 0;
        const displayCurrent = Math.min(current + 1, total);
        document.getElementById('ttsProgressFill').style.width = pct + '%';
        document.getElementById('ttsProgressLabel').textContent = pct + '%';
        document.getElementById('ttsProgressPart').textContent = `${displayCurrent}/${total}`;
        if (textPreview !== null) document.getElementById('ttsSentencePreview').textContent = textPreview;
    }

    function showProgress(show) {
        const wrap = document.getElementById('ttsProgressWrap');
        if (wrap) wrap.classList.toggle('visible', show);
    }

    function setStatus(msg) {
        const el = document.getElementById('ttsStatus');
        if (el) el.textContent = msg;
    }

    window.TTS = {
        init, play, pause, resume, stop,
        isPlaying: () => isPlaying,
        isPaused: () => isPaused,
        getSettings: () => ({ ...settings }),
        addParagraph, clearParagraphs,
        removeFilter: (pattern) => { removeFilterPattern(pattern); renderFilterList(); },
        getFilters: () => [...filterPatterns],
        setNavCallback: (fn) => onChapterEnd = fn,
        clearNavCallback: () => onChapterEnd = null,
        onChapterLoaded: onChapterLoaded,
        setJustNavigated: () => justNavigated = true,
        clearJustNavigated: () => justNavigated = false,
    };
})();