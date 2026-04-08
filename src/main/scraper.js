const axios = require('axios');
const https = require('https');
const { ipcMain } = require('electron');
const { sanitizeHtml } = require('./utils/sanitizer');
const { MAX_RETRIES, RETRY_DELAY, DEFAULT_HEADERS, SORT_OPTIONS, fixBase, buildUrl } = require('./utils/constants');
const { loadHistory, saveHistory, addHistoryEntry } = require('./utils/history');
const { decodeChapterContent } = require('./utils/crypto');
const { cacheImage, preCacheImages, clearCacheDir, getCachedImageMap } = require('./utils/imageCache');
const googleTTS = require('google-tts-api');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// Extract comics from HTML
function extractComics(html) {
    const comics = [];

    const thumbRegex = /<div class="thumb-item-flow[^>]*>([\s\S]*?)<!-- \/\/ Tooltip -->/g;
    let match;

    while ((match = thumbRegex.exec(html)) !== null) {
        const item = match[1];

        try {
            const comic = {};

            let coverUrl = null;

            const dataBgMatch = item.match(/data-bg=["']([^"']+)["']/);
            if (dataBgMatch) coverUrl = dataBgMatch[1];

            if (!coverUrl) {
                const bgMatch = item.match(/style=["'][^"']*background-image:\s*url\(["']?([^"')]+)["']?[^"']*["']/i);
                if (bgMatch) coverUrl = bgMatch[1];
            }

            if (!coverUrl) {
                const imgMatch = item.match(/<img[^>]+src=["']([^"']+)["']/);
                if (imgMatch) coverUrl = imgMatch[1];
            }

            if (!coverUrl) {
                const dataSrcMatch = item.match(/data-src=["']([^"']+)["']/);
                if (dataSrcMatch) coverUrl = dataSrcMatch[1];
            }

            if (coverUrl) {
                comic.cover = coverUrl.replace(/(^https?:\/)\/+/, '$1');
            }

            const seriesMatch = item.match(/series-title[\s\S]*?href="([^"]+)".*?title="([^"]+)"/s);
            if (seriesMatch) {
                const rawUrl = seriesMatch[1].trim();
                let pathname = rawUrl;

                try {
                    const urlObj = new URL(rawUrl);
                    pathname = urlObj.pathname;
                } catch (_) {
                    pathname = rawUrl;
                }

                pathname = pathname.replace(/(^https?:\/)\/+/, '$1').replace(/\/$/, '');
                comic.url = pathname;
                comic.slug = pathname;
                comic.name = seriesMatch[2];
            }

            const chapterMatch = item.match(/chapter-title[^>]*title="([^"]+)"/);
            if (chapterMatch) {
                comic.latestChapter = { title: chapterMatch[1] };
            }

            const volumeMatch = item.match(/volume-title[^>]*>([^<]+)/);
            if (volumeMatch) {
                comic.volume = volumeMatch[1].trim();
            }

            const idMatch = item.match(/series_(\d+)/);
            if (idMatch) {
                comic.id = parseInt(idMatch[1]);
            }

            const tooltipMatch = item.match(/Số từ:\s*([\d.,]+)[\s\S]*?Lượt xem:\s*([\d.,]+)[\s\S]*?Lượt thích:\s*([\d.,]+)/);
            if (tooltipMatch) {
                comic.wordCount = parseInt(tooltipMatch[1].replace(/,/g, ''));
                comic.views = parseInt(tooltipMatch[2].replace(/,/g, ''));
                comic.likes = parseInt(tooltipMatch[3].replace(/,/g, ''));
            }

            const descMatch = item.match(/Lượt thích:[\d.,]+<\/div>\s*<\/p>\s*<div>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<!--/);
            if (descMatch) {
                comic.description = descMatch[1].trim().replace(/<[^>]+>/g, '').substring(0, 200);
            }

            if (comic.id && comic.name) {
                comics.push(comic);
            }
        } catch (e) {
            // Skip error items
        }
    }

    return comics;
}

// Scrape a page with retry
async function scrapePageWithRetry(url, retries = MAX_RETRIES) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`Fetching: ${url} (attempt ${attempt}/${retries})`);

            const response = await axios.get(url, {
                headers: DEFAULT_HEADERS,
                timeout: 30000,
                httpsAgent
            });

            return extractComics(response.data);

        } catch (error) {
            console.error(`Error attempt ${attempt}: ${error.message}`);

            if (attempt < retries) {
                const delay = RETRY_DELAY * attempt;
                console.log(`Retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
            } else {
                console.error('Max retries reached');
                return [];
            }
        }
    }
    return [];
}

// Scrape all pages with filters
async function scrapeAll(baseUrl, options = {}, maxPages = 5) {
    console.log('Starting scrape...');
    console.log('Filter:', options);

    const allComics = [];

    for (let page = 1; page <= maxPages; page++) {
        const url = buildUrl(baseUrl, { ...options, page });

        const comics = await scrapePageWithRetry(url);

        if (comics.length === 0) {
            console.log(`No data on page ${page}, stopping.`);
            break;
        }

        allComics.push(...comics);
        console.log(`Page ${page}: ${comics.length} comics (Total: ${allComics.length})`);

        await new Promise(r => setTimeout(r, 1000));
    }

    const unique = Array.from(new Map(allComics.map(c => [c.id, c])).values());
    console.log(`Done! Total: ${unique.length} comics`);

    return unique;
}

function extractDetail(html, url) {
    const detail = {
        name: '',
        cover: '',
        author: '',
        artist: '',
        status: '',
        genres: [],
        description: '',
        detail: '',
        ongoing: false,
        comments: [],
        volumes: [],
        slug: ''
    };

    const titleMatch = html.match(/<span class="series-name">\s*<a[^>]+>([^<]+)<\/a>/);
    if (titleMatch) detail.name = titleMatch[1].trim();

    const seriesCoverMatch = html.match(/<div class=["']series-cover["']>([\s\S]*?)<div class=["']col-12 col-md-9/);
    if (seriesCoverMatch) {
        const seriesSection = seriesCoverMatch[1];
        const coverBgMatch = seriesSection.match(/background-image:\s*url\(\x27([^\x27]+)\x27|url\(&#39;([^&#]+)&#39;\)|url\("([^"]+)"\)/i);
        if (coverBgMatch) {
            detail.cover = (coverBgMatch[1] || coverBgMatch[2] || coverBgMatch[3] || '').replace(/(^https?:\/)\/+/, '$1');
        }
    }

    const infoItems = html.match(/<div class="info-item"[^>]*>[\s\S]*?<\/div>\s*<\/div>/g) || [];
    const detailParts = [];

    for (const item of infoItems) {
        const labelMatch = item.match(/<span class="info-name"[^>]*>([^<]+)<\/span>/);
        const valueMatch = item.match(/<span class="info-value"[^>]*>([\s\S]*?)<\/span>/s);
        const valueLinkMatch = item.match(/<a[^>]+href="([^"]+)"[^>]*>([^<]*)<\/a>/);

        if (!labelMatch || !valueMatch) continue;

        const label = labelMatch[1].trim();
        const valueText = valueMatch[1].replace(/<[^>]+>/g, '').trim();
        const valueHref = valueLinkMatch ? valueLinkMatch[1] : '';
        const valueLower = valueText.toLowerCase();
        const labelLower = label.toLowerCase();

        detailParts.push(`<b>${label}:</b> ${valueText}`);

        if (!detail.author && labelLower.includes('tác giả')) {
            detail.author = valueText;
        }
        if (!detail.artist && labelLower.includes('họa sĩ')) {
            detail.artist = valueText;
        }
        if (labelLower.includes('tình trạng')) {
            detail.ongoing = valueHref.includes('truyen-dang-tien-hanh') || valueLower.includes('đang tiến hành');
            detail.status = valueText;
        }
    }

    const genreMatches = html.match(/<a class="series-gerne-item"[^>]+>([^<]+)<\/a>/g);
    if (genreMatches) {
        detail.genres = genreMatches.map(g => {
            const titleMatch = g.match(/>([^<]+)<\/a>/);
            const hrefMatch = g.match(/href="([^"]+)"/);
            return {
                title: titleMatch ? titleMatch[1].trim() : '',
                input: hrefMatch ? hrefMatch[1] : '',
                script: 'gen.js'
            };
        }).filter(g => g.title);
    }

    const summaryMatch = html.match(/class="summary-content"[^>]*>([\s\S]*?)<\/div>/);
    if (summaryMatch) {
        detail.description = sanitizeHtml(summaryMatch[1].trim());
    }

    detail.detail = sanitizeHtml(detailParts.join('<br>'));

    const commentsLinkMatch = html.match(/<a[^>]+href="([^"]*#series-comments[^"]*)"[^>]*>/);
    if (commentsLinkMatch) {
        detail.comments.push({
            title: 'Bình luận',
            input: commentsLinkMatch[1],
            script: 'comment.js'
        });
    }

    const volumeBlockRegex = /<section class="volume-list at-series[\s\S]*?<header id="(volume_\d+)"[\s\S]*?<span class="sect-title">([\s\S]*?)<\/span>[\s\S]*?<\/header>[\s\S]*?<ul class="list-chapters at-series">([\s\S]*?)<\/ul>/g;
    let volMatch;
    while ((volMatch = volumeBlockRegex.exec(html)) !== null) {
        const volTitle = volMatch[2].replace(/<[^>]+>/g, '').trim().replace(/\s*\*\s*$/, '');
        const chaptersHtml = volMatch[3];

        let volCover = '';
        const volCoverMatch = volMatch[0].match(/background-image:\s*url\(['"]?([^"')]+)['"]?\)/);
        if (volCoverMatch) volCover = volCoverMatch[1].replace(/&#39;/g, "'").replace(/(^https?:\/)\/+/, '$1');

        const chapterRegex = /<a href="([^"]+)" title="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
        const chapters = [];
        let chMatch;
        while ((chMatch = chapterRegex.exec(chaptersHtml)) !== null) {
            const chUrl = chMatch[1].replace(/(^https?:\/)\/+/, '$1');
            const chTitle = chMatch[3].replace(/<[^>]+>/g, '').trim();
            const chSlugMatch = chUrl.match(/\/c(\d+)-/);
            chapters.push({
                title: chTitle,
                url: chUrl,
                slug: chSlugMatch ? chSlugMatch[1] : '',
                hasImage: chMatch[2].includes('Có chứa ảnh')
            });
        }

        const timeMatch = volMatch[0].match(/<div class="chapter-time">([^<]+)<\/div>/);
        const volTime = timeMatch ? timeMatch[1].trim() : '';

        detail.volumes.push({
            title: volTitle,
            cover: volCover,
            time: volTime,
            chapters
        });
    }

    let pathname = url;
    try {
        pathname = new URL(url).pathname;
    } catch (_) { /* use as-is */ }
    pathname = pathname.replace(/(^https?:\/)\/+/, '$1').replace(/\/$/, '');
    detail.slug = pathname;

    return detail;
}

// Scrape detail page
async function scrapeDetail(url, retries = MAX_RETRIES) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`Fetching detail: ${url} (attempt ${attempt}/${retries})`);

            const response = await axios.get(url, {
                headers: DEFAULT_HEADERS,
                timeout: 30000,
                httpsAgent
            });

            const detail = extractDetail(response.data, url);

            if (detail.cover) {
                cacheImage(detail.cover);
            }

            console.log(`Detail: "${detail.name}" - ${detail.volumes.length} volumes, ${detail.volumes.reduce((s, v) => s + v.chapters.length, 0)} chapters`);
            return detail;

        } catch (error) {
            console.error(`Error attempt ${attempt}: ${error.message}`);
            if (attempt < retries) {
                const delay = RETRY_DELAY * attempt;
                console.log(`Retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
    return null;
}

// Extract chapter content from HTML
function extractChapter(html, url) {
    const baseUrlFromPassed = (() => {
        try { return new URL(url).origin; } catch { return ''; }
    })();

    const chapter = {
        url,
        volumeTitle: '',
        chapterTitle: '',
        images: [],
        content: '',
        prevUrl: null,
        nextUrl: null,
        seriesUrl: null,
        seriesTitle: ''
    };

    const seriesTitleMatch = html.match(/<h5><a href="([^"]+)">([^<]+)<\/a><\/h5>/);
    if (seriesTitleMatch) {
        chapter.seriesUrl = seriesTitleMatch[1];
        chapter.seriesTitle = seriesTitleMatch[2].trim();
    }

    const volumeMatch = html.match(/<h2 class="title-item[^"]*"[^>]*>([^<]+)<\/h2>/);
    if (volumeMatch) chapter.volumeTitle = volumeMatch[1].trim();

    const chTitleMatch = html.match(/<h4 class="title-item[^"]*"[^>]*>([^<]+)<\/h4>/);
    if (chTitleMatch) chapter.chapterTitle = chTitleMatch[1].trim();

    const contentMatch = html.match(/<div id="chapter-content"[^>]*>([\s\S]*?)<\/div>\s*<div style="text-align: center; margin:/);
    if (contentMatch) {
        const contentHtml = contentMatch[1];

        console.log(`Raw contentHtml length: ${contentHtml.length}`);

        const imgMatches = contentHtml.match(/<img[^>]+>/g);
        if (imgMatches) {
            chapter.images = imgMatches.map(m => {
                const srcMatch = m.match(/src=["']([^"']+)["']/);
                return srcMatch ? srcMatch[1] : '';
            }).filter(Boolean);
        }

        const decodedContent = decodeChapterContent(contentHtml);
        if (decodedContent) {
            console.log(`Decode success! Content length: ${decodedContent.length}`);

            const paragraphs = [];
            const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/g;
            let pMatch;
            while ((pMatch = pRegex.exec(decodedContent)) !== null) {
                const text = pMatch[1].replace(/<[^>]+>/g, '').trim();
                if (text) {
                    paragraphs.push(text);
                }
            }
            chapter.content = paragraphs.join('\n\n');
            console.log(`Extracted ${paragraphs.length} paragraphs`);
        } else {
            console.log('Decode failed, using fallback');
            const dataCMatch = contentHtml.match(/data-c="([^"]{1,200})/);
            if (dataCMatch) {
                console.log('data-c preview:', dataCMatch[1].substring(0, 100) + '...');
            }
            const paragraphs = [];
            const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/g;
            let pMatch;
            while ((pMatch = pRegex.exec(contentHtml)) !== null) {
                if (pMatch[0].includes('display: none')) continue;
                const text = pMatch[1].replace(/<[^>]+>/g, '').trim();
                if (text) {
                    paragraphs.push(text);
                }
            }
            chapter.content = paragraphs.join('\n\n');
        }

        console.log(`Final content length: ${chapter.content.length}`);
    } else {
        console.log('chapter-content not found');
    }

    const fixUrl = (u) => {
        if (u.startsWith('http')) return u.replace(/([^:]\/)\/+/g, '$1');
        return `${baseUrlFromPassed.replace(/\/$/, '')}/${u.replace(/^\/+/, '')}`;
    };

    const prevMatch = html.match(/<a[^>]+class="[^"]*rd_top-left[^"]*"[^>]*href="([^"]+)"/);
    if (prevMatch && !prevMatch[1].includes('disabled')) {
        chapter.prevUrl = fixUrl(prevMatch[1]);
    }

    const nextMatch = html.match(/<a[^>]+class="[^"]*rd_top-right[^"]*"[^>]*href="([^"]+)"/);
    if (nextMatch) {
        chapter.nextUrl = fixUrl(nextMatch[1]);
    }

    return chapter;
}

