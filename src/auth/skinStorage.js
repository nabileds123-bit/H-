var https = require('https');

function cleanEnv(value) {
    var text = String(value || '').trim();
    var first = text.charAt(0);
    var last = text.charAt(text.length - 1);

    if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
        text = text.slice(1, -1).trim();
    }

    return text;
}

function trimTrailingSlash(value) {
    return cleanEnv(value).replace(/\/+$/, '');
}

function encodeObjectPath(objectPath) {
    return String(objectPath || '')
        .split('/')
        .map(function(part) {
            return encodeURIComponent(part);
        })
        .join('/');
}

function getConfig() {
    return {
        url: trimTrailingSlash(process.env.SUPABASE_URL),
        key: cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY),
        bucket: cleanEnv(process.env.SUPABASE_BUCKET) || 'skins'
    };
}

function getConfigError() {
    var config = getConfig();

    if (!config.url) return 'SUPABASE_URL is missing.';
    if (!/^https:\/\/[^/]+\.supabase\.co$/i.test(config.url)) return 'SUPABASE_URL is not a valid Supabase project URL.';
    if (!config.key) return 'SUPABASE_SERVICE_ROLE_KEY is missing.';
    if (config.key.indexOf('>') !== -1 || config.key.split('.').length !== 3) {
        return 'SUPABASE_SERVICE_ROLE_KEY looks invalid or truncated.';
    }
    if (!config.bucket) return 'SUPABASE_BUCKET is missing.';

    return '';
}

function getPublicUrl(objectPath) {
    var config = getConfig();
    if (!config.url || !config.bucket || !objectPath) return '';

    return config.url + '/storage/v1/object/public/' +
        encodeURIComponent(config.bucket) + '/' + encodeObjectPath(objectPath);
}

function isConfigured() {
    return !getConfigError();
}

function uploadPng(objectPath, buffer, callback) {
    var config = getConfig();

    if (!isConfigured()) {
        return callback(new Error('Supabase storage is not configured.'));
    }

    var endpoint = config.url + '/storage/v1/object/' +
        encodeURIComponent(config.bucket) + '/' + encodeObjectPath(objectPath);
    var requestUrl = new URL(endpoint);
    var req = https.request({
        method: 'POST',
        hostname: requestUrl.hostname,
        path: requestUrl.pathname + requestUrl.search,
        headers: {
            apikey: config.key,
            Authorization: 'Bearer ' + config.key,
            'Content-Type': 'image/png',
            'Content-Length': buffer.length,
            'Cache-Control': '3600',
            'x-upsert': 'true'
        }
    }, function(res) {
        var body = '';

        res.on('data', function(chunk) {
            body += chunk;
        });

        res.on('end', function() {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                return callback(new Error('Supabase upload failed: ' + (body || res.statusCode)));
            }

            callback(null, {
                path: objectPath,
                url: getPublicUrl(objectPath)
            });
        });
    });

    req.on('error', callback);
    req.write(buffer);
    req.end();
}

module.exports = {
    getConfigError: getConfigError,
    getPublicUrl: getPublicUrl,
    isConfigured: isConfigured,
    uploadPng: uploadPng
};
