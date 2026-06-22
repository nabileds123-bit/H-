var fs = require('fs');
var path = require('path');
var users = require('../auth/userStore');
var battleTier = require('../battleTier');
var adminStore = require('../admin/adminStore');

var dataDir = path.join(__dirname, '..', '..', 'data');
var storePath = path.join(dataDir, 'stats.json');

var defaultStore = {
    top1TimeRecords: [],
    pendingTop1TimeRecords: [],
    guildTop1TimeRecords: [],
    pendingGuildTop1TimeRecords: [],
    battleMatchRecords: [],
    adminAuditLogs: []
};

var TOP1_MODES = {
    ffa: true,
    teams: true,
    experimental: true
};

var BATTLE_MODES = {
    '1vs1': true,
    '2vs2': true
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

function createId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function jakartaDateParts(time) {
    var date = new Date(time == null ? Date.now() : time);
    var formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    var values = {};

    formatter.formatToParts(date).forEach(function(part) {
        if (part.type === 'year' || part.type === 'month' || part.type === 'day') {
            values[part.type] = part.value;
        }
    });

    if (values.year && values.month && values.day) {
        return {
            year: parseInt(values.year, 10),
            month: parseInt(values.month, 10),
            day: parseInt(values.day, 10),
            date: values.year + '-' + values.month + '-' + values.day
        };
    }

    var fallback = date;
    var y = fallback.getUTCFullYear();
    var m = fallback.getUTCMonth() + 1;
    var d = fallback.getUTCDate();
    return {
        year: y,
        month: m,
        day: d,
        date: y + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d
    };
}

function getJakartaDate(time) {
    return jakartaDateParts(time).date;
}

function mergeTop1Record(list, record, isGuild) {
    var found = null;

    for (var i = 0; i < list.length; i++) {
        var item = list[i];
        var sameUser = item.user_id === record.user_id;
        var sameMode = item.mode === record.mode;
        var sameDate = item.record_date === record.record_date;
        var sameGuild = !isGuild || normalizeGuildId(item.guild_id) === normalizeGuildId(record.guild_id);
        if (sameUser && sameMode && sameDate && sameGuild) {
            found = item;
            break;
        }
    }

    if (found) {
        found.username = record.username || found.username;
        found.guild_id = record.guild_id || found.guild_id;
        found.country_code = normalizeCountryCode(record.country_code || found.country_code);
        found.server_id = record.server_id || found.server_id;
        found.top1_ms = Math.max(0, (parseInt(found.top1_ms, 10) || 0) + (parseInt(record.top1_ms, 10) || 0));
        found.updated_at = Date.now();
        return found;
    }

    found = Object.assign({}, record, {
        id: record.id || createId(),
        created_at: record.created_at || Date.now(),
        updated_at: Date.now()
    });
    list.push(found);
    return found;
}

function finalizePendingTop1Records(store, cutoffDate) {
    cutoffDate = cutoffDate || getJakartaDate();
    store.pendingTop1TimeRecords = Array.isArray(store.pendingTop1TimeRecords) ? store.pendingTop1TimeRecords : [];
    store.pendingGuildTop1TimeRecords = Array.isArray(store.pendingGuildTop1TimeRecords) ? store.pendingGuildTop1TimeRecords : [];

    store.top1TimeRecords = store.top1TimeRecords.filter(function(record) {
        if (!record || !record.record_date || record.record_date < cutoffDate) return true;
        mergeTop1Record(store.pendingTop1TimeRecords, record, false);
        return false;
    });

    store.guildTop1TimeRecords = store.guildTop1TimeRecords.filter(function(record) {
        if (!record || !record.record_date || record.record_date < cutoffDate) return true;
        mergeTop1Record(store.pendingGuildTop1TimeRecords, record, true);
        return false;
    });

    store.pendingTop1TimeRecords = store.pendingTop1TimeRecords.filter(function(record) {
        if (!record || !record.record_date || record.record_date >= cutoffDate) return true;
        mergeTop1Record(store.top1TimeRecords, record, false);
        return false;
    });

    store.pendingGuildTop1TimeRecords = store.pendingGuildTop1TimeRecords.filter(function(record) {
        if (!record || !record.record_date || record.record_date >= cutoffDate) return true;
        mergeTop1Record(store.guildTop1TimeRecords, record, true);
        return false;
    });

    return store;
}

function finalizePendingTop1Stats() {
    var store = readStore();
    var beforeTop1 = (store.pendingTop1TimeRecords || []).length;
    var beforeGuild = (store.pendingGuildTop1TimeRecords || []).length;
    var beforeFinalTop1 = (store.top1TimeRecords || []).length;
    var beforeFinalGuild = (store.guildTop1TimeRecords || []).length;
    finalizePendingTop1Records(store, getJakartaDate());
    if (beforeTop1 !== (store.pendingTop1TimeRecords || []).length ||
        beforeGuild !== (store.pendingGuildTop1TimeRecords || []).length ||
        beforeFinalTop1 !== (store.top1TimeRecords || []).length ||
        beforeFinalGuild !== (store.guildTop1TimeRecords || []).length) {
        writeStore(store);
    }
    return store;
}

function dateToUtcMs(date) {
    return Date.parse(date + 'T00:00:00Z');
}

function getPeriodRange(period, now) {
    period = normalizePeriod(period);
    var parts = jakartaDateParts(now);
    var today = parts.date;

    if (period === 'global') {
        return { start: null, end: null };
    }

    if (period === 'today') {
        return { start: today, end: today };
    }

    if (period === 'month') {
        return {
            start: parts.year + '-' + (parts.month < 10 ? '0' : '') + parts.month + '-01',
            end: today
        };
    }

    var todayMs = dateToUtcMs(today);
    var utcDay = new Date(todayMs).getUTCDay();
    var diffToMonday = (utcDay + 6) % 7;
    var monday = new Date(todayMs - diffToMonday * 24 * 60 * 60 * 1000);
    var y = monday.getUTCFullYear();
    var m = monday.getUTCMonth() + 1;
    var d = monday.getUTCDate();
    return {
        start: y + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d,
        end: today
    };
}

function inRange(date, range) {
    if (!date) return false;
    if (!range || (!range.start && !range.end)) return true;
    if (range.start && date < range.start) return false;
    if (range.end && date > range.end) return false;
    return true;
}

function normalizeTop1Mode(mode) {
    mode = String(mode || '').toLowerCase();
    if (mode === ':x5' || mode === 'x5' || mode === 'ffa' || mode === ':hardcore' || mode === ':hardcore:1' || mode === ':hardcore:2' || mode === 'hardcore') return 'ffa';
    if (mode === ':teams' || mode === 'teams') return 'teams';
    if (mode === ':experimental' || mode === 'experimental') return 'experimental';
    return TOP1_MODES[mode] ? mode : '';
}

function normalizeBattleMode(mode) {
    mode = String(mode || '').toLowerCase();
    if (mode === ':battle:1v1' || mode === '1v1' || mode === '1vs1') return '1vs1';
    if (mode === ':battle:2v2' || mode === '2v2' || mode === '2vs2') return '2vs2';
    return BATTLE_MODES[mode] ? mode : '';
}

function normalizePeriod(period) {
    period = String(period || 'today').toLowerCase();
    if (period === 'week' || period === 'thisweek') return 'week';
    if (period === 'month' || period === 'thismonth') return 'month';
    if (period === 'global') return 'global';
    return 'today';
}

function normalizeGuildPeriod(period) {
    period = String(period || 'week').toLowerCase();
    if (period === 'month' || period === 'global') return period;
    return 'week';
}

function getUserGuildId(user) {
    return String(user && (user.guildId || user.guild_id || user.guildTag) || '').trim();
}

function normalizeGuildId(value) {
    return String(value || '').trim().toUpperCase();
}

function normalizeCountryCode(value) {
    var code = String(value || '').trim().toUpperCase();
    if (code === 'XX' || code === 'T1') return '';
    return /^[A-Z]{2}$/.test(code) ? code : '';
}

function getUserInfo(identifier) {
    var user = users.findByIdOrUsernameOrEmail(identifier);
    if (!user) return null;

    var tierInfo = battleTier.getNextTierInfo(user.rankedProgress);

    return {
        userId: user.id,
        username: user.username || '',
        email: user.email || '',
        guildId: getUserGuildId(user),
        guildTag: user.guildTag || '',
        battleTier: tierInfo.tier,
        rankedTier: tierInfo.tier,
        rankedWins: parseInt(user.rankedWins, 10) || 0,
        rankedLosses: parseInt(user.rankedLosses, 10) || 0,
        battleProgress: tierInfo.progress,
        rankedProgress: tierInfo.progress,
        battleTierInfo: tierInfo,
        rankedModeStats: user.rankedModeStats || {},
        country_code: normalizeCountryCode(user.country_code || user.countryCode)
    };
}

function normalizeBattleTier(value) {
    return battleTier.normalize(value);
}

function upsertTop1Time(data) {
    var mode = normalizeTop1Mode(data.mode);
    var user = getUserInfo(data.userId || data.username);
    var amount = Math.floor(parseInt(data.top1Ms, 10) || parseInt(data.addMs, 10) || 0);

    if (!mode || !user || amount <= 0) {
        return null;
    }

    var date = data.recordDate || getJakartaDate();
    var today = getJakartaDate();
    var store = readStore();
    var serverId = String(data.serverId || 'default');
    var targetList;
    var found;

    finalizePendingTop1Records(store, today);
    targetList = date >= today ? store.pendingTop1TimeRecords : store.top1TimeRecords;
    found = mergeTop1Record(targetList, {
        id: createId(),
        user_id: user.userId,
        username: user.username,
        guild_id: user.guildId,
        country_code: normalizeCountryCode(data.country_code || data.countryCode || user.country_code),
        mode: mode,
        server_id: serverId,
        record_date: date,
        top1_ms: amount,
        created_at: Date.now(),
        updated_at: Date.now()
    }, false);

    writeStore(store);
    return found;
}

function upsertGuildTop1Time(data) {
    var mode = normalizeTop1Mode(data.mode);
    var user = getUserInfo(data.userId || data.username);
    var amount = Math.floor(parseInt(data.top1Ms, 10) || parseInt(data.addMs, 10) || 0);

    if (!mode || !user || amount <= 0) {
        return null;
    }

    var guildId = normalizeGuildId(data.guildId || data.guild_id || user.guildId || user.guildTag);
    if (!guildId) {
        return null;
    }

    var date = data.recordDate || getJakartaDate();
    var today = getJakartaDate();
    var store = readStore();
    var serverId = String(data.serverId || 'default');
    var targetList;
    var found;

    finalizePendingTop1Records(store, today);
    targetList = date >= today ? store.pendingGuildTop1TimeRecords : store.guildTop1TimeRecords;
    found = mergeTop1Record(targetList, {
        id: createId(),
        user_id: user.userId,
        username: user.username,
        guild_id: guildId,
        country_code: normalizeCountryCode(data.country_code || data.countryCode || user.country_code),
        mode: mode,
        server_id: serverId,
        record_date: date,
        top1_ms: amount,
        created_at: Date.now(),
        updated_at: Date.now()
    }, true);

    writeStore(store);
    return found;
}

function addBattleRecord(data) {
    var mode = normalizeBattleMode(data.mode);
    var user = getUserInfo(data.userId || data.username);
    var result = String(data.result || '').toLowerCase();
    var scoreFor = parseInt(data.scoreFor, 10);
    var scoreAgainst = parseInt(data.scoreAgainst, 10);

    if (!mode || !user || (result !== 'win' && result !== 'lose')) {
        return null;
    }

    if (isNaN(scoreFor)) scoreFor = result === 'win' ? 1 : 0;
    if (isNaN(scoreAgainst)) scoreAgainst = result === 'win' ? 0 : 1;

    var store = readStore();
    var item = {
        id: createId(),
        user_id: user.userId,
        username: user.username,
        guild_id: user.guildId,
        country_code: normalizeCountryCode(data.country_code || data.countryCode || user.country_code),
        mode: mode,
        server_id: String(data.serverId || 'default'),
        result: result,
        opponent_username: String(data.opponentUsername || data.opponent || '').trim(),
        score_for: scoreFor,
        score_against: scoreAgainst,
        ranked: data.ranked !== false,
        winner_user_ids: Array.isArray(data.winnerUserIds) ? data.winnerUserIds : [],
        loser_user_ids: Array.isArray(data.loserUserIds) ? data.loserUserIds : [],
        result_saved: data.resultSaved !== false,
        match_date: data.matchDate || getJakartaDate(),
        created_at: Date.now()
    };

    store.battleMatchRecords.push(item);
    writeStore(store);
    return item;
}

function getTop1SummaryForUser(identifier, period) {
    var user = getUserInfo(identifier);
    var result = { ffa: 0, teams: 0, experimental: 0 };
    if (!user) return result;

    var range = getPeriodRange(period);
    finalizePendingTop1Stats().top1TimeRecords.forEach(function(record) {
        if (record.user_id !== user.userId || !inRange(record.record_date, range)) return;
        if (TOP1_MODES[record.mode]) {
            result[record.mode] += parseInt(record.top1_ms, 10) || 0;
        }
    });

    return result;
}

function getBattleSummaryForUser(identifier, mode, period) {
    var user = getUserInfo(identifier);
    var battleMode = normalizeBattleMode(mode);
    var summary = {
        win: 0,
        lose: 0,
        totalMatch: 0,
        winRate: 0,
        tier: user ? user.battleTier : 'UNRANKED',
        rankedWins: user ? user.rankedWins : 0,
        rankedLosses: user ? user.rankedLosses : 0,
        rankedProgress: user ? user.rankedProgress : 0,
        rankedModeStats: user ? user.rankedModeStats : {},
        progress: user ? user.rankedProgress : 0,
        tierInfo: user ? user.battleTierInfo : battleTier.getNextTierInfo(0)
    };
    if (!user || !battleMode) return summary;

    var range = getPeriodRange(period);
    readStore().battleMatchRecords.forEach(function(record) {
        if (record.user_id !== user.userId || record.mode !== battleMode || !inRange(record.match_date, range)) return;
        if (record.result === 'win') summary.win++;
        if (record.result === 'lose') summary.lose++;
    });

    summary.totalMatch = summary.win + summary.lose;
    summary.winRate = summary.totalMatch ? Math.round((summary.win / summary.totalMatch) * 100) : 0;
    return summary;
}

function getBattleRecordsForUser(identifier, mode, period, limit) {
    var user = getUserInfo(identifier);
    var battleMode = normalizeBattleMode(mode);
    var range = getPeriodRange(period);

    if (!user || !battleMode) return [];

    return readStore().battleMatchRecords.filter(function(record) {
        return record.user_id === user.userId && record.mode === battleMode && inRange(record.match_date, range);
    }).sort(function(a, b) {
        return (parseInt(b.created_at, 10) || 0) - (parseInt(a.created_at, 10) || 0);
    }).slice(0, limit || 50).map(function(record) {
        var result = String(record.result || '').toLowerCase();
        var scoreFor = parseInt(record.score_for, 10);
        var scoreAgainst = parseInt(record.score_against, 10);

        if (isNaN(scoreFor)) scoreFor = result === 'win' ? 1 : 0;
        if (isNaN(scoreAgainst)) scoreAgainst = result === 'win' ? 0 : 1;

        return {
            id: record.id,
            username: record.username || user.username,
            opponentUsername: record.opponent_username || record.opponentUsername || '-',
            mode: record.mode,
            result: result,
            scoreFor: scoreFor,
            scoreAgainst: scoreAgainst,
            matchDate: record.match_date || '',
            createdAt: record.created_at || 0
        };
    });
}

function top1HighScore(mode, period, limit) {
    var topMode = normalizeTop1Mode(mode) || 'ffa';
    var range = getPeriodRange(period);
    var map = {};

    finalizePendingTop1Stats().top1TimeRecords.forEach(function(record) {
        if (record.mode !== topMode || !inRange(record.record_date, range)) return;
        var recordUser = getUserInfo(record.user_id || record.username) || {};
        if (!map[record.user_id]) {
            map[record.user_id] = {
                userId: record.user_id,
                username: record.username,
                guildId: record.guild_id,
                country_code: normalizeCountryCode(record.country_code || recordUser.country_code),
                mode: topMode,
                top1Ms: 0
            };
        }
        if (!map[record.user_id].country_code) {
            map[record.user_id].country_code = normalizeCountryCode(record.country_code || recordUser.country_code);
        }
        map[record.user_id].top1Ms += parseInt(record.top1_ms, 10) || 0;
    });

    return Object.keys(map).map(function(key) { return map[key]; })
        .sort(function(a, b) { return b.top1Ms - a.top1Ms; })
        .slice(0, limit || 50)
        .map(function(item, index) {
            item.rank = index + 1;
            return item;
        });
}

function guildTop1Records(guildId, period, limit) {
    var normalizedGuild = normalizeGuildId(guildId);
    var range = getPeriodRange(period);

    return finalizePendingTop1Stats().guildTop1TimeRecords.filter(function(record) {
        return normalizeGuildId(record.guild_id) === normalizedGuild &&
            inRange(record.record_date, range);
    }).sort(function(a, b) {
        if (String(b.record_date || '') !== String(a.record_date || '')) {
            return String(b.record_date || '').localeCompare(String(a.record_date || ''));
        }
        return (parseInt(b.top1_ms, 10) || 0) - (parseInt(a.top1_ms, 10) || 0);
    }).slice(0, limit || 50).map(function(record) {
        return {
            id: record.id,
            username: record.username || '-',
            mode: record.mode,
            guildId: record.guild_id,
            recordDate: record.record_date || '',
            top1Ms: parseInt(record.top1_ms, 10) || 0,
            createdAt: record.created_at || 0,
            updatedAt: record.updated_at || 0
        };
    });
}

function battleHighScore(mode, period, limit) {
    var battleMode = normalizeBattleMode(mode) || '1vs1';
    var range = getPeriodRange(period);
    var map = {};

    readStore().battleMatchRecords.forEach(function(record) {
        if (record.mode !== battleMode || !inRange(record.match_date, range)) return;
        var recordUser = getUserInfo(record.user_id || record.username) || {};
        if (!map[record.user_id]) {
            map[record.user_id] = {
                userId: record.user_id,
                username: record.username,
                guildId: record.guild_id,
                country_code: normalizeCountryCode(record.country_code || recordUser.country_code),
                mode: battleMode,
                win: 0,
                lose: 0
            };
        }
        if (!map[record.user_id].country_code) {
            map[record.user_id].country_code = normalizeCountryCode(record.country_code || recordUser.country_code);
        }
        if (record.result === 'win') map[record.user_id].win++;
        if (record.result === 'lose') map[record.user_id].lose++;
    });

    return Object.keys(map).map(function(key) {
        var item = map[key];
        item.totalMatch = item.win + item.lose;
        item.winRate = item.totalMatch ? Math.round((item.win / item.totalMatch) * 100) : 0;
        return item;
    }).sort(function(a, b) {
        if (b.win !== a.win) return b.win - a.win;
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        return b.totalMatch - a.totalMatch;
    }).slice(0, limit || 50).map(function(item, index) {
        item.rank = index + 1;
        return item;
    });
}

function guildStats(period) {
    period = normalizeGuildPeriod(period);
    var range = getPeriodRange(period);
    var store = finalizePendingTop1Stats();
    var guilds = {};
    var guildAliases = {};
    var guildList = adminStore.list('guilds');

    guildList.forEach(function(guild) {
        var id = String(guild.id || guild.tag || guild.name || '').trim();
        if (!id) return;
        guilds[id] = {
            guildId: id,
            name: guild.name || id,
            tag: guild.tag || id,
            members: parseInt(guild.members, 10) || 0,
            membersList: guild.membersList || '',
            description: guild.description || guild.bio || '',
            bio: guild.bio || guild.description || '',
            leader: guild.leader || '',
            leaderLevel: parseInt(guild.leaderLevel, 10) || 1,
            logo: guild.logo || guild.guildSkinUrl || '',
            guildSkinUrl: guild.guildSkinUrl || guild.logo || '',
            createdAt: guild.createdAt || 0,
            top1Ms: 0,
            battle: {
                '1vs1': { win: 0, lose: 0, totalMatch: 0, winRate: 0 },
                '2vs2': { win: 0, lose: 0, totalMatch: 0, winRate: 0 }
            }
        };
        guildAliases[normalizeGuildId(id)] = id;
        guildAliases[normalizeGuildId(guild.tag)] = id;
        guildAliases[normalizeGuildId(guild.name)] = id;
    });

    store.guildTop1TimeRecords.forEach(function(record) {
        if (!record.guild_id || !inRange(record.record_date, range)) return;
        var guildKey = guildAliases[normalizeGuildId(record.guild_id)];
        if (!guildKey || !guilds[guildKey]) return;
        guilds[guildKey].top1Ms += parseInt(record.top1_ms, 10) || 0;
    });

    readStore().battleMatchRecords.forEach(function(record) {
        if (!record.guild_id || !inRange(record.match_date, range)) return;
        if (!guilds[record.guild_id]) return;
        var bucket = guilds[record.guild_id].battle[record.mode];
        if (!bucket) return;
        if (record.result === 'win') bucket.win++;
        if (record.result === 'lose') bucket.lose++;
    });

    return Object.keys(guilds).map(function(key) {
        var item = guilds[key];
        Object.keys(item.battle).forEach(function(mode) {
            var b = item.battle[mode];
            b.totalMatch = b.win + b.lose;
            b.winRate = b.totalMatch ? Math.round((b.win / b.totalMatch) * 100) : 0;
        });
        return item;
    }).sort(function(a, b) {
        return b.top1Ms - a.top1Ms;
    });
}

function audit(action, targetType, targetId, oldValue, newValue, adminUserId, reason) {
    var store = readStore();
    var item = {
        id: createId(),
        admin_user_id: adminUserId || 'admin',
        action: action,
        target_type: targetType,
        target_id: targetId,
        old_value: oldValue || null,
        new_value: newValue || null,
        reason: reason || '',
        created_at: Date.now()
    };
    store.adminAuditLogs.push(item);
    writeStore(store);
    return item;
}

module.exports = {
    addBattleRecord: addBattleRecord,
    audit: audit,
    battleHighScore: battleHighScore,
    getBattleRecordsForUser: getBattleRecordsForUser,
    getBattleSummaryForUser: getBattleSummaryForUser,
    getJakartaDate: getJakartaDate,
    getPeriodRange: getPeriodRange,
    getTop1SummaryForUser: getTop1SummaryForUser,
    guildStats: guildStats,
    guildTop1Records: guildTop1Records,
    normalizeBattleMode: normalizeBattleMode,
    normalizeGuildPeriod: normalizeGuildPeriod,
    normalizePeriod: normalizePeriod,
    normalizeTop1Mode: normalizeTop1Mode,
    readStore: readStore,
    top1HighScore: top1HighScore,
    upsertGuildTop1Time: upsertGuildTop1Time,
    upsertTop1Time: upsertTop1Time,
    writeStore: writeStore
};
