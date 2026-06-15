var https = require('https');

function trimTrailingSlash(value) {
    return String(value || '').replace(/\/+$/, '');
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
        key: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
        bucket: process.env.SUPABASE_BUCKET || 'skins'
    };
}

function getPublicUrl(objectPath) {
    var config = getConfig();
    if (!config.url || !config.bucket || !objectPath) return '';

    return config.url + '/storage/v1/object/public/' +
        encodeURIComponent(config.bucket) + '/' + encodeObjectPath(objectPath);
}

function isConfigured() {
    var config = getConfig();
    return !!(config.url && config.key && config.bucket);
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
    getPublicUrl: getPublicUrl,
    isConfigured: isConfigured,
    uploadPng: uploadPng
};
