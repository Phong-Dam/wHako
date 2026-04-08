// ============================================================
// Constants & Configuration
// ============================================================
const MAX_HISTORY = 200;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const REQUEST_TIMEOUT = 30000;
const IMAGE_CACHE_TIMEOUT = 15000;
const TTS_TIMEOUT = 15000;
const MAX_CACHE_SIZE = 500 * 1024 * 1024; // 500MB
const MAX_COMICS_IN_MEMORY = 500;
const IMAGE_PREFETCH_CONCURRENCY = 5;
const SCRAPE_DELAY_MS = 1000;
const MAX_ERRORS = 3;
const PREFETCH_COUNT = 2;

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
};

const SORT_OPTIONS = [
    { value: 'tentruyen', label: 'A - Z' },
    { value: 'tentruyenza', label: 'Z - A' },
    { value: 'capnhat', label: 'Mới cập nhật' },
    { value: 'truyenmoi', label: 'Truyện mới' },
    { value: 'theodoi', label: 'Theo dõi' },
    { value: 'top', label: 'Top toàn thời gian' },
    { value: 'topthang', label: 'Top tháng' },
    { value: 'sotu', label: 'Số từ' }
];

const fixBase = (u) => u.replace(/\/$/, '');

function buildUrl(baseUrl, options = {}) {
    const params = new URLSearchParams();

    if (options.truyendich) params.append('truyendich', 1);
    if (options.sangtac) params.append('sangtac', 1);
    if (options.convert) params.append('convert', 1);

    if (options.dangtienhanh) params.append('dangtienhanh', 1);
    if (options.tamngung) params.append('tamngung', 1);
    if (options.hoanthanh) params.append('hoanthanh', 1);

    if (options.sapxep) params.append('sapxep', options.sapxep);
    if (options.page) params.append('page', options.page);

    return `${baseUrl.replace(/\/$/, '')}/danh-sach?${params.toString()}`;
}

module.exports = {
    MAX_HISTORY,
    MAX_RETRIES,
    RETRY_DELAY,
    REQUEST_TIMEOUT,
    IMAGE_CACHE_TIMEOUT,
    TTS_TIMEOUT,
    MAX_CACHE_SIZE,
    MAX_COMICS_IN_MEMORY,
    IMAGE_PREFETCH_CONCURRENCY,
    SCRAPE_DELAY_MS,
    MAX_ERRORS,
    PREFETCH_COUNT,
    DEFAULT_HEADERS,
    SORT_OPTIONS,
    fixBase,
    buildUrl
};
