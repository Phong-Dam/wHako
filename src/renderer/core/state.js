// ============================================================
// Shared App State
// ============================================================
window.AppState = {
    // Home / Comic list
    currentPage: 1,
    isLoading: false,
    isLoadingMore: false,
    hasMorePages: false,
    scrollHandlerActive: true,
    totalPagesLoaded: 0,
    loadedPages: {},
    allComics: [],

    // Filters (shared between navbar.js and home.js)
    filters: {
        type: ['truyendich'],
        status: ['dangtienhanh'],
        sort: 'top',
    },

    // Detail
    currentDetail: null,
    isDetailLoading: false,
    openVolumes: new Set(),
    savedScrollY: 0,

    // Reader
    currentChapter: null,
    currentComic: null,
    readerReady: false,
    eventsBound: false,

    // History
    historyList: [],
};
