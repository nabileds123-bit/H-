var url = require('url');
var passwords = require('./password');
var users = require('./userStore');
var email = require('./email');
var skinStorage = require('./skinStorage');

var VERIFY_EXPIRES = 24 * 60 * 60 * 1000;
var RESET_EXPIRES = 60 * 60 * 1000;
var PLAYER_SKIN_COST = 150;
var GUILD_SKIN_COST = 50;
var PREMIUM_COST = 500;
var PREMIUM_DAYS = 7;
var MAX_SKIN_BYTES = 2 * 1024 * 1024;
var CELL_COLORS = [
    '#000000',
    '#6FCA36',
    '#4379EF',
    '#98B6FD',
    '#36D2D6',
    '#6DE5B7',
    '#41B136',
    '#FBD348',
    '#FFAE6A',
    '#D61017',
    '#D9A5FC'
];

function sendJson(res, status, body) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    });
    res.end(JSON.stringify(body));
}

function sendHtml(res, status, html) {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
}

function readBody(req, callback, maxBytes) {
    var body = '';
    var limit = maxBytes || 1024 * 32;
    var tooLarge = false;

    req.on('data', function(chunk) {
        if (tooLarge) return;
        body += chunk;
        if (body.length > limit) {
            tooLarge = true;
            callback({ status: 413, message: 'Request body is too large.' });
        }
    });

    req.on('end', function() {
        if (tooLarge) return;

        try {
            callback(null, body ? JSON.parse(body) : {});
        } catch (e) {
            callback(e);
        }
    });
}

function isValidUsername(username) {
    return /^[a-zA-Z0-9 ]{1,15}$/.test(username || '');
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value || '');
}

function isGmailEmail(value) {
    return /^[^\s@]+@gmail\.com$/i.test(value || '');
}

function isValidPassword(value) {
    return typeof value === 'string' && value.length >= 6 && value.length <= 72;
}

function normalizeCellColor(value) {
    var color = String(value || '').trim().toUpperCase();
    return CELL_COLORS.indexOf(color) !== -1 ? color : null;
}

function isPremiumActive(user) {
    if (String(user.accountType || '').toLowerCase() !== 'premium') return false;

    var premiumUntil = String(user.premiumUntil || '').trim();
    if (!premiumUntil) return true;

    var expiresAt = Date.parse(premiumUntil);
    if (isNaN(expiresAt)) {
        expiresAt = parseInt(premiumUntil, 10);
    }

    return !expiresAt || expiresAt > Date.now();
}

function publicAuthUser(user, lastLoginAt) {
    return {
        username: user.username,
        email: user.email,
        lastLoginAt: lastLoginAt || user.lastLoginAt || Date.now(),
        cellColor: user.cellColor || '#000000',
        accountType: user.accountType || 'Free',
        premiumUntil: user.premiumUntil || '',
        points: parseInt(user.points, 10) || 0,
        xp: parseInt(user.xp, 10) || 0,
        xpMax: parseInt(user.xpMax, 10) || 0,
        level: parseInt(user.level, 10) || 1,
        skin: user.skin || '',
        skinUrl: user.skinUrl || '',
        skinPath: user.skinPath || '',
        activeSkinType: user.activeSkinType || 'player',
        guildTag: user.guildTag || '',
        guildSkinUrl: user.guildSkinUrl || '',
        guildSkinPath: user.guildSkinPath || ''
    };
}

function safeSkinSegment(value, fallback) {
    var text = String(value || fallback || '').trim().toLowerCase();
    text = text.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    return text || String(fallback || 'skin').toLowerCase();
}

function decodePngDataUrl(dataUrl) {
    var match = /^data:image\/png;base64,([a-z0-9+/=\r\n]+)$/i.exec(String(dataUrl || ''));
    if (!match) return null;

    var buffer = Buffer.from(match[1].replace(/\s/g, ''), 'base64');
    if (!buffer.length || buffer.length > MAX_SKIN_BYTES) return null;
    if (buffer.length < 8 ||
        buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47 ||
        buffer[4] !== 0x0d || buffer[5] !== 0x0a || buffer[6] !== 0x1a || buffer[7] !== 0x0a) {
        return null;
    }

    return buffer;
}

