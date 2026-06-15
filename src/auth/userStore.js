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
        return JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    } catch (e) {
        return { users: [] };
    }
}

function writeStore(store) {
    ensureStore();
    fs.writeFileSync(usersPath, JSON.stringify(store, null, 2));
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
        return user.username.toLowerCase() === value ||
            user.email.toLowerCase() === value ||
            (gmailValue && userGmail === gmailValue);
    }) || null;
}

function findByEmail(email) {
    var normalized = normalizeEmail(email);
    var gmailValue = normalizeGmailEmail(normalized);
    var store = readStore();

    return store.users.find(function(user) {
        var userGmail = user.gmailCanonicalEmail || normalizeGmailEmail(user.email);
        return user.email === normalized || (gmailValue && userGmail === gmailValue);
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
        return user.username.toLowerCase() === username.toLowerCase() ||
            user.email === email ||
            (gmailCanonicalEmail && userGmail === gmailCanonicalEmail);
    });

    if (duplicate) {
        return null;
    }

    var user = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        username: username,
        email: email,
        gmailCanonicalEmail: gmailCanonicalEmail,
        passwordHash: data.passwordHash,
        emailVerified: false,
        cellColor: '#000000',
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
        if (item.id !== userId) return item;

        user = Object.assign({}, item, changes, { updatedAt: Date.now() });
        return user;
    });

    writeStore(store);
    return user;
}

module.exports = {
    createUser: createUser,
    findByEmail: findByEmail,
    findBySessionToken: findBySessionToken,
    findByToken: findByToken,
    findByUsernameOrEmail: findByUsernameOrEmail,
    updateUser: updateUser
};
