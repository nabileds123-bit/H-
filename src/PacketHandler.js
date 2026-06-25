var Packet = require('./packet');
var userStore = require('./auth/userStore');
var battleTier = require('./battleTier');

function hexToColor(hex) {
    var match = /^#?([a-f0-9]{6})$/i.exec(hex || '');
    if (!match) return null;

    var value = parseInt(match[1], 16);
    return {
        r: (value >> 16) & 255,
        g: (value >> 8) & 255,
        b: value & 255
    };
}

var PREMIUM_CHAT_WARNING = 'Chat hanya tersedia untuk akun Premium. Silakan upgrade ke Premium untuk menggunakan chat.';
var CHAT_EFFECT_START = '\uE100';
var CHAT_EFFECT_END = '\uE101';

function isPremiumUser(user) {
    var accountType = String(user && user.accountType || '').toLowerCase();
    var premiumUntil = String(user && user.premiumUntil || '').trim();

    if (accountType !== 'premium') return false;
    if (!premiumUntil) return true;

    var expiresAt = Date.parse(premiumUntil);
    if (isNaN(expiresAt)) {
        expiresAt = parseInt(premiumUntil, 10);
    }

    return !expiresAt || expiresAt > Date.now();
}

function normalizePremiumChatEffect(value) {
    value = String(value || '').trim().toLowerCase();
    if (value === 'redbull') value = 'bull';
    if (value === 'airterjun' || value === 'air-terjun' || value === 'water fall') value = 'waterfall';

    return {
        bull: true,
        love: true,
        lightning: true,
        fire: true,
        star: true,
        crown: true,
        confetti: true,
        waterfall: true
    }[value] ? value : '';
}

function normalizeCommandRole(value) {
    value = String(value || '').trim().toLowerCase();
    return value === 'admin' || value === 'moderator' ? value : '';
}

function normalizeCommandPermissions(value) {
    var permissions = {};
    String(value || '').split(/[,\s]+/).forEach(function(item) {
        item = item.trim().toLowerCase();
        item = normalizeCommandName(item);
        if (item) permissions[item] = true;
    });
    return permissions;
}

function normalizeCommandName(command) {
    command = String(command || '').toLowerCase();
    if (command === 'point') return 'points';
    if (command === 'addpoints') return 'points';
    if (command === 'unbanned') return 'unban';
    return command;
}

function canUseCommand(user, command) {
    command = normalizeCommandName(command);
    var role = normalizeCommandRole(user && user.commandRole);
    if (role === 'admin' || role === 'moderator') return true;

    var permissions = normalizeCommandPermissions(user && user.commandPermissions);
    if (permissions[command] || permissions.all) return true;
    if (user && isTruthyCommandPermission(user[getCommandPermissionField(command)])) return true;

    return false;
}

function isTruthyCommandPermission(value) {
    return value === true || String(value || '').toLowerCase() === 'true' || String(value || '') === '1';
}

function getCommandPermissionField(command) {
    command = normalizeCommandName(command);
    return {
        playerlist: 'commandPlayerlist',
        status: 'commandStatus',
        say: 'commandSay',
        kick: 'commandKick',
        mass: 'commandMass',
        color: 'commandColor',
        merge: 'commandMerge',
        tp: 'commandTp',
        killall: 'commandKillall',
        ban: 'commandBan',
        unban: 'commandBan',
        points: 'commandPoint',
        name: 'commandName',
        split: 'commandSplit'
    }[command] || '';
}

function isPlayerCommandMessage(text) {
    var match = /^\/([a-z]+)(\s|$)/i.exec(String(text || '').trim());
    if (!match) return false;

    return {
        cmd: true,
        playerlist: true,
        kick: true,
        mass: true,
        color: true,
        merge: true,
        tp: true,
        say: true,
        killall: true,
        ban: true,
        unban: true,
        unbanned: true,
        point: true,
        points: true,
        addpoints: true,
        status: true,
        name: true,
        split: true
    }[match[1].toLowerCase()] === true;
}

function parseCommandArgs(text) {
    return String(text || '').trim().split(/\s+/).filter(Boolean);
}

