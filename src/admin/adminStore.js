var fs = require('fs');
var path = require('path');

var dataDir = path.join(__dirname, '..', '..', 'data');
var storePath = path.join(dataDir, 'admin.json');

var defaultStore = {
    premium: [],
    points: [],
    skins: [],
    guilds: [],
    notifications: [],
    highscores: [],
    battleMatches: []
};

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function ensureStore() {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir);
    }

    if (!fs.existsSync(storePath)) {
        fs.writeFileSync(storePath, JSON.stringify(defaultStore, null, 2));
    }
}

function readStore() {
    ensureStore();

    try {
        return Object.assign(clone(defaultStore), JSON.parse(fs.readFileSync(storePath, 'utf8')));
    } catch (e) {
        return clone(defaultStore);
    }
}

function writeStore(store) {
    ensureStore();
    fs.writeFileSync(storePath, JSON.stringify(Object.assign(clone(defaultStore), store), null, 2));
}

function list(collection) {
    var store = readStore();
    return store[collection] || [];
}

function create(collection, data) {
    var store = readStore();
    var items = store[collection] || [];
    var now = Date.now();
    var item = Object.assign({}, data, {
        id: data.id || (now.toString(36) + Math.random().toString(36).slice(2)),
        createdAt: data.createdAt || now,
        updatedAt: now
    });

    items.push(item);
    store[collection] = items;
    writeStore(store);
    return item;
}

function update(collection, id, changes) {
    var store = readStore();
    var items = store[collection] || [];
    var updated = null;

    store[collection] = items.map(function(item) {
        if (item.id !== id) return item;
        updated = Object.assign({}, item, changes, { id: id, updatedAt: Date.now() });
        return updated;
    });

    if (!updated) return null;

    writeStore(store);
    return updated;
}

function remove(collection, id) {
    var store = readStore();
    var items = store[collection] || [];
    var next = items.filter(function(item) {
        return item.id !== id;
    });

    if (next.length === items.length) return false;

    store[collection] = next;
    writeStore(store);
    return true;
}

module.exports = {
    create: create,
    list: list,
    remove: remove,
    update: update
};
