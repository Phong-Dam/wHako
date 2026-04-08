// ============================================================
// Encoding / Decoding Utilities
// ============================================================
const _ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64Decode(s) {
    s = String(s);
    if (s.length === 0) return "";
    if (s.length % 4 !== 0) throw new Error("Invalid base64 length");

    let pads = 0;
    if (s.charAt(s.length - 1) === "=") pads = 1;
    if (s.charAt(s.length - 2) === "=") pads = 2;

    const imax = s.length - 4;
    const result = [];

    for (let i = 0; i < imax; i += 4) {
        const b10 = (_ALPHA.indexOf(s.charAt(i)) << 18) |
                    (_ALPHA.indexOf(s.charAt(i + 1)) << 12) |
                    (_ALPHA.indexOf(s.charAt(i + 2)) << 6) |
                    _ALPHA.indexOf(s.charAt(i + 3));
        result.push(String.fromCharCode(b10 >> 16));
        result.push(String.fromCharCode((b10 >> 8) & 255));
        result.push(String.fromCharCode(b10 & 255));
    }

    const idx = imax;
    if (pads === 1) {
        const b10 = (_ALPHA.indexOf(s.charAt(idx)) << 18) |
                    (_ALPHA.indexOf(s.charAt(idx + 1)) << 12) |
                    (_ALPHA.indexOf(s.charAt(idx + 2)) << 6);
        result.push(String.fromCharCode(b10 >> 16));
        result.push(String.fromCharCode((b10 >> 8) & 255));
    } else if (pads === 2) {
        const b10 = (_ALPHA.indexOf(s.charAt(idx)) << 18) |
                    (_ALPHA.indexOf(s.charAt(idx + 1)) << 12);
        result.push(String.fromCharCode(b10 >> 16));
    }

    return result.join("");
}

function stringToBytes(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        if (c < 128) {
            bytes.push(c);
        } else if (c < 2048) {
            bytes.push(192 | (c >> 6));
            bytes.push(128 | (c & 63));
        } else if (c < 65536) {
            bytes.push(224 | (c >> 12));
            bytes.push(128 | ((c >> 6) & 63));
            bytes.push(128 | (c & 63));
        } else {
            bytes.push(240 | (c >> 18));
            bytes.push(128 | ((c >> 12) & 63));
            bytes.push(128 | ((c >> 6) & 63));
            bytes.push(128 | (c & 63));
        }
    }
    return bytes;
}

function bytesToString(bytes) {
    let out = "";
    let i = 0;
    while (i < bytes.length) {
        const c = bytes[i++];
        if (c < 128) {
            out += String.fromCharCode(c);
        } else if (c < 224) {
            out += String.fromCharCode((c & 31) << 6 | bytes[i++] & 63);
        } else if (c < 240) {
            out += String.fromCharCode((c & 15) << 12 | (bytes[i++] & 63) << 6 | bytes[i++] & 63);
        } else {
            const codePoint = (c & 7) << 18 | (bytes[i++] & 63) << 12 | (bytes[i++] & 63) << 6 | bytes[i++] & 63;
            out += String.fromCharCode(55296 + (codePoint >> 10), 56320 + (codePoint & 1023));
        }
    }
    return out;
}

function xorDecode(chunk, key) {
    const decoded = base64Decode(chunk);
    const bytes = [];
    for (let i = 0; i < decoded.length; i++) {
        bytes.push(decoded.charCodeAt(i) & 255);
    }

    const output = [];
    for (let i = 0; i < bytes.length; i++) {
        output.push(bytes[i] ^ key.charCodeAt(i % key.length));
    }

    return bytesToString(output);
}

function decodeChapterContent(html) {
    const sMatch = html.match(/data-s="([^"]+)"/);
    const kMatch = html.match(/data-k="([^"]+)"/);

    if (!sMatch || !kMatch) return null;

    const method = sMatch[1];
    const key = kMatch[1];

    const dataCMatch = html.match(/data-c="(\[.*?\])"/s);
    if (!dataCMatch) return null;

    let dataCValue = dataCMatch[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&#91;/g, '[')
        .replace(/&#93;/g, ']');

    let chunks;
    try {
        chunks = JSON.parse(dataCValue);
    } catch (e) {
        console.log('JSON parse failed for data-c');
        return null;
    }

    if (!Array.isArray(chunks) || chunks.length === 0) return null;

    chunks.sort((a, b) => {
        return parseInt(a.substring(0, 4), 10) - parseInt(b.substring(0, 4), 10);
    });

    let content = "";
    for (let i = 0; i < chunks.length; i++) {
        const part = chunks[i].substring(4);

        if (method === "xor_shuffle") {
            content += xorDecode(part, key);
        } else {
            try {
                content += base64Decode(part);
            } catch (e) { /* skip */ }
        }
    }

    content = content.replace(/\[note(\d+)]/gi, '<span class="note-ref">[$1]</span>');
    return content;
}

module.exports = {
    base64Decode,
    stringToBytes,
    bytesToString,
    xorDecode,
    decodeChapterContent
};