function sendCommandMessage(gameServer, player, message) {
    if (!player || !message) return;

    if (gameServer && gameServer.sendSystemMessage) {
        gameServer.sendSystemMessage(player, message);
        return;
    }

    if (player.socket && player.socket.sendPacket) {
        player.socket.sendPacket(new Packet.Message(message));
    }
}

function getCommandTarget(gameServer, index) {
    var id = parseInt(index, 10);
    if (isNaN(id) || !gameServer || !gameServer.clients || !gameServer.clients[id]) {
        return null;
    }

    return {
        id: id,
        socket: gameServer.clients[id],
        player: gameServer.clients[id].playerTracker
    };
}

function getSelfCommandTarget(handler) {
    return {
        id: 'self',
        socket: handler.socket,
        player: handler.socket && handler.socket.playerTracker
    };
}

function getOptionalCommandTarget(handler, value) {
    if (!value || String(value).toLowerCase() === 'self' || String(value).toLowerCase() === 'me') {
        return getSelfCommandTarget(handler);
    }

    return getCommandTarget(handler.gameServer, value);
}

function findCommandPointUser(gameServer, identifier) {
    var idText = String(identifier || '').trim();
    var index = parseInt(idText, 10);

    if (!isNaN(index) && String(index) === idText && gameServer && gameServer.clients && gameServer.clients[index]) {
        var player = gameServer.clients[index].playerTracker;
        if (player && player.authUser && player.authUser.id) {
            return userStore.findByIdOrUsernameOrEmail(player.authUser.id);
        }
    }

    return userStore.findByIdOrUsernameOrEmail(idText);
}

function findCommandUser(gameServer, identifier) {
    var idText = String(identifier || '').trim();
    var index = parseInt(idText, 10);

    if (!isNaN(index) && String(index) === idText && gameServer && gameServer.clients && gameServer.clients[index]) {
        var player = gameServer.clients[index].playerTracker;
        if (player && player.authUser && player.authUser.id) {
            return userStore.findByIdOrUsernameOrEmail(player.authUser.id);
        }
    }

    return userStore.findByIdOrUsernameOrEmail(idText);
}

function closeLiveUserSockets(gameServer, userId) {
    if (!gameServer) return 0;

    var closed = 0;
    var clients = gameServer.allClients || gameServer.clients || [];
    clients.forEach(function(client) {
        var player = client && client.playerTracker;
        var authUser = player && player.authUser;
        if (!authUser || String(authUser.id || '') !== String(userId || '')) return;

        if (client.close) {
            client.close();
            closed++;
        }
    });

    return closed;
}

function isUserBanned(user) {
    return user && (user.banned === true || String(user.banned || '').toLowerCase() === 'true' || String(user.banned || '') === '1');
}

function syncLiveUserPoints(gameServer, userId, points) {
    if (!gameServer || !gameServer.clients) return;

    gameServer.clients.forEach(function(client) {
        var player = client && client.playerTracker;
        if (!player || !player.authUser || String(player.authUser.id || '') !== String(userId || '')) return;
        player.authUser.points = points;
        sendCommandMessage(gameServer, player, 'Points kamu sekarang: ' + points);
    });
}

