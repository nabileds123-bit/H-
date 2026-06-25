var fs = require('fs');
var path = require('path');
var url = require('url');
var passwords = require('../auth/password');
var users = require('../auth/userStore');
var adminStore = require('./adminStore');
var StatsServer = require('../stats/StatsServer');
var ini = require('../modules/ini');
var battleTier = require('../battleTier');

var sessions = {};
var SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
var dataDir = path.join(__dirname, '..', '..', 'data');
var sessionsPath = path.join(dataDir, 'adminSessions.json');
var adminHtmlPath = path.join(__dirname, 'admin.html');
var configPath = path.join(__dirname, '..', '..', 'gameserver.ini');
var adminConfigPath = path.join(dataDir, 'adminConfig.json');
var collections = {
    premium: true,
    points: true,
    skins: true,
    guilds: true,
    guildWithdrawals: true,
    notifications: true,
    highscores: true,
    battleMatches: true
};

function ensureSessionStore() {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    if (!fs.existsSync(sessionsPath)) {
        fs.writeFileSync(sessionsPath, JSON.stringify({ sessions: {} }, null, 2));
    }
}

function readSessions() {
    ensureSessionStore();

    try {
        return JSON.parse(fs.readFileSync(sessionsPath, 'utf8')).sessions || {};
    } catch (e) {
        return {};
    }
}

function writeSessions(nextSessions) {
    ensureSessionStore();
    sessions = nextSessions || {};
    fs.writeFileSync(sessionsPath, JSON.stringify({ sessions: sessions }, null, 2));
}

sessions = readSessions();

function readConfig() {
    try {
        return ini.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
        return {};
    }
}

function readAdminConfigOverrides() {
    try {
        return JSON.parse(fs.readFileSync(adminConfigPath, 'utf8'));
    } catch (e) {
        return {};
    }
}

function writeAdminConfigOverride(key, value) {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    var overrides = readAdminConfigOverrides();
    overrides[key] = value;
    fs.writeFileSync(adminConfigPath, JSON.stringify(overrides, null, 2));
}

function readMergedConfig() {
    var config = readConfig();
    var overrides = readAdminConfigOverrides();

    for (var key in overrides) {
        if (Object.prototype.hasOwnProperty.call(overrides, key)) {
            config[key] = overrides[key];
        }
    }

    return config;
}

function configItems(config) {
    return Object.keys(config).sort().map(function(key) {
        return { id: key, key: key, value: config[key] };
    });
}

function normalizeConfigValue(value) {
    if (typeof value === 'number') return value;
    if (value === true || value === false) return value ? 1 : 0;

    var text = String(value == null ? '' : value);
    if (text !== '' && !isNaN(text)) {
        return parseFloat(text);
    }

    return text;
}

