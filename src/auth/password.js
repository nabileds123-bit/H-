var crypto = require('crypto');

var ITERATIONS = 120000;
var KEY_LENGTH = 32;
var DIGEST = 'sha256';

function hashPassword(password) {
    var salt = crypto.randomBytes(16).toString('hex');
    var hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
    return [ITERATIONS, DIGEST, salt, hash].join('$');
}

function verifyPassword(password, storedHash) {
    if (!storedHash) return false;

    var parts = storedHash.split('$');
    if (parts.length !== 4) return false;

    var iterations = parseInt(parts[0], 10);
    var digest = parts[1];
    var salt = parts[2];
    var hash = parts[3];
    var check = crypto.pbkdf2Sync(password, salt, iterations, Buffer.from(hash, 'hex').length, digest);
    var expected = Buffer.from(hash, 'hex');

    return expected.length === check.length && crypto.timingSafeEqual(expected, check);
}

function createToken() {
    return crypto.randomBytes(32).toString('hex');
}

module.exports = {
    hashPassword: hashPassword,
    verifyPassword: verifyPassword,
    createToken: createToken
};
