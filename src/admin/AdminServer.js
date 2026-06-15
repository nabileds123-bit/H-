var fs = require('fs');
var path = require('path');
var url = require('url');
var passwords = require('../auth/password');
var users = require('../auth/userStore');
var adminStore = require('./adminStore');

var sessions = {};
var adminHtmlPath = path.join(__dirname, 'admin.html');
var collections = {
    premium: true,
    points: true,
    skins: true,
    guilds: true,
    notifications: true,
    highscores: true,
    battleMatches: true
};

function sendJson(res, status, body) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(body));
}

function sendHtml(res, status, html) {
    res.writeHead(status, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    res.end(html);
}

function readBody(req, callback) {
    var body = '';

    req.on('data', function(chunk) {
        body += chunk;
        if (body.length > 1024 * 128) {
            req.connection.destroy();
        }
    });

    req.on('end', function() {
        try {
            callback(null, body ? JSON.parse(body) : {});
        } catch (e) {
            callback(e);
        }
    });
}

function getCookie(req, name) {
    var cookies = String(req.headers.cookie || '').split(';');

    for (var i = 0; i < cookies.length; i++) {
        var pair = cookies[i].trim().split('=');
        if (pair[0] === name) return decodeURIComponent(pair.slice(1).join('=') || '');
    }

    return '';
}

function getAdminSession(req) {
    var token = getCookie(req, 'bubbleAdmin');
    var session = token && sessions[token];

    if (!session || session.expiresAt <= Date.now()) {
        if (token) delete sessions[token];
        return null;
    }

    session.expiresAt = Date.now() + 12 * 60 * 60 * 1000;
    return session;
}

function requireAdmin(req, res) {
    if (getAdminSession(req)) return true;
    sendJson(res, 401, { ok: false, message: 'Admin login required.' });
    return false;
}

function publicUser(user) {
    var copy = Object.assign({}, user);
    delete copy.passwordHash;
    delete copy.sessionToken;
    delete copy.verifyEmail;
    delete copy.resetPassword;
    return copy;
}

function normalizeUserChanges(body) {
    var changes = {};
    var allowed = [
        'username',
        'email',
        'emailVerified',
        'accountType',
        'premiumUntil',
        'points',
        'xp',
        'xpMax',
        'level',
        'cellColor',
        'guildTag',
        'skin',
        'banned',
        'banReason'
    ];

    allowed.forEach(function(key) {
        if (Object.prototype.hasOwnProperty.call(body, key)) {
            changes[key] = body[key];
        }
    });

    if (body.password) {
        changes.passwordHash = passwords.hashPassword(String(body.password));
    }

    return changes;
}

function handleLogin(req, res) {
    readBody(req, function(err, body) {
        if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.' });

        var username = process.env.ADMIN_USERNAME || 'admin';
        var password = process.env.ADMIN_PASSWORD || '';

        if (!password) {
            return sendJson(res, 503, { ok: false, message: 'ADMIN_PASSWORD is not configured.' });
        }

        if (String(body.username || '') !== username || String(body.password || '') !== password) {
            return sendJson(res, 401, { ok: false, message: 'Invalid admin credentials.' });
        }

        var token = passwords.createToken();
        sessions[token] = {
            username: username,
            expiresAt: Date.now() + 12 * 60 * 60 * 1000
        };

        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'Set-Cookie': 'bubbleAdmin=' + encodeURIComponent(token) + '; Path=/; HttpOnly; SameSite=Lax'
        });
        res.end(JSON.stringify({ ok: true, user: { username: username } }));
    });
}

