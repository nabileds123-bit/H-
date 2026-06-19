var url = require('url');
var passwords = require('./password');
var users = require('./userStore');
var email = require('./email');
var skinStorage = require('./skinStorage');
var adminStore = require('../admin/adminStore');

var VERIFY_EXPIRES = 24 * 60 * 60 * 1000;
var RESET_EXPIRES = 60 * 60 * 1000;
var PLAYER_SKIN_COST = 150;
var GUILD_SKIN_COST = 50;
var PREMIUM_COST = 2;
var PREMIUM_DAYS = 7;
var MAX_PLAYER_SKIN_BYTES = 500 * 1024;
var MAX_GUILD_SKIN_BYTES = 200 * 1024;
var MAX_SKIN_BODY_BYTES = 1024 * 1024;
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

function normalizeCountryCode(value) {
    var code = String(value || '').trim().toUpperCase();
    if (code === 'XX' || code === 'T1') return '';
    return /^[A-Z]{2}$/.test(code) ? code : '';
}

function getRequestCountryCode(req) {
    return normalizeCountryCode(req && req.headers && req.headers['cf-ipcountry']);
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
        premiumChatColor: user.premiumChatColor || '',
        premiumChatBadge: user.premiumChatBadge || '',
        premiumChatEffect: user.premiumChatEffect || '',
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
        guildSkinPath: user.guildSkinPath || '',
        country_code: normalizeCountryCode(user.country_code || user.countryCode)
    };
}

function publicPlayerProfile(user) {
    return {
        username: user.username || '',
        lastLoginAt: user.lastLoginAt || user.updatedAt || user.createdAt || Date.now(),
        cellColor: user.cellColor || '#000000',
        accountType: user.accountType || 'Free',
        premiumChatColor: user.premiumChatColor || '',
        premiumChatBadge: user.premiumChatBadge || '',
        premiumChatEffect: user.premiumChatEffect || '',
        premiumUntil: user.premiumUntil || '',
        points: parseInt(user.points, 10) || 0,
        xp: parseInt(user.xp, 10) || 0,
        xpMax: parseInt(user.xpMax, 10) || 0,
        level: parseInt(user.level, 10) || 1,
        skin: user.skin || '',
        skinUrl: user.skinUrl || '',
        activeSkinType: user.activeSkinType || 'player',
        guildTag: user.guildTag || '',
        guildSkinUrl: user.guildSkinUrl || '',
        country_code: normalizeCountryCode(user.country_code || user.countryCode)
    };
}

function safeSkinSegment(value, fallback) {
    var text = String(value || fallback || '').trim().toLowerCase();
    text = text.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    return text || String(fallback || 'skin').toLowerCase();
}

