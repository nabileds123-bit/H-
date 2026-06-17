var Packet = require('./packet');
var userStore = require('./auth/userStore');

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

    return {
        bull: true,
        love: true,
        lightning: true,
        fire: true,
        star: true,
        crown: true,
        confetti: true
    }[value] ? value : '';
}

function applyAuthUserToClient(client, user) {
    client.authUser = {
        id: user.id,
        username: user.username,
        email: user.email,
        cellColor: user.cellColor || '#000000',
        accountType: user.accountType || 'Free',
        premiumUntil: user.premiumUntil || '',
        premiumChatColor: user.premiumChatColor || '',
        premiumChatBadge: user.premiumChatBadge || '',
        premiumChatEffect: user.premiumChatEffect || '',
        guildTag: user.guildTag || user.guildPrefix || (user.guild && (user.guild.tag || user.guild.prefix)) || '',
        activeSkinType: user.activeSkinType || 'player',
        country_code: user.country_code || user.countryCode || ''
    };
    client.authUser.xp = parseInt(user.xp, 10) || 0;
    client.authUser.xpMax = parseInt(user.xpMax, 10) || 0;
    client.authUser.level = parseInt(user.level, 10) || 1;
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
                if (user) {
                    applyAuthUserToClient(this.socket.playerTracker, user);
                    if (!this.socket.playerTracker.getName()) {
                        this.socket.playerTracker.setName(user.username);
                    }
                }
            }

            if (!user || !isPremiumUser(user)) {
                if (user) {
                    this.socket.sendPacket(new Packet.Message(PREMIUM_CHAT_WARNING));
                }
                break;
            }

            var isGuildChat = /^\/g\s+/i.test(message);

            if (isGuildChat) {
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
    }

    if (client.cells.length < 1) {
        // If client has no cells... then spawn a player
        this.gameServer.withWorld(client.world, function() {
            this.spawnPlayer(client);
        });
        
        // Turn off spectate mode
        client.spectate = false;
    }
	client.setName(nick);
}