function handleUsers(req, res, parts) {
    if (!requireAdmin(req, res)) return;

    if (req.method === 'GET' && parts.length === 0) {
        return sendJson(res, 200, {
            ok: true,
            items: users.listUsers().map(publicUser)
        });
    }

    if (req.method === 'POST' && parts.length === 0) {
        return readBody(req, function(err, body) {
            if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.' });
            if (!body.username || !body.email || !body.password) {
                return sendJson(res, 400, { ok: false, message: 'Username, email, and password are required.' });
            }

            var user = users.createUser({
                username: body.username,
                email: body.email,
                passwordHash: passwords.hashPassword(String(body.password)),
                verifyEmail: null
            });

            if (!user) return sendJson(res, 409, { ok: false, message: 'User already exists.' });

            user = users.updateUser(user.id, Object.assign({
                emailVerified: body.emailVerified !== false
            }, normalizeUserChanges(body)));
            sendJson(res, 200, { ok: true, item: publicUser(user) });
        });
    }

    if (parts.length === 1 && req.method === 'PUT') {
        return readBody(req, function(err, body) {
            if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.' });

            var user = users.updateUser(parts[0], normalizeUserChanges(body));
            if (!user) return sendJson(res, 404, { ok: false, message: 'User not found.' });
            sendJson(res, 200, { ok: true, item: publicUser(user) });
        });
    }

    if (parts.length === 1 && req.method === 'DELETE') {
        if (!users.deleteUser(parts[0])) {
            return sendJson(res, 404, { ok: false, message: 'User not found.' });
        }
        return sendJson(res, 200, { ok: true });
    }

    sendJson(res, 404, { ok: false, message: 'User route not found.' });
}

function handleCollection(req, res, collection, parts) {
    if (!collections[collection]) return sendJson(res, 404, { ok: false, message: 'Collection not found.' });
    if (!requireAdmin(req, res)) return;

    if (req.method === 'GET' && parts.length === 0) {
        return sendJson(res, 200, { ok: true, items: adminStore.list(collection) });
    }

    if (req.method === 'POST' && parts.length === 0) {
        return readBody(req, function(err, body) {
            if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.' });
            sendJson(res, 200, { ok: true, item: adminStore.create(collection, body) });
        });
    }

    if (parts.length === 1 && req.method === 'PUT') {
        return readBody(req, function(err, body) {
            if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.' });

            var item = adminStore.update(collection, parts[0], body);
            if (!item) return sendJson(res, 404, { ok: false, message: 'Item not found.' });
            sendJson(res, 200, { ok: true, item: item });
        });
    }

    if (parts.length === 1 && req.method === 'DELETE') {
        if (!adminStore.remove(collection, parts[0])) {
            return sendJson(res, 404, { ok: false, message: 'Item not found.' });
        }
        return sendJson(res, 200, { ok: true });
    }

    sendJson(res, 404, { ok: false, message: 'Admin route not found.' });
}

function handle(req, res) {
    var parsed = url.parse(req.url, true);
    var pathname = parsed.pathname;

    if (pathname === '/admin' || pathname === '/admin/') {
        sendHtml(res, 200, fs.readFileSync(adminHtmlPath, 'utf8'));
        return true;
    }

    if (pathname.indexOf('/api/admin/') !== 0) {
        return false;
    }

    if (req.method === 'POST' && pathname === '/api/admin/login') {
        handleLogin(req, res);
        return true;
    }

    if (req.method === 'POST' && pathname === '/api/admin/logout') {
        var token = getCookie(req, 'bubbleAdmin');
        if (token) delete sessions[token];
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'Set-Cookie': 'bubbleAdmin=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'
        });
        res.end(JSON.stringify({ ok: true }));
        return true;
    }

    if (req.method === 'GET' && pathname === '/api/admin/session') {
        var session = getAdminSession(req);
        sendJson(res, 200, { ok: true, authenticated: !!session, user: session ? { username: session.username } : null });
        return true;
    }

    var parts = pathname.replace('/api/admin/', '').split('/').filter(Boolean);
    var collection = parts.shift();

    if (collection === 'users') {
        handleUsers(req, res, parts);
        return true;
    }

    handleCollection(req, res, collection, parts);
    return true;
}

module.exports = {
    handle: handle
};
