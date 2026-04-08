// ============================================================
// Image Cache - In-Memory Only
// ============================================================
const axios = require('axios');
const path = require('path');
const https = require('https');
const { MAX_CACHE_SIZE, IMAGE_CACHE_TIMEOUT, DEFAULT_HEADERS } = require('./constants');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

let imageCache = new Map();
let currentCacheSize = 0;

function clearCacheDir() {
    imageCache.clear();
    currentCacheSize = 0;
    console.log('Image memory cache cleared');
}

function evictIfNeeded(requiredSpace) {
    while (currentCacheSize + requiredSpace > MAX_CACHE_SIZE && imageCache.size > 0) {
        const firstKey = imageCache.keys().next().value;
        const entry = imageCache.get(firstKey);
        if (entry) {
            currentCacheSize -= entry.size;
            imageCache.delete(firstKey);
        }
    }
}

async function cacheImage(url) {
    if (!url) return url;

    if (imageCache.has(url)) {
        const entry = imageCache.get(url);
        const ext = path.extname(new URL(url).pathname) || '.jpg';
        const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        return `data:${mimeType};base64,${entry.data.toString('base64')}`;
    }

    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: IMAGE_CACHE_TIMEOUT,
            headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] },
            httpsAgent
        });

        const imageBuffer = Buffer.from(response.data);
        const imageSize = imageBuffer.length;

        evictIfNeeded(imageSize);

        imageCache.set(url, { data: imageBuffer, size: imageSize });
        currentCacheSize += imageSize;

        const ext = path.extname(new URL(url).pathname) || '.jpg';
        const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        return `data:${mimeType};base64,${imageBuffer.toString('base64')}`;

    } catch (error) {
        console.error('Cache failed:', url.substring(0, 60), error.message);
        return url;
    }
}

async function preCacheImages(urls, concurrency = 5) {
    const results = [];
    for (let i = 0; i < urls.length; i += concurrency) {
        const batch = urls.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map(url => cacheImage(url)));
        results.push(...batchResults);
    }
    return results;
}

function getCachedImageMap() {
    const map = {};
    for (const [url, entry] of imageCache) {
        const ext = path.extname(new URL(url).pathname) || '.jpg';
        const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        map[url] = `data:${mimeType};base64,${entry.data.toString('base64')}`;
    }
    return map;
}

module.exports = {
    cacheImage,
    preCacheImages,
    clearCacheDir,
    getCachedImageMap
};