function handleRegister(req, res) {
    readBody(req, function(err, body) {
        if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.' });

        var username = String(body.username || '').trim();
        var userEmail = String(body.email || '').trim().toLowerCase();
        var password = String(body.password || '');

        if (!isValidUsername(username)) {
            return sendJson(res, 400, { ok: false, message: 'Username must be 1-15 letters, numbers, or spaces. Underscore is not allowed.' });
        }

        if (!isValidEmail(userEmail)) {
            return sendJson(res, 400, { ok: false, message: 'Email is not valid.' });
        }

        if (!isGmailEmail(userEmail)) {
            return sendJson(res, 400, { ok: false, message: 'Email must use @gmail.com.' });
        }

        if (!isValidPassword(password)) {
            return sendJson(res, 400, { ok: false, message: 'Password must be at least 6 characters.' });
        }

        var token = passwords.createToken();
        var user = users.createUser({
            username: username,
            email: userEmail,
            passwordHash: passwords.hashPassword(password),
            verifyEmail: {
                token: token,
                expiresAt: Date.now() + VERIFY_EXPIRES
            }
        });

        if (!user) {
            return sendJson(res, 409, { ok: false, message: 'Username or email already exists.' });
        }

        email.sendVerificationEmail(req, user, token, function(mailErr) {
            if (mailErr) {
                console.log('[Auth] Verification email failed: %s', mailErr.message);
                return sendJson(res, 500, { ok: false, message: 'Account created, but verification email failed.' });
            }

            sendJson(res, 200, { ok: true, message: 'Register success. Please check your email to verify your account.' });
        });
    });
}

function handleVerifyEmail(req, res, query) {
    var token = query.token;
    var user = users.findByToken('verifyEmail', token);

    if (!user) {
        return sendHtml(res, 400, '<h3>Verification link is invalid or expired.</h3>');
    }

    users.updateUser(user.id, {
        emailVerified: true,
        verifyEmail: null
    });

    sendHtml(res, 200, '<h3>Email verified.</h3><p>You can close this page and login to Bubble.am.</p>');
}

function handleLogin(req, res) {
    readBody(req, function(err, body) {
        if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.' });

        var identifier = String(body.username || '').trim();
        var password = String(body.password || '');
        var user = users.findByUsernameOrEmail(identifier);

        if (!user || !passwords.verifyPassword(password, user.passwordHash)) {
            return sendJson(res, 401, { ok: false, message: 'Username or password is wrong.' });
        }

        if (!user.emailVerified && process.env.AUTH_BYPASS_EMAIL_VERIFICATION !== 'true') {
            return sendJson(res, 403, { ok: false, message: 'Please verify your email first.' });
        }

        var sessionToken = passwords.createToken();
        var lastLoginAt = Date.now();
        users.updateUser(user.id, {
            sessionToken: sessionToken,
            sessionCreatedAt: lastLoginAt,
            lastLoginAt: lastLoginAt
        });

        sendJson(res, 200, {
            ok: true,
            message: 'Login success.',
            token: sessionToken,
            user: publicAuthUser(user, lastLoginAt)
        });
    });
}

function handleForgotPassword(req, res) {
    readBody(req, function(err, body) {
        if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.' });

        var userEmail = String(body.email || '').trim().toLowerCase();
        var user = users.findByEmail(userEmail);

        if (!user) {
            return sendJson(res, 200, { ok: true, message: 'If the email exists, a reset link has been sent.' });
        }

        var token = passwords.createToken();
        user = users.updateUser(user.id, {
            resetPassword: {
                token: token,
                expiresAt: Date.now() + RESET_EXPIRES
            }
        });

        email.sendResetPasswordEmail(req, user, token, function(mailErr) {
            if (mailErr) {
                console.log('[Auth] Reset email failed: %s', mailErr.message);
                return sendJson(res, 500, { ok: false, message: 'Reset email failed.' });
            }

            sendJson(res, 200, { ok: true, message: 'If the email exists, a reset link has been sent.' });
        });
    });
}

function handleResetPassword(req, res) {
    readBody(req, function(err, body) {
        if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.' });

        var token = String(body.token || '');
        var password = String(body.password || '');
        var user = users.findByToken('resetPassword', token);

        if (!user) {
            return sendJson(res, 400, { ok: false, message: 'Reset link is invalid or expired.' });
        }

        if (!isValidPassword(password)) {
            return sendJson(res, 400, { ok: false, message: 'Password must be at least 6 characters.' });
        }

        users.updateUser(user.id, {
            passwordHash: passwords.hashPassword(password),
            resetPassword: null
        });

        sendJson(res, 200, { ok: true, message: 'Password has been updated. Please login.' });
    });
}

