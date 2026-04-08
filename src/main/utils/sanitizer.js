// ============================================================
// XSS Prevention - HTML Sanitizer
// ============================================================
const ALLOWED_TAGS = new Set([
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'a', 'span', 'div', 'blockquote', 'pre', 'code',
    'img', 'figure', 'figcaption'
]);

const ALLOWED_ATTRS = {
    'a': new Set(['href', 'title', 'target']),
    'img': new Set(['src', 'alt', 'title', 'loading']),
    '*': new Set(['class', 'id'])
};

function sanitizeHtml(html) {
    if (!html || typeof html !== 'string') return '';

    let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    clean = clean.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    clean = clean.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
    clean = clean.replace(/javascript:/gi, '');
    clean = clean.replace(/\s*(?:src|href)\s*=\s*["']\s*javascript:[^"']*["']/gi, '');

    return clean;
}

function stripAllHtml(html) {
    if (!html) return '';
    return String(html).replace(/<[^>]+>/g, '').trim();
}

module.exports = {
    ALLOWED_TAGS,
    ALLOWED_ATTRS,
    sanitizeHtml,
    stripAllHtml
};
