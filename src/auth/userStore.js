var fs = require('fs');
var path = require('path');

var dataDir = path.join(__dirname, '..', '..', 'data');
var usersPath = path.join(dataDir, 'users.json');

function ensureStore() {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir);
    }

    if (!fs.existsSync(usersPath)) {
        fs.writeFileSync(usersPath, JSON.stringify({ users: [] }, null, 2));
    }
}

function readStore() {
    ensureStore();

    try {
        var store = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
        var normalized = normalizeStore(store);

        if (normalized.changed) {
            writeStore(normalized.store);
        }

        return normalized.store;
    } catch (e) {
        return { users: [] };
    }
}

function writeStore(store) {
    ensureStore();
    fs.writeFileSync(usersPath, JSON.stringify(store, null, 2));
}

function createUserId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function normalizeStore(store) {
    var changed = false;

    if (!store || !Array.isArray(store.users)) {
        store = { users: [] };
        changed = true;
    }

    store.users = store.users.map(function(user) {
        if (!user || typeof user !== 'object') {
            changed = true;
            return { id: createUserId(), username: '', email: '', createdAt: Date.now(), updatedAt: Date.now() };
        }

        if (!user.id) {
            user = Object.assign({}, user, { id: createUserId(), updatedAt: Date.now() });
            changed = true;
        }

        return user;
    });

    return { store: store, changed: changed };
}

function listUsers() {
    return readStore().users;
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function normalizeGmailEmail(email) {
    var normalized = normalizeEmail(email);
    var parts = normalized.split('@');

    if (parts.length !== 2 || parts[1] !== 'gmail.com') {
        return null;
    }

    var local = parts[0].split('+')[0].replace(/\./g, '');
    return local + '@gmail.com';
}

function normalizeUsername(username) {
    return String(username || '').trim();
}

function findByUsernameOrEmail(identifier) {
    var value = String(identifier || '').trim().toLowerCase();
    var gmailValue = normalizeGmailEmail(value);
    var store = readStore();

    return store.users.find(function(user) {
        var userGmail = user.gmailCanonicalEmail || normalizeGmailEmail(user.email);
        return String(user.username || '').toLowerCase() === value ||
            String(user.email || '').toLowerCase() === value ||
            (gmailValue && userGmail === gmailValue);
    }) || null;
}

function findByIdOrUsernameOrEmail(identifier) {
    var value = String(identifier || '').trim();
    if (!value) return null;

    var found = findByUsernameOrEmail(value);
    if (found) return found;

    var store = readStore();
    return store.users.find(function(user) {
        return matchesUserId(user, value);
    }) || null;
}

function findByEmail(email) {
    var normalized = normalizeEmail(email);
    var gmailValue = normalizeGmailEmail(normalized);
    var store = readStore();

    return store.users.find(function(user) {
        var userGmail = user.gmailCanonicalEmail || normalizeGmailEmail(user.email);
        return String(user.email || '').toLowerCase() === normalized || (gmailValue && userGmail === gmailValue);
    }) || null;
}

function findByToken(field, token) {
    var store = readStore();

    return store.users.find(function(user) {
        return user[field] && user[field].token === token && user[field].expiresAt > Date.now();
    }) || null;
}

function findBySessionToken(token) {
    var store = readStore();

    return store.users.find(function(user) {
        return user.sessionToken === token;
    }) || null;
}

function createUser(data) {
    var store = readStore();
    var username = normalizeUsername(data.username);
    var email = normalizeEmail(data.email);
    var gmailCanonicalEmail = normalizeGmailEmail(email);

    var duplicate = store.users.find(function(user) {
        var userGmail = user.gmailCanonicalEmail || normalizeGmailEmail(user.email);
        return String(user.username || '').toLowerCase() === username.toLowerCase() ||
            String(user.email || '').toLowerCase() === email ||
            (gmailCanonicalEmail && userGmail === gmailCanonicalEmail);
    });

    if (duplicate) {
        return null;
    }

    var user = {
        id: createUserId(),
        username: username,
        email: email,
        gmailCanonicalEmail: gmailCanonicalEmail,
        passwordHash: data.passwordHash,
        emailVerified: false,
        accountType: 'Free',
        commandRole: '',
        commandPermissions: '',
        commandMass: false,
        commandColor: false,
        commandMerge: false,
        commandTp: false,
        commandSplit: false,
        commandName: false,
        commandPoint: false,
        commandKick: false,
        commandSay: false,
        commandKillall: false,
        commandPlayerlist: false,
        commandStatus: false,
        premiumChatColor: '',
        premiumChatBadge: '',
        premiumChatEffect: '',
        points: 0,
        xp: 0,
        xpMax: 0,
        level: 1,
        cellColor: '#000000',
        skin: '',
        skinUrl: '',
        skinPath: '',
        activeSkinType: 'player',
        guildTag: '',
        guildSkinUrl: '',
        guildSkinPath: '',
        country_code: String(data.country_code || data.countryCode || '').trim().toUpperCase(),
        verifyEmail: data.verifyEmail,
        resetPassword: null,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    store.users.push(user);
    writeStore(store);
    return user;
}

function updateUser(userId, changes) {
    var store = readStore();
    var user = null;

    store.users = store.users.map(function(item) {
        if (!matchesUserId(item, userId)) return item;

        user = Object.assign({}, item, changes, { updatedAt: Date.now() });
        return user;
    });

    writeStore(store);
    return user;
}

function deleteUser(userId) {
    var store = readStore();
    var initialLength = store.users.length;

    store.users = store.users.filter(function(user) {
        return !matchesUserId(user, userId);
    });

    if (store.users.length === initialLength) {
        return false;
    }

    writeStore(store);
    return true;
}

function matchesUserId(user, userId) {
    var value = String(userId || '').trim();
    if (!user || !value) return false;

    return String(user.id || '') === value ||
        String(user.username || '').toLowerCase() === value.toLowerCase() ||
        String(user.email || '').toLowerCase() === value.toLowerCase();
}

module.exports = {
    createUser: createUser,
    deleteUser: deleteUser,
    findByEmail: findByEmail,
    findByIdOrUsernameOrEmail: findByIdOrUsernameOrEmail,
    findBySessionToken: findBySessionToken,
    findByToken: findByToken,
    findByUsernameOrEmail: findByUsernameOrEmail,
    listUsers: listUsers,
    updateUser: updateUser
};