function handleChangePassword(req, res) {
    readBody(req, function(err, body) {
        if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.' });

        var token = String(body.token || '');
        var currentPassword = String(body.currentPassword || '');
        var newPassword = String(body.newPassword || '');
        var user = users.findBySessionToken(token);

        if (!user) {
            return sendJson(res, 401, { ok: false, message: 'Please login again.' });
        }

        if (!passwords.verifyPassword(currentPassword, user.passwordHash)) {
            return sendJson(res, 401, { ok: false, message: 'Current password is wrong.' });
        }

        if (!isValidPassword(newPassword)) {
            return sendJson(res, 400, { ok: false, message: 'New password must be at least 6 characters.' });
        }

        users.updateUser(user.id, {
            passwordHash: passwords.hashPassword(newPassword)
        });

        sendJson(res, 200, { ok: true, message: 'Password has been changed.' });
    });
}

function handleCellColor(req, res) {
    readBody(req, function(err, body) {
        if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.' });

        var token = String(body.token || '');
        var color = normalizeCellColor(body.color);
        var user = users.findBySessionToken(token);

        if (!user) {
            return sendJson(res, 401, { ok: false, message: 'Please login again.' });
        }

        if (!color) {
            return sendJson(res, 400, { ok: false, message: 'Cell color is not allowed.' });
        }

        users.updateUser(user.id, {
            cellColor: color
        });

        sendJson(res, 200, { ok: true, message: 'Cell color saved.', cellColor: color });
    });
}

function handleProfile(req, res) {
    readBody(req, function(err, body) {
        if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.' });

        var token = String(body.token || '');
        var user = users.findBySessionToken(token);

        if (!user) {
            return sendJson(res, 401, { ok: false, message: 'Please login again.' });
        }

        sendJson(res, 200, {
            ok: true,
            user: publicAuthUser(user)
        });
    });
}

function handleActiveSkin(req, res) {
    readBody(req, function(err, body) {
        if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.' });

        var token = String(body.token || '');
        var type = String(body.type || 'player').toLowerCase();
        var user = users.findBySessionToken(token);

        if (!user) {
            return sendJson(res, 401, { ok: false, message: 'Please login again.' });
        }

        if (type !== 'player' && type !== 'guild') {
            return sendJson(res, 400, { ok: false, message: 'Skin type is not valid.' });
        }

        if (type === 'player' && !user.skinUrl) {
            return sendJson(res, 400, { ok: false, message: 'Upload player skin first.' });
        }

        if (type === 'guild' && (!user.guildTag || !user.guildSkinUrl)) {
            return sendJson(res, 400, { ok: false, message: 'Upload guild skin first.' });
        }

        var updatedUser = users.updateUser(user.id, {
            activeSkinType: type
        });

        sendJson(res, 200, {
            ok: true,
            message: 'Active skin saved.',
            user: publicAuthUser(updatedUser)
        });
    });
}

function handleUploadSkin(req, res) {
    readBody(req, function(err, body) {
        if (err) return sendJson(res, err.status || 400, { ok: false, message: err.message || 'Invalid request.' });

        var token = String(body.token || '');
        var type = String(body.type || 'player').toLowerCase();
        var user = users.findBySessionToken(token);
        var buffer = decodePngDataUrl(body.dataUrl);

        if (!user) {
            return sendJson(res, 401, { ok: false, message: 'Please login again.' });
        }

        if (type !== 'player' && type !== 'guild') {
            return sendJson(res, 400, { ok: false, message: 'Skin type is not valid.' });
        }

        if (!buffer) {
            return sendJson(res, 400, { ok: false, message: 'Skin must be a PNG file and max 2MB.' });
        }

        if (!skinStorage.isConfigured()) {
            return sendJson(res, 503, { ok: false, message: 'Supabase storage is not configured.' });
        }

        var cost = type === 'guild' ? GUILD_SKIN_COST : PLAYER_SKIN_COST;
        var currentPoints = parseInt(user.points, 10) || 0;
        if (currentPoints < cost) {
            return sendJson(res, 400, {
                ok: false,
                message: 'Points tidak cukup. Butuh ' + cost + ' points.'
            });
        }

        var name = type === 'guild'
            ? safeSkinSegment(body.guildTag || user.guildTag, user.username)
            : safeSkinSegment(user.username, user.id);
        var objectPath = type + '/' + name + '-' + Date.now() + '.png';

        skinStorage.uploadPng(objectPath, buffer, function(uploadErr, result) {
            if (uploadErr) {
                console.log('[Auth] Skin upload failed: %s', uploadErr.message);
                return sendJson(res, 502, { ok: false, message: uploadErr.message });
            }

            var changes = {
                points: currentPoints - cost
            };

            if (type === 'guild') {
                changes.guildTag = String(body.guildTag || user.guildTag || '').trim();
                changes.guildSkinUrl = result.url;
                changes.guildSkinPath = result.path;
                changes.guildSkinUploadedAt = Date.now();
                if (!user.skinUrl) changes.activeSkinType = 'guild';
            } else {
                changes.skin = user.username;
                changes.skinUrl = result.url;
                changes.skinPath = result.path;
                changes.skinUploadedAt = Date.now();
                changes.activeSkinType = user.activeSkinType || 'player';
            }

            var updatedUser = users.updateUser(user.id, changes);
            sendJson(res, 200, {
                ok: true,
                message: (type === 'guild' ? 'Guild skin' : 'Player skin') + ' uploaded. ' + cost + ' points deducted.',
                cost: cost,
                type: type,
                url: result.url,
                path: result.path,
                user: publicAuthUser(updatedUser)
            });
        });
    }, 1024 * 1024 * 4);
}