// Scrape chapter page
async function scrapeChapter(url, retries = MAX_RETRIES) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`Fetching chapter: ${url} (attempt ${attempt}/${retries})`);

            const response = await axios.get(url, {
                headers: DEFAULT_HEADERS,
                timeout: 30000,
                httpsAgent
            });

            const chapter = extractChapter(response.data, url);
            console.log(`Chapter: "${chapter.chapterTitle}" - ${chapter.images.length} images`);
            return chapter;

        } catch (error) {
            console.error(`Error attempt ${attempt}: ${error.message}`);
            if (attempt < retries) {
                await new Promise(r => setTimeout(r, RETRY_DELAY * attempt));
            }
        }
    }
    return null;
}

// Google TTS API using google-tts-api package
async function fetchTTSNode(text, lang) {
    if (!lang) {
        return null;
    }


    try {
        let base64Audio;

        if (text.length <= 200) {
            // Short text - use direct API
            base64Audio = await googleTTS.getAudioBase64(text, {
                lang: lang,
                slow: false,
                host: 'https://translate.google.com',
                timeout: 15000,
            });
        } else {
            // Long text - split into chunks
            const results = await googleTTS.getAllAudioBase64(text, {
                lang: lang,
                slow: false,
                host: 'https://translate.google.com',
                timeout: 15000,
                splitPunct: ',.?',
            });
            base64Audio = results.map(r => r.base64).join('');
        }

        return base64Audio;
    } catch (error) {
        return null;
    }
}