function executePlayerCommand(handler, user, rawText) {
    var gameServer = handler.gameServer;
    var sender = handler.socket.playerTracker;
    var text = String(rawText || '').trim();
    if (/^\/cmd(\s|$)/i.test(text)) {
        text = text.replace(/^\/cmd\s*/i, '').trim();
    } else {
        text = text.replace(/^\//, '').trim();
    }
    var args = parseCommandArgs(text);
    var command = normalizeCommandName(args[0]);

    if (!command) {
        sendCommandMessage(gameServer, sender, 'Usage: /mass <index> <amount>, /kick <index>, /tp <index> <x> <y>, /playerlist');
        return true;
    }

    if (!canUseCommand(user, command)) {
        sendCommandMessage(gameServer, sender, 'Kamu tidak punya akses command ini.');
        return true;
    }

    if (command === 'playerlist') {
        var lines = ['Players connected: ' + gameServer.clients.length];
        gameServer.clients.forEach(function(client, i) {
            if (client && client.playerTracker) {
                lines.push(i + ': ' + (client.playerTracker.name || 'unnamed') + ' score=' + (client.playerTracker.score || 0));
            }
        });
        sendCommandMessage(gameServer, sender, lines.join(' | '));
        return true;
    }

    if (command === 'status') {
        sendCommandMessage(gameServer, sender, 'Players: ' + gameServer.clients.length + ' | Uptime: ' + Math.floor(process.uptime()) + 's');
        return true;
    }

    if (command === 'say') {
        var broadcast = args.slice(1).join(' ');
        if (!broadcast) {
            sendCommandMessage(gameServer, sender, 'Usage: /say <message>');
            return true;
        }
        gameServer.sendMessage('[Admin] ' + broadcast);
        sendCommandMessage(gameServer, sender, 'Broadcast sent.');
        return true;
    }

    if (command === 'killall') {
        var removed = 0;
        gameServer.clients.forEach(function(client) {
            var player = client && client.playerTracker;
            if (!player || !player.cells) return;
            player.cells.slice(0).forEach(function(cell) {
                gameServer.withWorld(player.world || client.world, function() {
                    this.removeNode(cell);
                    removed++;
                });
            });
        });
        sendCommandMessage(gameServer, sender, 'Removed ' + removed + ' cells.');
        return true;
    }

    if (command === 'points') {
        var targetUser = findCommandPointUser(gameServer, args[1]);
        var amount = parseInt(args[2], 10);

        if (!targetUser || isNaN(amount) || amount === 0) {
            sendCommandMessage(gameServer, sender, 'Usage: /point <nickname> <amount>');
            return true;
        }

        var currentPoints = parseInt(targetUser.points, 10) || 0;
        var nextPoints = currentPoints + amount;
        if (nextPoints < 0) {
            sendCommandMessage(gameServer, sender, 'Points tidak boleh kurang dari 0.');
            return true;
        }

        var updatedUser = userStore.updateUser(targetUser.id, {
            points: nextPoints,
            lastPointCommandBy: user.username || user.id || '',
            lastPointCommandReason: args.slice(3).join(' '),
            lastPointCommandAt: Date.now()
        });
        syncLiveUserPoints(gameServer, updatedUser.id, nextPoints);
        sendCommandMessage(gameServer, sender, 'Points ' + updatedUser.username + ': ' + currentPoints + ' -> ' + nextPoints + ' (' + (amount > 0 ? '+' : '') + amount + ')');
        return true;
    }

    if (command === 'ban') {
        var targetUser = findCommandUser(gameServer, args[1]);
        var reason = args.slice(2).join(' ').trim();

        if (!targetUser) {
            sendCommandMessage(gameServer, sender, 'Usage: /ban <index|username|email|id> <reason>');
            return true;
        }

        if (user && String(targetUser.id || '') === String(user.id || '')) {
            sendCommandMessage(gameServer, sender, 'Kamu tidak bisa ban akun sendiri.');
            return true;
        }

        var bannedUser = userStore.updateUser(targetUser.id, {
            banned: true,
            banReason: reason || 'Banned by admin command',
            bannedAt: Date.now(),
            bannedBy: user.username || user.id || '',
            sessionToken: '',
            sessionCreatedAt: 0
        });
        var closed = closeLiveUserSockets(gameServer, targetUser.id);
        sendCommandMessage(gameServer, sender, 'Banned ' + (bannedUser && bannedUser.username || targetUser.username || targetUser.id) + '. Closed sockets: ' + closed + '.');
        return true;
    }

    if (command === 'unban') {
        var targetUser = findCommandUser(gameServer, args[1]);

        if (!targetUser) {
            sendCommandMessage(gameServer, sender, 'Usage: /unban <username|email|id>');
            return true;
        }

        var unbannedUser = userStore.updateUser(targetUser.id, {
            banned: false,
            banReason: '',
            unbannedAt: Date.now(),
            unbannedBy: user.username || user.id || ''
        });
        sendCommandMessage(gameServer, sender, 'Unbanned ' + (unbannedUser && unbannedUser.username || targetUser.username || targetUser.id) + '.');
        return true;
    }

    if (command === 'kick') {
        var target = getCommandTarget(gameServer, args[1]);
        if (!target || !target.player) {
            sendCommandMessage(gameServer, sender, 'Usage: /kick <index>');
            return true;
        }
        if (target.socket.close) target.socket.close();
        sendCommandMessage(gameServer, sender, 'Player ' + target.id + ' kicked.');
        return true;
    }

    if (command === 'mass') {
        var target = args[2] ? getCommandTarget(gameServer, args[1]) : getSelfCommandTarget(handler);
        var mass = parseInt(args[2] || args[1], 10);
        if (!target || !target.player) {
            sendCommandMessage(gameServer, sender, 'Player index tidak ditemukan.');
            return true;
        }
        if (isNaN(mass) || mass < 1) {
            sendCommandMessage(gameServer, sender, 'Usage: /mass <amount> atau /mass <index> <amount>');
            return true;
        }
        target.player.cells.forEach(function(cell) { cell.mass = mass; });
        sendCommandMessage(gameServer, sender, 'Set mass of ' + (target.player.name || target.id) + ' to ' + mass + '.');
        return true;
    }

    if (command === 'color') {
        var color;
        var target;
        var colorOffset;
        if (args.length >= 5 || (args.length >= 3 && String(args[2] || '').toLowerCase() === 'black')) {
            target = getCommandTarget(gameServer, args[1]);
            colorOffset = 2;
        } else {
            target = getSelfCommandTarget(handler);
            colorOffset = 1;
        }
        if (!target || !target.player) {
            sendCommandMessage(gameServer, sender, 'Player index tidak ditemukan.');
            return true;
        }
        if (String(args[colorOffset] || '').toLowerCase() === 'black') {
            color = { r: 0, g: 0, b: 0 };
        } else {
            var r = parseInt(args[colorOffset], 10);
            var g = parseInt(args[colorOffset + 1], 10);
            var b = parseInt(args[colorOffset + 2], 10);
            if (isNaN(r) || isNaN(g) || isNaN(b)) {
                sendCommandMessage(gameServer, sender, 'Usage: /color <r> <g> <b>, /color black, atau /color <index> <r> <g> <b>');
                return true;
            }
            color = {
                r: Math.max(0, Math.min(255, r)),
                g: Math.max(0, Math.min(255, g)),
                b: Math.max(0, Math.min(255, b))
            };
        }
        target.player.setColor(color);
        target.player.cells.forEach(function(cell) { if (cell.setColor) cell.setColor(color); });
        sendCommandMessage(gameServer, sender, 'Color changed.');
        return true;
    }

    if (command === 'merge') {
        var target = getOptionalCommandTarget(handler, args[1]);
        if (!target || !target.player) {
            sendCommandMessage(gameServer, sender, 'Player index tidak ditemukan.');
            return true;
        }
        target.player.cells.forEach(function(cell) {
            cell.recombineTicks = 0;
        });
        sendCommandMessage(gameServer, sender, 'Forced merge for ' + (target.player.name || target.id) + '.');
        return true;
    }

    if (command === 'tp') {
        var target = args[3] ? getCommandTarget(gameServer, args[1]) : getSelfCommandTarget(handler);
        var x = parseInt(args[3] ? args[2] : args[1], 10);
        var y = parseInt(args[3] ? args[3] : args[2], 10);
        if (!target || !target.player) {
            sendCommandMessage(gameServer, sender, 'Player index tidak ditemukan.');
            return true;
        }
        if (isNaN(x) || isNaN(y)) {
            sendCommandMessage(gameServer, sender, 'Usage: /tp <x> <y> atau /tp <index> <x> <y>');
            return true;
        }
        target.player.cells.forEach(function(cell) {
            cell.position.x = x;
            cell.position.y = y;
        });
        sendCommandMessage(gameServer, sender, 'Teleported player ' + target.id + '.');
        return true;
    }

    if (command === 'name') {
        var target = gameServer && gameServer.clients && gameServer.clients[parseInt(args[1], 10)] && args.length > 2 ?
            getCommandTarget(gameServer, args[1]) :
            getSelfCommandTarget(handler);
        if (!target || !target.player) {
            sendCommandMessage(gameServer, sender, 'Player index tidak ditemukan.');
            return true;
        }
        var newName = target.id === 'self' ? args.slice(1).join(' ') : args.slice(2).join(' ');
        if (!newName) {
            sendCommandMessage(gameServer, sender, 'Usage: /name <newName> atau /name <index> <newName>');
            return true;
        }
        target.player.setName(newName);
        sendCommandMessage(gameServer, sender, 'Changed name of player ' + target.id + '.');
        return true;
    }

    if (command === 'split') {
        var target = args[2] ? getCommandTarget(gameServer, args[1]) : getSelfCommandTarget(handler);
        var times = parseInt(args[2] || args[1], 10) || 1;
        if (!target || !target.player) {
            sendCommandMessage(gameServer, sender, 'Player index tidak ditemukan.');
            return true;
        }
        times = Math.max(1, Math.min(16, times));
        gameServer.withWorld(target.player.world || target.socket.world, function() {
            for (var i = 0; i < times; i++) {
                this.splitCells(target.player);
            }
        });
        sendCommandMessage(gameServer, sender, 'Forced split x' + times + ' for player ' + target.id + '.');
        return true;
    }

    sendCommandMessage(gameServer, sender, 'Unknown command: ' + command);
    return true;
}

function getPlayerSkinKey(user) {
    return user && user.id ? 'user:' + String(user.id).toLowerCase() : '';
}

function getGuildSkinKey(user) {
    var guildTag = String(user && user.guildTag || user && user.guildPrefix || '').trim().toLowerCase();
    return guildTag ? 'guild:' + guildTag : '';
}

function getActiveSkinKey(user) {
    var activeSkinType = String(user && user.activeSkinType || 'player').toLowerCase();
    var guildSkinKey = getGuildSkinKey(user);

    if (activeSkinType === 'guild' && guildSkinKey && user.guildSkinUrl) {
        return guildSkinKey;
    }

    if (user && user.skinUrl) {
        return getPlayerSkinKey(user);
    }

    if (guildSkinKey && user && user.guildSkinUrl) {
        return guildSkinKey;
    }

    return '';
}

function applyAuthUserToClient(client, user) {
    client.authUser = {
        id: user.id,
        username: user.username,
        email: user.email,
        cellColor: user.cellColor || '#000000',
        hideNickname: user.hideNickname === true || String(user.hideNickname || '').toLowerCase() === 'true',
        accountType: user.accountType || 'Free',
        premiumUntil: user.premiumUntil || '',
        premiumChatColor: user.premiumChatColor || '',
        premiumChatBadge: user.premiumChatBadge || '',
        premiumChatEffect: user.premiumChatEffect || '',
        guildTag: user.guildTag || user.guildPrefix || (user.guild && (user.guild.tag || user.guild.prefix)) || '',
        activeSkinType: user.activeSkinType || 'player',
        battleTier: battleTier.forUser(user),
        rankedTier: battleTier.forUser(user),
        country_code: user.country_code || user.countryCode || '',
        commandRole: normalizeCommandRole(user.commandRole),
        commandPermissions: user.commandPermissions || ''
    };
    client.authUser.xp = parseInt(user.xp, 10) || 0;
    client.authUser.xpMax = parseInt(user.xpMax, 10) || 0;
    client.authUser.level = parseInt(user.level, 10) || 1;
    client.authUser.rankedWins = parseInt(user.rankedWins, 10) || 0;
    client.authUser.rankedLosses = parseInt(user.rankedLosses, 10) || 0;
    client.authUser.rankedProgress = parseInt(user.rankedProgress, 10) || 0;
    client.battleTier = client.authUser.rankedTier;
    client.skinKey = getActiveSkinKey(user);
    client.setGuildTag(client.authUser.guildTag);
}

function PacketHandler(gameServer, socket) {
    this.gameServer = gameServer;
    this.socket = socket;
    this.merg = false;
    this.pressW = false;
    this.pressSpace = false;
	this.massSize = false;
}

module.exports = PacketHandler;

PacketHandler.prototype.handleMessage = function(message) {
    if (!message || message.length < 1) {
        return;
    }

    function stobuf(buf) {
        var length = buf.length;
        var arrayBuf = new ArrayBuffer(length);
        var view = new Uint8Array(arrayBuf);

        for (var i = 0; i < length; i++) {
            view[i] = buf[i];
        }

        return view.buffer;
    }

    var buffer = stobuf(message);
    var view = new DataView(buffer);
    var packetId = view.getUint8(0, true);
    var client = this.socket.playerTracker;

    switch (packetId) {
        case 0:
            // Set Nickname
            var nick = "";
            for (var i = 1; i + 1 < view.byteLength; i += 2) {
                var charCode = view.getUint16(i, true);
                if (charCode == 0) {
                    break;
                }

                nick += String.fromCharCode(charCode);
            }
            this.setNickname(nick);
            break;
        case 1:
            // Spectate mode
            if (this.socket.playerTracker.cells.length <= 0) {
                // Make sure client has no cells
                this.socket.playerTracker.spectate = true;
            }
            break;
        case 10:
            // Set game mode/world before spawning
            var mode = "";
            for (var i = 1; i + 1 < view.byteLength; i += 2) {
                var charCode = view.getUint16(i, true);
                if (charCode == 0) {
                    break;
                }

                mode += String.fromCharCode(charCode);
            }
            var modeParts = String(mode || '').split('|');
            mode = modeParts[0];
            if (modeParts[1]) {
                this.socket.battleLobbyClientId = modeParts[1];
                this.socket.playerTracker.battleLobbyClientId = modeParts[1];
            }
            this.gameServer.setClientWorld(this.socket, mode);
            break;
        case 16:
            // Mouse Move
            if (client.isPaused) {
                break;
            }
            if (view.byteLength < 17) {
                break;
            }
            client.mouse.x = view.getFloat64(1, true);
            client.mouse.y = view.getFloat64(9, true);
            break;

		case 17: 
            // Space Press - Split cell
            if (client.isPaused) {
                break;
            }
            this.pressSpace = true;
            break;
		    	 case 87:
            if (client.isPaused) {
                break;
            }
this.massSize = true;
		    break;
		     case 52:
            if (client.isPaused) {
                break;
            }
this.merg = true;
		    break;
        case 21: 
            // W Press - Eject mass
            if (client.isPaused) {
                break;
            }
            this.gameServer.withWorld(this.socket.world, function() {
                this.ejectMass(client);
            });
            break;
        case 90:
            // Pause game input while menu overlay is open
            client.isPaused = true;
            this.pressSpace = false;
            this.pressW = false;
            this.merg = false;
            this.massSize = false;
            break;
        case 91:
            // Resume game input after menu overlay is closed
            client.isPaused = false;
            break;
        case 42:
            var message = "";
            for (var i = 1; i + 1 < view.byteLength; i += 2) {
                var charCode = view.getUint16(i, true);
                if (charCode == 0) {
                    break;
                }

                message += String.fromCharCode(charCode);
            }
            this.gameServer.withWorld(this.socket.world, function() {
                this.sendMessage(message);
            });
            break;
        case 255:
            // Connection Start - Send SetBorder packet first
            var c = this.gameServer.getWorldConfig(this.socket.world);
            this.socket.sendPacket(new Packet.SetBorder(c.borderLeft, c.borderRight, c.borderTop, c.borderBottom));
            break;
         case 99:
            var message = "";
            var maxLen = 200 * 2; // 2 bytes per char
            var offset = 2;
            if (view.byteLength < offset) {
                break;
            }
            var flags = view.getUint8(1); // for future use (e.g. broadcast vs local message)
            if (flags & 2) {
                offset += 4;
            }
            if (flags & 4) {
                offset += 8;
            }
            if (flags & 8) {
                offset += 16;
            }
            if (offset >= view.byteLength) {
                break;
            }
            var messageEnd = Math.min(view.byteLength, offset + maxLen);
            for (var i = offset; i + 1 < messageEnd; i += 2) {
                var charCode = view.getUint16(i, true);
                if (charCode == 0) {
                    break;
                }
                message += String.fromCharCode(charCode);
            }
            offset = i + 2;

            var token = "";
            var user = null;
            if (flags & 16) {
                for (i = offset; i + 1 < view.byteLength; i += 2) {
                    charCode = view.getUint16(i, true);
                    if (charCode == 0) {
                        break;
                    }
                    token += String.fromCharCode(charCode);
                }

                user = token ? userStore.findBySessionToken(token) : null;
                if (isUserBanned(user)) {
                    if (this.socket.close) this.socket.close();
                    break;
                }
                if (user) {
                    applyAuthUserToClient(this.socket.playerTracker, user);
                    if (!this.socket.playerTracker.getName()) {
                        this.socket.playerTracker.setName(user.username);
                    }
                }
            }

            if (isPlayerCommandMessage(message)) {
                executePlayerCommand(this, user, message);
                break;
            }

            var isGuildChat = /^\/g\s+/i.test(message);

            if (isGuildChat) {
                if (!user) {
                    break;
                }

                message = message.replace(/^\/g\s+/i, "").trim();

                if (!message) {
                    break;
                }

                var player = this.socket.playerTracker;
                var guildId = this.gameServer.getPlayerGuildId ?
                    this.gameServer.getPlayerGuildId(player) :
                    (player.guildId || player.guild_id || player.guildTag || (player.user && player.user.guild_id));

                if (!guildId) {
                    if (this.gameServer.sendSystemMessage) {
                        this.gameServer.sendSystemMessage(player, "Kamu belum punya guild.");
                    } else {
                        this.socket.sendPacket(new Packet.Message("Kamu belum punya guild."));
                    }
                    break;
                }

                this.gameServer.withWorld(this.socket.world, function() {
                    this.sendGuildChat(player, message);
                });
                break;
            }

            if (!user || !isPremiumUser(user)) {
                if (user) {
                    this.socket.sendPacket(new Packet.Message(PREMIUM_CHAT_WARNING));
                }
                break;
            }

            var premiumChatColor = hexToColor(user.premiumChatColor);
            var premiumChatEffect = normalizePremiumChatEffect(user.premiumChatEffect);
            var premiumChatFlags = premiumChatEffect === 'bull' ? 64 : premiumChatEffect === 'love' ? 128 : 0;
            if (premiumChatEffect) {
                message = CHAT_EFFECT_START + premiumChatEffect + CHAT_EFFECT_END + message;
            }
            var packet = new Packet.Chat(this.socket.playerTracker, message, premiumChatFlags, premiumChatColor);
            this.gameServer.withWorld(this.socket.world, function() {
                // Send to clients in the same world
                for (var i = 0; i < this.clients.length; i++) {
                    this.clients[i].sendPacket(packet);
                }
            });
            break;
default:
            break;
    }
}

PacketHandler.prototype.setNickname = function(newNick) {
    var client = this.socket.playerTracker;
    var parts = String(newNick || '').split('|');
    var nick = parts[0];
    var token = parts[1];
    var user = token ? userStore.findBySessionToken(token) : null;

    var world = client.world || this.socket.world;
    var gameMode = world ? world.gameMode : this.gameServer.gameMode;
    var usesTeams = gameMode && gameMode.haveTeams;

    if (user) {
        if (isUserBanned(user)) {
            if (this.socket.close) this.socket.close();
            return;
        }

        nick = user.username;
        applyAuthUserToClient(client, user);

        if (!usesTeams && user.cellColor && user.cellColor !== '#000000') {
            var color = hexToColor(user.cellColor);
            if (color) {
                client.setColor(color);
            }
        } else if (!usesTeams) {
            client.setColor(this.gameServer.getRandomColor());
        }
    } else {
        client.setGuildTag("");
        client.skinKey = "";
        client.battleTier = "UNRANKED";
    }

    if (client.cells.length < 1) {
        // If client has no cells... then spawn a player
        this.gameServer.withWorld(client.world, function() {
            this.spawnPlayerForMode(client);
        });
        
        // Turn off spectate mode
        client.spectate = false;
    }
	client.setName(nick);
}