function writeConfigValue(key, value) {
    var text = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
    var lines = text.split(/\r?\n/);
    var found = false;
    var output = lines.map(function(line) {
        if (/^\s*[#;]/.test(line) || line.indexOf('=') === -1) return line;

        var currentKey = line.split('=')[0].trim();
        if (currentKey !== key) return line;

        found = true;
        return key + ' = ' + value;
    });

    if (!found) {
        output.push(key + ' = ' + value);
    }

    fs.writeFileSync(configPath, output.join('\n'));
}

function sendJson(res, status, body) {
    if (res.headersSent) return true;

    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(body));
    return true;
}

function sendHtml(res, status, html) {
    if (res.headersSent) return true;

    res.writeHead(status, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    res.end(html);
    return true;
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
        if (token) {
            delete sessions[token];
            writeSessions(sessions);
        }
        return null;
    }

    session.expiresAt = Date.now() + SESSION_TTL;
    writeSessions(sessions);
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
        'commandRole',
        'commandPermissions',
        'commandMass',
        'commandColor',
        'commandMerge',
        'commandTp',
        'commandSplit',
        'commandName',
        'commandPoint',
        'commandKick',
        'commandSay',
        'commandKillall',
        'commandPlayerlist',
        'commandStatus',
        'premiumChatColor',
        'premiumChatBadge',
        'premiumChatEffect',
        'premiumUntil',
        'points',
        'rankedWins',
        'rankedLosses',
        'rankedProgress',
        'rankedTier',
        'rankedModeStats',
        'xp',
        'xpMax',
        'level',
        'battleTier',
        'cellColor',
        'hideNickname',
        'guildTag',
        'skin',
        'skinUrl',
        'skinPath',
        'activeSkinType',
        'guildSkinUrl',
        'guildSkinPath',
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

    if (typeof changes.rankedModeStats === 'string') {
        try {
            changes.rankedModeStats = JSON.parse(changes.rankedModeStats);
        } catch (e) {
            delete changes.rankedModeStats;
        }
    }

    ['rankedWins', 'rankedLosses', 'rankedProgress'].forEach(function(key) {
        if (Object.prototype.hasOwnProperty.call(changes, key)) {
            changes[key] = Math.max(0, parseInt(changes[key], 10) || 0);
        }
    });

    if (Object.prototype.hasOwnProperty.call(changes, 'rankedTier')) {
        changes.rankedTier = normalizeBattleTier(changes.rankedTier);
    }

    if (Object.prototype.hasOwnProperty.call(changes, 'battleTier')) {
        changes.battleTier = normalizeBattleTier(changes.battleTier);
    }

    return changes;
}

function normalizeBattleTier(value) {
    return battleTier.normalizeTierName(value);
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
            expiresAt: Date.now() + SESSION_TTL
        };
        writeSessions(sessions);

        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'Set-Cookie': 'bubbleAdmin=' + encodeURIComponent(token) + '; Path=/; Max-Age=' + Math.floor(SESSION_TTL / 1000) + '; HttpOnly; SameSite=Lax'
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

function applyPointTransaction(body) {
    var username = String(body.username || '').trim();
    var amount = parseInt(body.amount, 10);
    var user = username ? users.findByIdOrUsernameOrEmail(username) : null;

    if (!user) {
        return { error: 'User not found. Use the account username, email, or id.' };
    }

    if (isNaN(amount) || amount === 0) {
        return { error: 'Amount must be a non-zero number.' };
    }

    var currentPoints = parseInt(user.points, 10) || 0;
    var nextPoints = currentPoints + amount;

    if (nextPoints < 0) {
        return { error: 'Points cannot be below 0.' };
    }

    var updatedUser = users.updateUser(user.id, {
        points: nextPoints
    });

    return {
        item: Object.assign({}, body, {
            username: updatedUser.username,
            amount: amount,
            userId: updatedUser.id,
            balanceBefore: currentPoints,
            balanceAfter: nextPoints,
            createdAt: body.createdAt || Date.now()
        })
    };
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

            if (collection === 'points') {
                var transaction = applyPointTransaction(body);
                if (transaction.error) {
                    return sendJson(res, 400, { ok: false, message: transaction.error });
                }

                return sendJson(res, 200, { ok: true, item: adminStore.create(collection, transaction.item) });
            }

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

function handleConfig(req, res, parts, gameServer) {
    if (!requireAdmin(req, res)) return;

    if (req.method === 'GET' && parts.length === 0) {
        return sendJson(res, 200, { ok: true, items: configItems(readMergedConfig()) });
    }

    if ((req.method === 'POST' && parts.length === 0) || (req.method === 'PUT' && parts.length === 1)) {
        return readBody(req, function(err, body) {
            if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.' });

            var key = req.method === 'PUT' ? parts[0] : String(body.key || '').trim();
            if (!/^[A-Za-z0-9_]+$/.test(key)) {
                return sendJson(res, 400, { ok: false, message: 'Config key is invalid.' });
            }

            var value = normalizeConfigValue(body.value);
            writeConfigValue(key, value);
            writeAdminConfigOverride(key, value);

            if (gameServer) {
                gameServer.config[key] = value;
                if (typeof gameServer.getModeConfig === 'function') {
                    if (gameServer.worlds[':x5']) gameServer.worlds[':x5'].config = gameServer.getModeConfig('x5');
                    if (gameServer.worlds[':hardcore:1']) gameServer.worlds[':hardcore:1'].config = gameServer.getModeConfig('hardcore');
                    if (gameServer.worlds[':hardcore:2']) gameServer.worlds[':hardcore:2'].config = gameServer.getModeConfig('hardcore');
                    if (gameServer.worlds[':teams']) gameServer.worlds[':teams'].config = gameServer.getModeConfig('teams');
                    if (gameServer.worlds[':experimental']) gameServer.worlds[':experimental'].config = gameServer.getModeConfig('experimental');
                    if (gameServer.worlds[':battle:1v1']) gameServer.worlds[':battle:1v1'].config = gameServer.getModeConfig('battle1v1');
                    if (gameServer.worlds[':battle:2v2']) gameServer.worlds[':battle:2v2'].config = gameServer.getModeConfig('battle2v2');
                }
            }

            sendJson(res, 200, { ok: true, item: { id: key, key: key, value: value } });
        });
    }

    if (req.method === 'DELETE' && parts.length === 1) {
        return sendJson(res, 400, { ok: false, message: 'Config delete is disabled for safety.' });
    }

    sendJson(res, 404, { ok: false, message: 'Config route not found.' });
}

function handle(req, res, gameServer) {
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
        if (token) {
            delete sessions[token];
            writeSessions(sessions);
        }
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

    if (StatsServer.adminHandle(req, res, requireAdmin, getAdminSession)) {
        return true;
    }

    if (collection === 'users') {
        handleUsers(req, res, parts);
        return true;
    }

    if (collection === 'config') {
        handleConfig(req, res, parts, gameServer);
        return true;
    }

    handleCollection(req, res, collection, parts);
    return true;
}

module.exports = {
    handle: handle,
    hasSession: function(req) {
        return !!getAdminSession(req);
    }
};