// Register IPC handlers
function registerIpcHandlers(mainWindow, baseUrl, userDataPath) {
    ipcMain.handle('scrape-comics', async (event, options = {}) => {
        const defaultOptions = {
            truyendich: 1,
            sangtac: 1,
            convert: 1,
            dangtienhanh: 1,
            tamngung: 1,
            hoanthanh: 1,
            sapxep: options.sapxep || 'top',
            pages: 1
        };

        try {
            const comics = await scrapeAll(baseUrl, { ...defaultOptions, ...options });
            return comics;
        } catch (error) {
            console.error('Scrape error:', error);
            return [];
        }
    });

    ipcMain.handle('scrape-page', async (event, options = {}) => {
        try {
            const { page = 1, sort = 'top', types = [], statuses = [] } = options;

            const buildParams = () => {
                const params = new URLSearchParams();
                types.forEach(t => params.append(t, 1));
                statuses.forEach(s => params.append(s, 1));
                params.append('sapxep', sort);
                params.append('page', page);
                return params.toString();
            };

            const url = `${fixBase(baseUrl)}/danh-sach?${buildParams()}`;
            const comics = await scrapePageWithRetry(url);

            if (comics.length > 0) {
                const coverUrls = comics.map(c => c.cover).filter(Boolean);
                preCacheImages(coverUrls, 5);
            }

            return { page, comics, total: comics.length };
        } catch (error) {
            console.error('Page scrape error:', error);
            return { page: options.page || 1, comics: [], total: 0, error: error.message };
        }
    });

    ipcMain.handle('scrape-detail', async (event, options = {}) => {
        try {
            const { slug, url } = options;
            let targetUrl = (url || '').replace(/(^https?:\/)\/+/, '$1');

            if (!targetUrl && slug) {
                if (slug.match(/^https?:\/\//)) {
                    // slug is a full URL
                    targetUrl = slug;
                } else if (slug.startsWith('/')) {
                    // slug is a path — prepend baseUrl to make it absolute
                    targetUrl = `${fixBase(baseUrl)}${slug}`;
                } else {
                    // slug is just a segment
                    targetUrl = `${fixBase(baseUrl)}/${slug}`;
                }
            }

            if (!targetUrl) {
                return { error: 'Missing slug or url' };
            }

            const detail = await scrapeDetail(targetUrl);
            return detail;
        } catch (error) {
            console.error('Detail scrape error:', error);
            return { error: error.message };
        }
    });

    ipcMain.handle('get-sort-options', () => {
        return SORT_OPTIONS;
    });

    ipcMain.handle('get-config', () => {
        return { BASE_URL: baseUrl };
    });

    ipcMain.handle('debug-html', async (event, options = {}) => {
        const { page = 1, sort = 'top' } = options;
        const params = new URLSearchParams();
        params.append('sapxep', sort);
        params.append('page', page);
        const url = `${fixBase(baseUrl)}/danh-sach?${params.toString()}`;

        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html',
                },
                timeout: 30000,
                httpsAgent
            });

            const thumbMatch = response.data.match(/<div class="thumb-item-flow[^>]*>([\s\S]*?)<!-- \/\/ Tooltip -->/);
            return {
                url,
                sampleItem: thumbMatch ? thumbMatch[0].substring(0, 2000) : 'thumb-item not found',
                fullMatch: thumbMatch ? true : false
            };
        } catch (error) {
            return { error: error.message };
        }
    });

    ipcMain.handle('get-cached-image-map', () => {
        return getCachedImageMap();
    });

    ipcMain.handle('scrape-chapter', async (event, options = {}) => {
        const { url } = options;
        if (!url) return { error: 'Missing url' };

        const normalizedUrl = url.replace(/^\/+/, '/');
        const fullUrl = url.startsWith('http')
            ? url.replace(/([^:]\/)\/+/g, '$1')
            : `${baseUrl.replace(/\/$/, '')}${normalizedUrl}`;

        try {
            const chapter = await scrapeChapter(fullUrl);

            if (chapter && chapter.images.length > 0) {
                preCacheImages(chapter.images, 3);
            }

            return chapter;
        } catch (error) {
            console.error('Chapter scrape error:', error);
            return { error: error.message };
        }
    });

    ipcMain.handle('tts-google', async (event, options = {}) => {
        const { text, lang = 'vi' } = options;
        if (!text) return { error: 'Missing text' };

        const MAX_TTS_TEXT_LENGTH = 3800;
        const truncatedText = text.length > MAX_TTS_TEXT_LENGTH ? text.slice(0, MAX_TTS_TEXT_LENGTH) : text;

        const base64Audio = await fetchTTSNode(truncatedText, lang);
        if (!base64Audio) return { error: 'Google TTS returned no audio' };
        return { base64Audio };
    });

    ipcMain.handle('history-get', async () => {
        return await loadHistory(userDataPath);
    });

    ipcMain.handle('history-add', async (event, entry) => {
        if (!entry || !entry.chapterUrl) return { error: 'Invalid entry' };
        return await addHistoryEntry(userDataPath, entry);
    });

    ipcMain.handle('history-remove', async (event, chapterUrl) => {
        const history = await loadHistory(userDataPath);
        const filtered = history.filter(h => h.chapterUrl !== chapterUrl);
        await saveHistory(userDataPath, filtered);
        return filtered;
    });

    ipcMain.handle('history-clear', async () => {
        await saveHistory(userDataPath, []);
        return [];
    });
}

module.exports = {
    registerIpcHandlers,
    scrapeAll,
    buildUrl,
    clearCacheDir,
    scrapeDetail,
    extractDetail,
    scrapeChapter,
    extractChapter,
    loadHistory,
    addHistoryEntry
};