function decodePngDataUrl(dataUrl, maxBytes) {
    var match = /^data:image\/png;base64,([a-z0-9+/=\r\n]+)$/i.exec(String(dataUrl || ''));
    if (!match) return null;

    var buffer = Buffer.from(match[1].replace(/\s/g, ''), 'base64');
    if (!buffer.length || buffer.length > maxBytes) return null;
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
            country_code: getRequestCountryCode(req),
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
        var changes = {
            sessionToken: sessionToken,
            sessionCreatedAt: lastLoginAt,
            lastLoginAt: lastLoginAt
        };
        var requestCountryCode = getRequestCountryCode(req);
        if (requestCountryCode) {
            changes.country_code = requestCountryCode;
        }
        user = users.updateUser(user.id, changes) || user;

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

function handleSearchPlayer(req, res) {
    readBody(req, function(err, body) {
        if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.' });

        var query = String(body.query || '').trim();
        if (!query) {
            return sendJson(res, 400, { ok: false, message: 'Nama player wajib diisi.' });
        }

        var user = users.findByUsernameOrEmail(query);
        if (!user || String(user.username || '').toLowerCase() !== query.toLowerCase()) {
            return sendJson(res, 404, { ok: false, message: 'Account was not found.' });
        }

        sendJson(res, 200, {
            ok: true,
            user: publicPlayerProfile(user)
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
        var maxSkinBytes = type === 'guild' ? MAX_GUILD_SKIN_BYTES : MAX_PLAYER_SKIN_BYTES;
        var maxSkinKb = type === 'guild' ? 200 : 500;
        var buffer = decodePngDataUrl(body.dataUrl, maxSkinBytes);

        if (!user) {
            return sendJson(res, 401, { ok: false, message: 'Please login again.' });
        }

        if (type !== 'player' && type !== 'guild') {
            return sendJson(res, 400, { ok: false, message: 'Skin type is not valid.' });
        }

        if (!buffer) {
            return sendJson(res, 400, { ok: false, message: 'Skin must be a PNG file and max ' + maxSkinKb + 'KB.' });
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

        var storageConfigError = skinStorage.getConfigError ? skinStorage.getConfigError() : '';
        if (storageConfigError || !skinStorage.isConfigured()) {
            return sendJson(res, 503, { ok: false, message: storageConfigError || 'Supabase storage is not configured.' });
        }

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
    }, MAX_SKIN_BODY_BYTES);
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

function createId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function normalizeGuildTag(value) {
    return String(value || '').trim().toUpperCase();
}

function isValidGuildTag(value) {
    return /^[A-Z0-9]{1,4}$/.test(normalizeGuildTag(value));
}

function isValidGuildName(value) {
    return /^[A-Za-z0-9 ]{1,32}$/.test(String(value || '').trim());
}

function findGuildByTag(tag) {
    var normalized = normalizeGuildTag(tag);
    if (!normalized) return null;

    return (adminStore.list('guilds') || []).filter(function(guild) {
        return normalizeGuildTag(guild.tag || guild.id || guild.name) === normalized;
    })[0] || null;
}

function parseGuildMembers(guild) {
    var source = guild && (guild.membersList || guild.membersJson || guild.memberList);
    var parsed = [];

    if (Array.isArray(source)) {
        parsed = source;
    } else if (typeof source === 'string' && source.trim()) {
        try {
            parsed = JSON.parse(source);
        } catch (e) {
            parsed = source.split(/\r?\n/).map(function(line) {
                var parts = line.split('|');
                return {
                    name: String(parts[0] || '').trim(),
                    role: String(parts[1] || 'member').trim(),
                    level: parseInt(parts[2], 10) || 1
                };
            });
        }
    }

    parsed = parsed.filter(function(member) {
        return member && String(member.name || member.username || '').trim();
    }).map(function(member) {
        var name = String(member.name || member.username || '').trim();
        return {
            id: String(member.id || member.userId || name),
            name: name,
            role: String(member.role || 'member').toLowerCase(),
            level: parseInt(member.level, 10) || 1
        };
    });

    var leaderName = String(guild && guild.leader || '').trim();
    if (leaderName) {
        var hasLeader = parsed.some(function(member) {
            return String(member.name || '').toLowerCase() === leaderName.toLowerCase();
        });
        if (!hasLeader) {
            parsed.unshift({
                id: leaderName,
                name: leaderName,
                role: 'leader',
                level: parseInt(guild.leaderLevel, 10) || 1
            });
        }
    }

    return parsed;
}

function serializeGuildMembers(members) {
    return JSON.stringify((members || []).map(function(member) {
        return {
            id: member.id || member.name,
            name: member.name,
            role: member.role || 'member',
            level: parseInt(member.level, 10) || 1
        };
    }));
}

function getGuildRole(user, guild) {
    if (!user || !guild) return 'guest';
    var userName = String(user.username || '').trim().toLowerCase();
    var userGuild = normalizeGuildTag(user.guildTag);
    var guildTag = normalizeGuildTag(guild.tag || guild.id || guild.name);

    if (!userName || !userGuild || userGuild !== guildTag) return 'guest';
    if (String(guild.leader || '').trim().toLowerCase() === userName) return 'leader';

    var member = parseGuildMembers(guild).filter(function(item) {
        return String(item.name || '').trim().toLowerCase() === userName;
    })[0];
    return member ? String(member.role || 'member').toLowerCase() : 'member';
}

function ensureGuildForUser(user) {
    var tag = normalizeGuildTag(user && user.guildTag);
    if (!tag) return null;

    var guild = findGuildByTag(tag);
    if (guild) return guild;

    return adminStore.create('guilds', {
        id: tag,
        name: tag + ' Guild',
        tag: tag,
        type: 'private',
        leader: user.username,
        leaderLevel: parseInt(user.level, 10) || 1,
        members: 1,
        membersList: serializeGuildMembers([{
            id: user.id,
            name: user.username,
            role: 'leader',
            level: parseInt(user.level, 10) || 1
        }]),
        description: '',
        logo: user.guildSkinUrl || ''
    });
}

function publicGuild(guild) {
    var logo = guild && (guild.logo || guild.guildSkinUrl || '');
    return guild ? {
        id: guild.id || guild.tag,
        name: guild.name || guild.tag || 'Guild',
        tag: normalizeGuildTag(guild.tag || guild.id || guild.name),
        type: guild.type || 'private',
        leader: guild.leader || '',
        leaderLevel: parseInt(guild.leaderLevel, 10) || 1,
        members: parseInt(guild.members, 10) || parseGuildMembers(guild).length || 1,
        membersList: guild.membersList || serializeGuildMembers(parseGuildMembers(guild)),
        description: guild.description || guild.bio || '',
        bio: guild.bio || guild.description || '',
        logo: logo,
        guildSkinUrl: logo
    } : null;
}

function publicInvite(invite) {
    var guild = findGuildByTag(invite.guild_tag || invite.guild_id);
    return {
        id: invite.id,
        guild_id: invite.guild_id,
        guild_tag: normalizeGuildTag(invite.guild_tag || invite.guild_id),
        guild_name: invite.guild_name || (guild && guild.name) || invite.guild_id,
        inviter_username: invite.inviter_username || '',
        target_user_id: invite.target_user_id,
        status: invite.status || 'pending',
        created_at: invite.created_at || invite.createdAt || Date.now()
    };
}

function pendingInvitesForUser(user) {
    return (adminStore.list('guildInvites') || []).filter(function(invite) {
        return invite.status === 'pending' && String(invite.target_user_id || '') === String(user.id || '');
    }).map(publicInvite);
}

function removeGuildInvites(guildTag) {
    (adminStore.list('guildInvites') || []).forEach(function(invite) {
        if (normalizeGuildTag(invite.guild_tag || invite.guild_id) === normalizeGuildTag(guildTag)) {
            adminStore.remove('guildInvites', invite.id);
        }
    });
}

function removeUserPendingInvites(userId) {
    (adminStore.list('guildInvites') || []).forEach(function(invite) {
        if (invite.status === 'pending' && String(invite.target_user_id || '') === String(userId || '')) {
            adminStore.remove('guildInvites', invite.id);
        }
    });
}

function handleGuildInvites(req, res, query) {
    var user = users.findBySessionToken(String(query.token || ''));
    if (!user) return sendJson(res, 401, { ok: false, message: 'You must login first.' });

    sendJson(res, 200, {
        ok: true,
        items: pendingInvitesForUser(user)
    });
}

function handleNotifications(req, res, query) {
    var user = users.findBySessionToken(String(query.token || ''));
    if (!user) return sendJson(res, 401, { ok: false, message: 'You must login first.' });
    var items = pendingInvitesForUser(user).map(function(invite) {
        return {
            id: 'guild-invite-' + invite.id,
            type: 'guild_invite',
            inviteId: invite.id,
            message: 'You have been invited to join [' + invite.guild_tag + '] ' + invite.guild_name,
            invite: invite
        };
    }).concat(getIncomingFriendRequests(user).map(function(friend) {
        return {
            id: 'friend-request-' + friend.id,
            type: 'friend_request',
            targetId: friend.id,
            inviteType: 'friend',
            entityId: friend.id,
            status: 'pending',
            title: 'Friend Invite',
            message: friend.username + ' sent you a friend request.',
            friend: publicFriendProfile(friend, 'incoming')
        };
    })).concat(getPendingBattleInvites(user).map(function(invite) {
        return {
            id: 'battle-invite-' + invite.id,
            type: 'battle_invite',
            inviteType: 'battle',
            entityId: invite.id,
            status: invite.status || 'pending',
            title: 'Battle Invite',
            message: (invite.fromUsername || 'Player') + ' invited you to play ' + (invite.mode || 'Battle') + '.',
            invite: invite
        };
    }));

    sendJson(res, 200, {
        ok: true,
        items: items,
        notifications: items
    });
}

function normalizeIdList(list) {
    var seen = {};
    var result = [];

    (Array.isArray(list) ? list : []).forEach(function(value) {
        var id = String(value || '').trim();
        if (id && !seen[id]) {
            seen[id] = true;
            result.push(id);
        }
    });

    return result;
}

function addId(list, id) {
    list = normalizeIdList(list);
    id = String(id || '').trim();
    if (id && list.indexOf(id) === -1) {
        list.push(id);
    }
    return list;
}

function removeId(list, id) {
    id = String(id || '').trim();
    return normalizeIdList(list).filter(function(value) {
        return value !== id;
    });
}

function hasId(list, id) {
    return normalizeIdList(list).indexOf(String(id || '').trim()) !== -1;
}

function publicFriendProfile(user, status) {
    var accepted = status === 'friend';
    return {
        id: user.id,
        username: user.username || 'Player',
        name: user.username || 'Player',
        nick: user.username || 'Player',
        status: accepted ? 'accepted' : (status || 'none'),
        relationStatus: status || 'none',
        online: !!user.sessionToken,
        inBattle: false,
        invitePending: false,
        level: parseInt(user.level, 10) || 1,
        accountType: user.accountType || 'Free',
        guildTag: user.guildTag || '',
        country_code: normalizeCountryCode(user.country_code || user.countryCode),
        lastLoginAt: user.lastLoginAt || user.updatedAt || user.createdAt || Date.now()
    };
}

function getIncomingFriendRequests(user) {
    var incoming = normalizeIdList(user.friendRequestsReceived);
    return users.listUsers().filter(function(item) {
        return item && incoming.indexOf(String(item.id || '')) !== -1;
    });
}

function getPendingBattleInvites(user) {
    var now = Date.now();
    return (Array.isArray(user.battleInvitesReceived) ? user.battleInvitesReceived : []).filter(function(invite) {
        return invite && invite.status === 'pending' && (!invite.expiresAt || invite.expiresAt > now);
    });
}

function getFriendStatus(user, other) {
    if (hasId(user.friends, other.id)) return 'friend';
    if (hasId(user.friendRequestsReceived, other.id)) return 'incoming';
    if (hasId(user.friendRequestsSent, other.id)) return 'outgoing';
    return 'none';
}

function buildFriendsPayload(user) {
    var current = users.findByIdOrUsernameOrEmail(user.id) || user;
    var items = users.listUsers()
        .filter(function(item) {
            return item && String(item.id || '') !== String(current.id || '');
        })
        .map(function(item) {
            return publicFriendProfile(item, getFriendStatus(current, item));
        });

    items.sort(function(a, b) {
        var order = { incoming: 0, friend: 1, outgoing: 2, none: 3 };
        var left = Object.prototype.hasOwnProperty.call(order, a.status) ? order[a.status] : 9;
        var right = Object.prototype.hasOwnProperty.call(order, b.status) ? order[b.status] : 9;
        var diff = left - right;
        if (diff) return diff;
        return String(a.username || '').localeCompare(String(b.username || ''));
    });

    return {
        ok: true,
        items: items,
        friends: items
    };
}

function handleFriendsList(req, res, query) {
    var user = users.findBySessionToken(String(query.token || ''));
    if (!user) return sendJson(res, 401, { ok: false, message: 'You must login first.' });

    sendJson(res, 200, buildFriendsPayload(user));
}

function handleFriendAdd(req, res) {
    readBody(req, function(err, body) {
        if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.' });

        var user = users.findBySessionToken(String(body.token || ''));
        if (!user) return sendJson(res, 401, { ok: false, message: 'You must login first.' });

        var target = users.findByIdOrUsernameOrEmail(String(body.target || body.targetId || body.username || '').trim());
        if (!target) return sendJson(res, 404, { ok: false, message: 'Player not found.' });
        if (String(target.id || '') === String(user.id || '')) {
            return sendJson(res, 400, { ok: false, message: 'You cannot add yourself.' });
        }

        user = users.findByIdOrUsernameOrEmail(user.id) || user;
        target = users.findByIdOrUsernameOrEmail(target.id) || target;

        if (hasId(user.friends, target.id)) {
            return sendJson(res, 409, { ok: false, message: 'Player is already your friend.' });
        }
        if (hasId(user.friendRequestsSent, target.id)) {
            return sendJson(res, 409, { ok: false, message: 'Friend request already pending.' });
        }
        if (hasId(user.friendRequestsReceived, target.id)) {
            return acceptFriendRequest(res, user, target);
        }

        users.updateUser(user.id, {
            friendRequestsSent: addId(user.friendRequestsSent, target.id)
        });
        users.updateUser(target.id, {
            friendRequestsReceived: addId(target.friendRequestsReceived, user.id)
        });

        sendJson(res, 200, Object.assign({ message: 'Friend request sent.' }, buildFriendsPayload(user)));
    });
}

function handleFriendInvite(req, res) {
    readBody(req, function(err, body) {
        if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.', error: 'Invalid request.' });

        body.target = body.target || body.targetId || body.username || body.playerName;
        handleFriendAddWithBody(res, body);
    });
}

function handleFriendAddWithBody(res, body) {
    var user = users.findBySessionToken(String(body.token || ''));
    if (!user) return sendJson(res, 401, { ok: false, message: 'You must login first.', error: 'You must login first.' });

    var target = users.findByIdOrUsernameOrEmail(String(body.target || body.targetId || body.username || body.playerName || '').trim());
    if (!target) return sendJson(res, 404, { ok: false, message: 'Player not found.', error: 'Player not found.' });
    if (String(target.id || '') === String(user.id || '')) {
        return sendJson(res, 400, { ok: false, message: 'You cannot add yourself.', error: 'You cannot add yourself.' });
    }

    user = users.findByIdOrUsernameOrEmail(user.id) || user;
    target = users.findByIdOrUsernameOrEmail(target.id) || target;

    if (hasId(user.friends, target.id)) {
        return sendJson(res, 409, { ok: false, message: 'Player is already your friend.', error: 'Already friends.' });
    }
    if (hasId(user.friendRequestsSent, target.id)) {
        return sendJson(res, 409, { ok: false, message: 'Friend request already pending.', error: 'Friend invitation already pending.' });
    }
    if (hasId(user.friendRequestsReceived, target.id)) {
        return acceptFriendRequest(res, user, target);
    }

    users.updateUser(user.id, {
        friendRequestsSent: addId(user.friendRequestsSent, target.id)
    });
    users.updateUser(target.id, {
        friendRequestsReceived: addId(target.friendRequestsReceived, user.id)
    });

    sendJson(res, 200, Object.assign({ message: 'Friend request sent.' }, buildFriendsPayload(user)));
}

function acceptFriendRequest(res, user, requester) {
    user = users.findByIdOrUsernameOrEmail(user.id) || user;
    requester = users.findByIdOrUsernameOrEmail(requester.id) || requester;

    if (!hasId(user.friendRequestsReceived, requester.id) && !hasId(requester.friendRequestsSent, user.id)) {
        return sendJson(res, 404, { ok: false, message: 'Friend request not found.' });
    }

    users.updateUser(user.id, {
        friends: addId(user.friends, requester.id),
        friendRequestsReceived: removeId(user.friendRequestsReceived, requester.id),
        friendRequestsSent: removeId(user.friendRequestsSent, requester.id)
    });
    users.updateUser(requester.id, {
        friends: addId(requester.friends, user.id),
        friendRequestsSent: removeId(requester.friendRequestsSent, user.id),
        friendRequestsReceived: removeId(requester.friendRequestsReceived, user.id)
    });

    sendJson(res, 200, Object.assign({ message: 'Friend request accepted.' }, buildFriendsPayload(user)));
}

function handleFriendAccept(req, res) {
    readBody(req, function(err, body) {
        if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.' });

        var user = users.findBySessionToken(String(body.token || ''));
        if (!user) return sendJson(res, 401, { ok: false, message: 'You must login first.' });

        var requester = users.findByIdOrUsernameOrEmail(String(body.target || body.targetId || body.username || '').trim());
        if (!requester) return sendJson(res, 404, { ok: false, message: 'Player not found.' });

        acceptFriendRequest(res, user, requester);
    });
}

function handleFriendRespond(req, res) {
    readBody(req, function(err, body) {
        if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.', error: 'Invalid request.' });

        if (body.accepted) {
            body.targetId = body.targetId || body.target || body.id;
            var user = users.findBySessionToken(String(body.token || ''));
            if (!user) return sendJson(res, 401, { ok: false, message: 'You must login first.', error: 'You must login first.' });
            var requester = users.findByIdOrUsernameOrEmail(String(body.targetId || '').trim());
            if (!requester) return sendJson(res, 404, { ok: false, message: 'Player not found.', error: 'Player not found.' });
            return acceptFriendRequest(res, user, requester);
        }

        body.targetId = body.targetId || body.target || body.id;
        return declineFriendRequestWithBody(res, body);
    });
}

function handleFriendDecline(req, res) {
    readBody(req, function(err, body) {
        if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.' });

        declineFriendRequestWithBody(res, body);
    });
}

function declineFriendRequestWithBody(res, body) {
        var user = users.findBySessionToken(String(body.token || ''));
        if (!user) return sendJson(res, 401, { ok: false, message: 'You must login first.', error: 'You must login first.' });

        var requester = users.findByIdOrUsernameOrEmail(String(body.target || body.targetId || body.username || '').trim());
        if (!requester) return sendJson(res, 404, { ok: false, message: 'Player not found.', error: 'Player not found.' });

        user = users.findByIdOrUsernameOrEmail(user.id) || user;
        requester = users.findByIdOrUsernameOrEmail(requester.id) || requester;

        users.updateUser(user.id, {
            friendRequestsReceived: removeId(user.friendRequestsReceived, requester.id)
        });
        users.updateUser(requester.id, {
            friendRequestsSent: removeId(requester.friendRequestsSent, user.id)
        });

        sendJson(res, 200, Object.assign({ message: 'Friend request declined.' }, buildFriendsPayload(user)));
}

function handleGuildInvite(req, res) {
    readBody(req, function(err, body) {
        if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.' });

        var user = users.findBySessionToken(String(body.token || ''));
        if (!user) return sendJson(res, 401, { ok: false, message: 'You must login first.' });

        var guild = ensureGuildForUser(user);
        if (!guild) return sendJson(res, 404, { ok: false, message: 'Guild not found.' });

        var role = getGuildRole(user, guild);
        if (role !== 'leader' && role !== 'staff') {
            return sendJson(res, 403, { ok: false, message: 'You do not have permission.' });
        }

        var target = users.findByUsernameOrEmail(String(body.target || body.username || '').trim());
        if (!target) return sendJson(res, 404, { ok: false, message: 'Target player not found.' });

        var guildTag = normalizeGuildTag(guild.tag || guild.id);
        if (normalizeGuildTag(target.guildTag) === guildTag) {
            return sendJson(res, 400, { ok: false, message: 'Player is already a member of this guild.' });
        }
        if (normalizeGuildTag(target.guildTag)) {
            return sendJson(res, 400, { ok: false, message: 'Player already in a guild.' });
        }

        var duplicate = (adminStore.list('guildInvites') || []).some(function(invite) {
            return invite.status === 'pending' &&
                String(invite.target_user_id || '') === String(target.id || '') &&
                normalizeGuildTag(invite.guild_tag || invite.guild_id) === guildTag;
        });
        if (duplicate) return sendJson(res, 409, { ok: false, message: 'Invite already pending.' });

        var invite = adminStore.create('guildInvites', {
            id: createId(),
            guild_id: guildTag,
            guild_tag: guildTag,
            guild_name: guild.name || guildTag,
            inviter_user_id: user.id,
            inviter_username: user.username,
            target_user_id: target.id,
            target_username: target.username,
            status: 'pending',
            created_at: Date.now()
        });

        sendJson(res, 200, { ok: true, message: 'Guild invite sent.', invite: publicInvite(invite) });
    });
}

function handleGuildCreate(req, res) {
    readBody(req, function(err, body) {
        if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.' });

        var user = users.findBySessionToken(String(body.token || ''));
        if (!user) return sendJson(res, 401, { ok: false, message: 'You must login first.' });

        var tag = normalizeGuildTag(body.tag);
        var name = String(body.name || '').trim();
        if (!isValidGuildName(name)) return sendJson(res, 400, { ok: false, message: 'Guild name is not valid.' });
        if (!isValidGuildTag(tag)) return sendJson(res, 400, { ok: false, message: 'Guild prefix is not valid.' });
        if (normalizeGuildTag(user.guildTag) && normalizeGuildTag(user.guildTag) !== tag) {
            return sendJson(res, 400, { ok: false, message: 'You are already in a guild.' });
        }
        if (findGuildByTag(tag)) return sendJson(res, 409, { ok: false, message: 'Guild prefix already exists.' });

        var guild = adminStore.create('guilds', {
            id: tag,
            name: name,
            tag: tag,
            type: String(body.type || 'private').trim() || 'private',
            leader: user.username,
            leaderLevel: parseInt(user.level, 10) || 1,
            members: 1,
            membersList: serializeGuildMembers([{
                id: user.id,
                name: user.username,
                role: 'leader',
                level: parseInt(user.level, 10) || 1
            }]),
            description: String(body.description || '').trim(),
            bio: String(body.description || '').trim(),
            logo: String(body.logo || '').trim(),
            guildSkinUrl: String(body.logo || '').trim()
        });

        var updatedUser = users.updateUser(user.id, {
            guildTag: tag,
            guildSkinUrl: guild.logo || user.guildSkinUrl || ''
        });

        sendJson(res, 200, {
            ok: true,
            message: 'Guild created.',
            guild: publicGuild(guild),
            user: publicAuthUser(updatedUser)
        });
    });
}

function handleGuildInviteAccept(req, res) {
    readBody(req, function(err, body) {
        if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.' });

        var user = users.findBySessionToken(String(body.token || ''));
        if (!user) return sendJson(res, 401, { ok: false, message: 'You must login first.' });
        if (normalizeGuildTag(user.guildTag)) return sendJson(res, 400, { ok: false, message: 'You are already in a guild.' });

        var invite = (adminStore.list('guildInvites') || []).filter(function(item) {
            return item.id === body.inviteId && item.status === 'pending' && String(item.target_user_id || '') === String(user.id || '');
        })[0];
        if (!invite) return sendJson(res, 404, { ok: false, message: 'Invite not found.' });

        var guild = findGuildByTag(invite.guild_tag || invite.guild_id);
        if (!guild) return sendJson(res, 404, { ok: false, message: 'Guild not found.' });

        var members = parseGuildMembers(guild);
        members.push({
            id: user.id,
            name: user.username,
            role: 'member',
            level: parseInt(user.level, 10) || 1
        });
        guild = adminStore.update('guilds', guild.id, {
            members: members.length,
            membersList: serializeGuildMembers(members)
        }) || guild;
        adminStore.remove('guildInvites', invite.id);
        removeUserPendingInvites(user.id);

        var updatedUser = users.updateUser(user.id, {
            guildTag: normalizeGuildTag(guild.tag || guild.id),
            guildSkinUrl: guild.logo || guild.guildSkinUrl || ''
        });

        sendJson(res, 200, {
            ok: true,
            message: 'Joined guild.',
            guild: publicGuild(guild),
            user: publicAuthUser(updatedUser)
        });
    });
}

function handleGuildInviteDecline(req, res) {
    readBody(req, function(err, body) {
        if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.' });

        var user = users.findBySessionToken(String(body.token || ''));
        if (!user) return sendJson(res, 401, { ok: false, message: 'You must login first.' });

        var invite = (adminStore.list('guildInvites') || []).filter(function(item) {
            return item.id === body.inviteId && item.status === 'pending' && String(item.target_user_id || '') === String(user.id || '');
        })[0];
        if (!invite) return sendJson(res, 404, { ok: false, message: 'Invite not found.' });

        adminStore.remove('guildInvites', invite.id);
        sendJson(res, 200, { ok: true, message: 'Guild invite declined.' });
    });
}

function handleGuildEdit(req, res) {
    readBody(req, function(err, body) {
        if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.' });

        var user = users.findBySessionToken(String(body.token || ''));
        if (!user) return sendJson(res, 401, { ok: false, message: 'You must login first.' });

        var guild = ensureGuildForUser(user);
        if (!guild) return sendJson(res, 404, { ok: false, message: 'Guild not found.' });
        if (getGuildRole(user, guild) !== 'leader') {
            return sendJson(res, 403, { ok: false, message: 'You do not have permission.' });
        }

        var nextName = String(body.name || '').trim();
        var nextTag = normalizeGuildTag(body.tag || guild.tag);
        if (!isValidGuildName(nextName)) return sendJson(res, 400, { ok: false, message: 'Guild name is not valid.' });
        if (!isValidGuildTag(nextTag)) return sendJson(res, 400, { ok: false, message: 'Guild prefix is not valid.' });

        var oldTag = normalizeGuildTag(guild.tag || guild.id);
        var duplicate = findGuildByTag(nextTag);
        if (duplicate && duplicate.id !== guild.id) {
            return sendJson(res, 409, { ok: false, message: 'Guild prefix already exists.' });
        }

        var updatedGuild = adminStore.update('guilds', guild.id, {
            name: nextName,
            tag: nextTag,
            description: String(body.description || '').trim(),
            bio: String(body.description || '').trim(),
            logo: String(body.logo || guild.logo || guild.guildSkinUrl || '').trim(),
            guildSkinUrl: String(body.logo || guild.guildSkinUrl || guild.logo || '').trim()
        }) || guild;

        if (oldTag !== nextTag) {
            users.listUsers().forEach(function(item) {
                if (normalizeGuildTag(item.guildTag) === oldTag) {
                    users.updateUser(item.id, { guildTag: nextTag });
                }
            });
            (adminStore.list('guildInvites') || []).forEach(function(invite) {
                if (normalizeGuildTag(invite.guild_tag || invite.guild_id) === oldTag) {
                    adminStore.update('guildInvites', invite.id, {
                        guild_id: nextTag,
                        guild_tag: nextTag,
                        guild_name: nextName
                    });
                }
            });
        }

        var updatedUser = users.findByIdOrUsernameOrEmail(user.id);
        sendJson(res, 200, {
            ok: true,
            message: 'Guild updated.',
            guild: publicGuild(updatedGuild),
            user: publicAuthUser(updatedUser)
        });
    });
}

function handleGuildDelete(req, res) {
    readBody(req, function(err, body) {
        if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.' });

        var user = users.findBySessionToken(String(body.token || ''));
        if (!user) return sendJson(res, 401, { ok: false, message: 'You must login first.' });

        var guild = ensureGuildForUser(user);
        if (!guild) return sendJson(res, 404, { ok: false, message: 'Guild not found.' });
        if (getGuildRole(user, guild) !== 'leader') {
            return sendJson(res, 403, { ok: false, message: 'You do not have permission.' });
        }

        var guildTag = normalizeGuildTag(guild.tag || guild.id);
        if (normalizeGuildTag(body.confirm || '') !== guildTag && String(body.confirm || '').trim() !== String(guild.name || '').trim()) {
            return sendJson(res, 400, { ok: false, message: 'Guild delete confirmation did not match.' });
        }

        users.listUsers().forEach(function(item) {
            if (normalizeGuildTag(item.guildTag) === guildTag) {
                users.updateUser(item.id, {
                    guildTag: '',
                    guildSkinUrl: '',
                    guildSkinPath: '',
                    activeSkinType: item.activeSkinType === 'guild' ? 'player' : item.activeSkinType
                });
            }
        });
        removeGuildInvites(guildTag);
        adminStore.remove('guilds', guild.id);

        sendJson(res, 200, { ok: true, message: 'Guild deleted.', user: publicAuthUser(users.findByIdOrUsernameOrEmail(user.id)) });
    });
}

function handleGuildLeave(req, res) {
    readBody(req, function(err, body) {
        if (err) return sendJson(res, 400, { ok: false, message: 'Invalid request.' });

        var user = users.findBySessionToken(String(body.token || ''));
        if (!user) return sendJson(res, 401, { ok: false, message: 'You must login first.' });

        var guild = findGuildByTag(user.guildTag);
        if (!guild) return sendJson(res, 404, { ok: false, message: 'Guild not found.' });

        var role = getGuildRole(user, guild);
        if (role === 'leader') {
            return sendJson(res, 403, { ok: false, message: 'Leader cannot leave guild. Delete guild or transfer leadership first.' });
        }
        if (role !== 'staff' && role !== 'member') {
            return sendJson(res, 403, { ok: false, message: 'You do not have permission.' });
        }

        var members = parseGuildMembers(guild).filter(function(member) {
            return String(member.name || '').toLowerCase() !== String(user.username || '').toLowerCase();
        });
        adminStore.update('guilds', guild.id, {
            members: members.length,
            membersList: serializeGuildMembers(members)
        });

        var updatedUser = users.updateUser(user.id, {
            guildTag: '',
            guildSkinUrl: '',
            guildSkinPath: '',
            activeSkinType: user.activeSkinType === 'guild' ? 'player' : user.activeSkinType
        });

        sendJson(res, 200, { ok: true, message: 'Left guild.', user: publicAuthUser(updatedUser) });
    });
}

function handle(req, res) {
    var parsed = url.parse(req.url, true);
    var pathname = parsed.pathname;

    if (pathname.indexOf('/api/auth/') !== 0 &&
        pathname.indexOf('/api/guild/') !== 0 &&
        pathname.indexOf('/api/friends') !== 0 &&
        pathname !== '/api/notifications') {
        return false;
    }

    if (req.method === 'OPTIONS') {
        sendJson(res, 200, { ok: true });
        return true;
    }

    if (req.method === 'GET' && pathname === '/api/guild/invites') {
        handleGuildInvites(req, res, parsed.query || {});
        return true;
    }

    if (req.method === 'GET' && pathname === '/api/notifications') {
        handleNotifications(req, res, parsed.query || {});
        return true;
    }

    if (req.method === 'GET' && pathname === '/api/friends') {
        handleFriendsList(req, res, parsed.query || {});
        return true;
    }

    if (req.method === 'POST' && pathname === '/api/friends/add') {
        handleFriendAdd(req, res);
        return true;
    }

    if (req.method === 'POST' && pathname === '/api/friends/invite') {
        handleFriendInvite(req, res);
        return true;
    }

    if (req.method === 'POST' && pathname === '/api/friends/accept') {
        handleFriendAccept(req, res);
        return true;
    }

    if (req.method === 'POST' && pathname === '/api/friends/decline') {
        handleFriendDecline(req, res);
        return true;
    }

    if (req.method === 'POST' && pathname === '/api/friends/respond') {
        handleFriendRespond(req, res);
        return true;
    }

    if (req.method === 'POST' && pathname === '/api/guild/invite') {
        handleGuildInvite(req, res);
        return true;
    }

    if (req.method === 'POST' && pathname === '/api/guild/create') {
        handleGuildCreate(req, res);
        return true;
    }

    if (req.method === 'POST' && pathname === '/api/guild/invite/accept') {
        handleGuildInviteAccept(req, res);
        return true;
    }

    if (req.method === 'POST' && pathname === '/api/guild/invite/decline') {
        handleGuildInviteDecline(req, res);
        return true;
    }

    if (req.method === 'POST' && pathname === '/api/guild/edit') {
        handleGuildEdit(req, res);
        return true;
    }

    if (req.method === 'POST' && pathname === '/api/guild/delete') {
        handleGuildDelete(req, res);
        return true;
    }

    if (req.method === 'POST' && pathname === '/api/guild/leave') {
        handleGuildLeave(req, res);
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

    if (req.method === 'POST' && pathname === '/api/auth/search-player') {
        handleSearchPlayer(req, res);
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
