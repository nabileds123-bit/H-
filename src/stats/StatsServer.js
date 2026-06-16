var url = require('url');
var statsStore = require('./statsStore');

function sendJson(res, status, body) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    });
    res.end(JSON.stringify(body));
}

function formatMs(ms) {
    var totalMinutes = Math.floor(Math.max(0, parseInt(ms, 10) || 0) / 60000);
    var hours = Math.floor(totalMinutes / 60);
    var minutes = totalMinutes % 60;
    return (hours < 10 ? '0' : '') + hours + ':' + (minutes < 10 ? '0' : '') + minutes;
}

function getQueryUser(query) {
    return query.userId || query.username || query.user || '';
}

function publicHandle(req, res) {
    var parsed = url.parse(req.url, true);
    var pathname = parsed.pathname;
    var query = parsed.query || {};

    if (req.method === 'OPTIONS' && (
        pathname.indexOf('/api/account/') === 0 ||
        pathname.indexOf('/api/highscore/') === 0 ||
        pathname.indexOf('/api/guilds') === 0
    )) {
        sendJson(res, 200, { ok: true });
        return true;
    }

    if (req.method === 'GET' && pathname === '/api/account/top1') {
        var top1 = statsStore.getTop1SummaryForUser(getQueryUser(query), query.period);
        return sendJson(res, 200, {
            ok: true,
            period: statsStore.normalizePeriod(query.period),
            items: [
                { mode: 'ffa', label: 'FFA', top1Ms: top1.ffa, top1Time: formatMs(top1.ffa) },
                { mode: 'teams', label: 'Teams', top1Ms: top1.teams, top1Time: formatMs(top1.teams) },
                { mode: 'experimental', label: 'Experimental', top1Ms: top1.experimental, top1Time: formatMs(top1.experimental) }
            ]
        });
    }

    if (req.method === 'GET' && pathname === '/api/account/battle') {
        var battle = statsStore.getBattleSummaryForUser(getQueryUser(query), query.mode, query.period);
        return sendJson(res, 200, {
            ok: true,
            mode: statsStore.normalizeBattleMode(query.mode),
            period: statsStore.normalizePeriod(query.period),
            stats: battle
        });
    }

    if (req.method === 'GET' && pathname === '/api/highscore/top1') {
        var rows = statsStore.top1HighScore(query.mode, query.period, parseInt(query.limit, 10) || 50);
        return sendJson(res, 200, {
            ok: true,
            mode: statsStore.normalizeTop1Mode(query.mode) || 'ffa',
            period: statsStore.normalizePeriod(query.period),
            items: rows.map(function(row) {
                row.top1Time = formatMs(row.top1Ms);
                row.top1Seconds = Math.floor(Math.max(0, parseInt(row.top1Ms, 10) || 0) / 1000);
                row.top1Minutes = Math.floor(Math.max(0, parseInt(row.top1Ms, 10) || 0) / 60000);
                return row;
            })
        });
    }

    if (req.method === 'GET' && pathname === '/api/highscore/battle') {
        return sendJson(res, 200, {
            ok: true,
            mode: statsStore.normalizeBattleMode(query.mode) || '1vs1',
            period: statsStore.normalizePeriod(query.period),
            items: statsStore.battleHighScore(query.mode, query.period, parseInt(query.limit, 10) || 50)
        });
    }

    if (req.method === 'GET' && pathname === '/api/guilds') {
        var guilds = statsStore.guildStats(statsStore.normalizeGuildPeriod(query.period));
        return sendJson(res, 200, {
            ok: true,
            period: statsStore.normalizeGuildPeriod(query.period),
            items: guilds.map(function(guild) {
                guild.top1Time = formatMs(guild.top1Ms);
                return guild;
            })
        });
    }

    var top1Match = pathname.match(/^\/api\/guilds\/([^\/]+)\/top1$/);
    if (req.method === 'GET' && top1Match) {
        var guildId = decodeURIComponent(top1Match[1]);
        var item = statsStore.guildStats(statsStore.normalizeGuildPeriod(query.period)).filter(function(guild) {
            return String(guild.guildId) === guildId || String(guild.tag) === guildId;
        })[0] || null;
        return sendJson(res, 200, {
            ok: true,
            guild: item ? Object.assign({}, item, { top1Time: formatMs(item.top1Ms) }) : null
        });
    }

    var battleMatch = pathname.match(/^\/api\/guilds\/([^\/]+)\/battle$/);
    if (req.method === 'GET' && battleMatch) {
        var battleGuildId = decodeURIComponent(battleMatch[1]);
        var mode = statsStore.normalizeBattleMode(query.mode) || '1vs1';
        var battleGuild = statsStore.guildStats(statsStore.normalizeGuildPeriod(query.period)).filter(function(guild) {
            return String(guild.guildId) === battleGuildId || String(guild.tag) === battleGuildId;
        })[0] || null;
        return sendJson(res, 200, {
            ok: true,
            guild: battleGuild,
            stats: battleGuild ? battleGuild.battle[mode] : null
        });
    }

    return false;
}

function adminHandle(req, res, requireAdmin, getAdminSession) {
    var parsed = url.parse(req.url, true);
    var pathname = parsed.pathname;
    var query = parsed.query || {};

    if (pathname.indexOf('/api/admin/') !== 0) return false;

    if (pathname === '/api/admin/top1' && req.method === 'GET') {
        if (!requireAdmin(req, res)) return true;
        return sendJson(res, 200, {
            ok: true,
            items: statsStore.top1HighScore(query.mode, query.period, 200).map(function(row) {
                row.top1Time = formatMs(row.top1Ms);
                row.top1Seconds = Math.floor(Math.max(0, parseInt(row.top1Ms, 10) || 0) / 1000);
                row.top1Minutes = Math.floor(Math.max(0, parseInt(row.top1Ms, 10) || 0) / 60000);
                return row;
            })
        });
    }

    if (pathname === '/api/admin/battle' && req.method === 'GET') {
        if (!requireAdmin(req, res)) return true;
        return sendJson(res, 200, {
            ok: true,
            items: statsStore.battleHighScore(query.mode, query.period, 200)
        });
    }

    if (pathname === '/api/admin/highscore' && req.method === 'GET') {
        if (!requireAdmin(req, res)) return true;
        var type = String(query.type || 'top1').toLowerCase();
        return sendJson(res, 200, {
            ok: true,
            items: type === 'top1'
                ? statsStore.top1HighScore(query.mode, query.period, 200).map(function(row) {
                    row.top1Time = formatMs(row.top1Ms);
                    row.top1Seconds = Math.floor(Math.max(0, parseInt(row.top1Ms, 10) || 0) / 1000);
                    row.top1Minutes = Math.floor(Math.max(0, parseInt(row.top1Ms, 10) || 0) / 60000);
                    return row;
                })
                : statsStore.battleHighScore(type, query.period, 200)
        });
    }

    if (pathname === '/api/admin/guild-stats' && req.method === 'GET') {
        if (!requireAdmin(req, res)) return true;
        return sendJson(res, 200, {
            ok: true,
            items: statsStore.guildStats(query.period).map(function(guild) {
                guild.top1Time = formatMs(guild.top1Ms);
                return guild;
            })
        });
    }

    if (pathname === '/api/admin/audit-logs' && req.method === 'GET') {
        if (!requireAdmin(req, res)) return true;
        return sendJson(res, 200, {
            ok: true,
            items: statsStore.readStore().adminAuditLogs.slice().reverse()
        });
    }

    return false;
}

module.exports = {
    adminHandle: adminHandle,
    formatMs: formatMs,
    handle: publicHandle
};