function handleBuyPremium(req, res) {
    readBody(req, function(err, body) {
        if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.' });

        var token = String(body.token || '');
        var user = users.findBySessionToken(token);

        if (!user) {
            return sendJson(res, 401, { ok: false, message: 'Please login again.' });
        }

        if (isPremiumActive(user)) {
            return sendJson(res, 400, {
                ok: false,
                message: 'Premium masih aktif. Tidak perlu membeli ulang sebelum expired.'
            });
        }

        var currentPoints = parseInt(user.points, 10) || 0;
        if (currentPoints < PREMIUM_COST) {
            return sendJson(res, 400, {
                ok: false,
                message: 'Points tidak cukup. Butuh ' + PREMIUM_COST + ' points untuk membeli Premium.'
            });
        }

        var now = Date.now();
        var premiumUntil = new Date(now + PREMIUM_DAYS * 24 * 60 * 60 * 1000).toISOString();
        var updatedUser = users.updateUser(user.id, {
            accountType: 'Premium',
            premiumUntil: premiumUntil,
            points: currentPoints - PREMIUM_COST
        });

        sendJson(res, 200, {
            ok: true,
            message: 'Premium aktif selama ' + PREMIUM_DAYS + ' hari. ' + PREMIUM_COST + ' points deducted.',
            cost: PREMIUM_COST,
            days: PREMIUM_DAYS,
            user: publicAuthUser(updatedUser)
        });
    });
}

function handle(req, res) {
    var parsed = url.parse(req.url, true);
    var pathname = parsed.pathname;

    if (pathname.indexOf('/api/auth/') !== 0) {
        return false;
    }

    if (req.method === 'OPTIONS') {
        sendJson(res, 200, { ok: true });
        return true;
    }

    if (req.method === 'POST' && pathname === '/api/auth/register') {
        handleRegister(req, res);
        return true;
    }

    if (req.method === 'POST' && pathname === '/api/auth/login') {
        handleLogin(req, res);
        return true;
    }

    if (req.method === 'POST' && pathname === '/api/auth/forgot-password') {
        handleForgotPassword(req, res);
        return true;
    }

    if (req.method === 'POST' && pathname === '/api/auth/reset-password') {
        handleResetPassword(req, res);
        return true;
    }

    if (req.method === 'POST' && pathname === '/api/auth/change-password') {
        handleChangePassword(req, res);
        return true;
    }

    if (req.method === 'POST' && pathname === '/api/auth/cell-color') {
        handleCellColor(req, res);
        return true;
    }

    if (req.method === 'POST' && pathname === '/api/auth/profile') {
        handleProfile(req, res);
        return true;
    }

    if (req.method === 'POST' && pathname === '/api/auth/active-skin') {
        handleActiveSkin(req, res);
        return true;
    }

    if (req.method === 'POST' && pathname === '/api/auth/upload-skin') {
        handleUploadSkin(req, res);
        return true;
    }

    if (req.method === 'POST' && pathname === '/api/auth/buy-premium') {
        handleBuyPremium(req, res);
        return true;
    }

    if (req.method === 'GET' && pathname === '/api/auth/verify-email') {
        handleVerifyEmail(req, res, parsed.query);
        return true;
    }

    sendJson(res, 404, { ok: false, message: 'Auth route not found.' });
    return true;
}

module.exports = {
    handle: handle
};
