// Library imports
var WebSocket = require('ws');
var fs = require("fs");
var path = require("path");
var ini = require('./modules/ini.js');

// Project imports
var Packet = require('./packet');
var PlayerTracker = require('./PlayerTracker');
var PacketHandler = require('./PacketHandler');
var Entity = require('./entity');
var Gamemode = require('./gamemodes');
var AuthServer = require('./auth/authServer');
var AdminServer = require('./admin/AdminServer');
var StatsServer = require('./stats/StatsServer');
var statsStore = require('./stats/statsStore');
var userStore = require('./auth/userStore');
var configPath = path.join(__dirname, '..', 'gameserver.ini');
var adminConfigPath = path.join(__dirname, '..', 'data', 'adminConfig.json');

// GameServer implementation
function GameServer(mult, prt) {
    // Start msg
    console.log("[Game] Ogar - An open source Agar.io server implementation");
    this.multi = mult;
	this.port = prt;
    this.lastNodeId = 1;
    this.allClients = [];
    this.worlds = {};
    this.battleLobbies = {};
    this.activeWorld = null;
    this.clients = [];
    this.nodes = [];
    this.nodesVirus = []; // Virus nodes
    this.nodesEjected = []; // Ejected mass nodes
    this.nodesPlayer = []; // Nodes controlled by players
    
    this.currentFood = 0;
    this.movingNodes = []; // For move engine
    this.leaderboard = [];
    
    // Main loop tick
    this.time = new Date();
    this.tick = 0; // 1 second ticks of mainLoop
    this.tickMain = 0; // 50 ms ticks, 40 of these = 1 leaderboard update
    this.tickSpawn = 0; // 50 ms ticks, used with spawning food
    
    // Config
    this.config = { // Border - Right: X increases, Down: Y increases (as of 2015-05-20)
        serverMaxConnections: 64, // Maximum amount of connections to the server. 
        serverPort: 8080, // Server port
        serverGamemode: 0, // Gamemode, 0 = FFA, 1 = Teams
        serverOldColors: 0,// If the server uses colors from the original Ogar
		serverBots: 3, // Amount of player bots to spawn (Experimental)
	    rainbowCells: 0,
        serverViewBase: 1024, // Base view distance of players. Warning: high values may cause lag
        borderLeft: 0, // Left border of map (Vanilla value: 0)
        borderRight: 6000, // Right border of map (Vanilla value: 11180.3398875)
        borderTop: 0, // Top border of map (Vanilla value: 0)
        borderBottom: 6000, // Bottom border of map (Vanilla value: 11180.3398875)
        spawnInterval: 20, // The interval between each food cell spawn in ticks (1 tick = 50 ms)
        foodSpawnAmount: 10, // The amount of food to spawn per interval
        foodStartAmount: 100, // The starting amount of food in the map
        foodMaxAmount: 500, // Maximum food cells on the map
        foodMass: 1, // Starting food size (In mass)
        foodMaxMass: 4,
        virusMinAmount: 10, // Minimum amount of viruses on the map. 
        virusMaxAmount: 50, // Maximum amount of viruses on the map. If this amount is reached, then ejected cells will pass through viruses.
        virusStartMass: 100, // Starting virus size (In mass)
        virusBurstMass: 198, // Viruses explode past this size
        ejectMass: 16, // Mass of ejected cells
        ejectMassGain: 12, // Amount of mass gained from consuming ejected cells
        ejectSpeed: 160, // Base speed of ejected cells
        ejectSpawnPlayer: 50, // Chance for a player to spawn from ejected mass
        playerStartMass: 10, // Starting mass of the player cell.
        playerMaxMass: 22500, // Maximum mass a player can have
        playerSpeed: 745.28, // Base player movement speed
        playerMinMassEject: 32, // Mass required to eject a cell
        playerMinMassSplit: 36, // Mass required to split
        playerMaxCells: 16, // Max cells the player is allowed to have
        playerRecombineTime: 15, // Base amount of ticks before a cell is allowed to recombine (1 tick = 2000 milliseconds)
        playerMassDecayRate: 4, // Amount of mass lost per tick (Multiplier) (1 tick = 2000 milliseconds)
        playerMinMassDecay: 9, // Minimum mass for decay to occur
        leaderboardUpdateClient: 40, // How often leaderboard data is sent to the client (1 tick = 50 milliseconds)
	  //  serverSubdomain: 'marios-best-game',
	    ejectVirus: 0,
	    serverTitle: 'Ogar3',
	    serverPlaceholder: 'Nick',
        maintenanceMode: 0,
        maintenanceKey: 'change-this-key',
        maintenanceImage: '/img/bg.png',
        disabledWorlds: '',
        defaultWorld: '',
        hardcoreRoomMaxPlayers: 32,
        tourneyAutoFill: 0,
        tourneyAutoFillPlayers: 1,
        tourneyPrepTime: 5,
        tourneyEndTime: 15,
        tourneyMaxPlayers: 12,
        tourneyTimeLimit: 60,
        playerDisconnectTime: 0
    };
    // Parse config
    this.loadConfig();
    
    // Gamemodes
    this.gameMode = Gamemode.list[this.config.serverGamemode];
    if (!this.gameMode) {
        this.gameMode = Gamemode.list[0]; // Default is FFA
    }
    this.initWorlds();
    
    // Colors
    this.colors = [{'r':235,'b':0,'g':75},{'r':225,'b':255,'g':125},{'r':180,'b':20,'g':7},{'r':80,'b':240,'g':170},{'r':180,'b':135,'g':90},{'r':195,'b':0,'g':240},{'r':150,'b':255,'g':18},{'r':80,'b':0,'g':245},{'r':165,'b':0,'g':25},{'r':80,'b':0,'g':145},{'r':80,'b':240,'g':170},{'r':55,'b':255,'g':92}]; 
}

module.exports = GameServer;

GameServer.prototype.start = function() {
    var self = this;
    // Gamemode configurations
    for (var worldId in this.worlds) {
        this.ensureWorldInitialized(this.worlds[worldId]);
    }
    
    this.config.serverPort = process.env.PORT || this.config.serverPort ;
    
    
    var http = require('http');

    var finalhandler = require('finalhandler');
    var serveStatic = require('serve-static');
    
    
    var serve = serveStatic(__dirname);
    function sendJson(res, status, payload) {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify(payload));
    }

    function readJson(req, callback) {
      var body = '';
      req.on('data', function(chunk) {
        body += chunk;
        if (body.length > 8192) {
          req.destroy();
        }
      });
      req.on('end', function() {
        try {
          callback(null, body ? JSON.parse(body) : {});
        } catch (err) {
          callback(err);
        }
      });
    }

    function hasMaintenanceAccess(req) {
      return AdminServer.hasSession(req);
    }

    function showMaintenance(res) {
      var maintenanceImage = String(self.config.maintenanceImage || '/img/bg.png');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end([
        '<!doctype html>',
        '<html>',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<title>Maintenance</title>',
        '<style>',
        'html,body{margin:0;width:100%;height:100%;background:#eef7fa;}',
        'body{display:flex;align-items:center;justify-content:center;}',
        'img{width:100%;height:100%;object-fit:contain;}',
        '</style>',
        '</head>',
        '<body>',
        '<img src="' + maintenanceImage + '" alt="Maintenance">',
        '</body>',
        '</html>'
      ].join(''));
    }
    
    var hserver = http.createServer(function(req, res){
      var pathname = req.url.split('?')[0];

      if (AuthServer.handle(req, res)) {
        return;
      }

      if (StatsServer.handle(req, res)) {
        return;
      }

      if (AdminServer.handle(req, res, self)) {
        return;
      }

      if (pathname == '/api/battle/lobby' && req.method == 'POST') {
        readJson(req, function(err, body) {
          if (err) return sendJson(res, 400, { ok: false, message: 'Invalid JSON.' });
          sendJson(res, 200, self.joinBattleLobby(body));
        });
        return;
      }

      if (pathname == '/api/battle/lobby/status' && req.method == 'POST') {
        readJson(req, function(err, body) {
          if (err) return sendJson(res, 400, { ok: false, message: 'Invalid JSON.' });
          sendJson(res, 200, self.getBattleLobbyStatus(body));
        });
        return;
      }

      if (pathname == '/api/battle/lobby/leave' && req.method == 'POST') {
        readJson(req, function(err, body) {
          if (err) return sendJson(res, 400, { ok: false, message: 'Invalid JSON.' });
          sendJson(res, 200, self.leaveBattleLobby(body));
        });
        return;
      }

      if (parseInt(self.config.maintenanceMode) === 1 && !hasMaintenanceAccess(req)) {
        var maintenanceImage = String(self.config.maintenanceImage || '/img/bg.png');
        if (pathname !== maintenanceImage && pathname !== '/favicon.ico') {
          showMaintenance(res);
          return;
        }
      }

      if (pathname == '/client/info.php' || pathname == '/info.php') {
        var baseRegions = [
          'US-Fremont',
          'US-Atlanta',
          'BR-Brazil',
          'EU-London',
          'RU-Russia',
          'TK-Turkey',
          'JP-Tokyo',
          'CN-China',
          'SG-Singapore'
        ];
        var regions = {};
        var onlinePlayers = 0;

        for (var i = 0; i < self.allClients.length; i++) {
          var client = self.allClients[i];
          if (client && client.readyState === WebSocket.OPEN && client.playerTracker && client.playerTracker.getStatus()) {
            onlinePlayers++;
          }
        }

        for (var r = 0; r < baseRegions.length; r++) {
          regions[baseRegions[r]] = {
            numPlayers: baseRegions[r] === 'SG-Singapore' ? onlinePlayers : 0,
            numRealms: 1,
            numServers: baseRegions[r] === 'SG-Singapore' ? 1 : 0
          };
        }

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
          MASTER_START: Date.now(),
          regions: regions,
          totals: {
            numPlayers: onlinePlayers,
            numRealms: 1,
            numServers: 1
          }
        }));
        return;
      }

      if (pathname == '/client/checkdir.php' || pathname == '/checkdir.php') {
        var skinsDir = path.join(__dirname, 'skins');
        fs.readdir(skinsDir, function(err, files) {
          var names = [];
          var skinFiles = {};

          if (!err && files) {
            names = files
              .filter(function(file) {
                return /\.png$/i.test(file);
              })
              .map(function(file) {
                return path.basename(file, path.extname(file));
              });
          }

          function getPlayerSkinKey(user) {
            return user && user.id ? 'user:' + String(user.id).toLowerCase() : '';
          }

          function getGuildSkinKey(guildTag) {
            guildTag = String(guildTag || '').trim().toLowerCase();
            return guildTag ? 'guild:' + guildTag : '';
          }

          userStore.listUsers().forEach(function(user) {
            var playerSkinKey = getPlayerSkinKey(user);
            var guildTag = String(user.guildTag || '').trim();
            var guildSkinKey = getGuildSkinKey(guildTag);
            var activeSkinType = String(user.activeSkinType || 'player').toLowerCase();

            if (activeSkinType === 'guild' && guildSkinKey && user.guildSkinUrl) {
              names.push(guildSkinKey);
              skinFiles[guildSkinKey] = user.guildSkinUrl;
              return;
            }

            if (playerSkinKey && user.skinUrl) {
              names.push(playerSkinKey);
              skinFiles[playerSkinKey] = user.skinUrl;
            } else if (guildSkinKey && user.guildSkinUrl) {
              names.push(guildSkinKey);
              skinFiles[guildSkinKey] = user.guildSkinUrl;
            }
          });

          var payload = {
            action: 'test',
            names: JSON.stringify(names),
            files: JSON.stringify(skinFiles)
          };
          payload.json = JSON.stringify(payload);

          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(JSON.stringify(payload));
        });
        return;
      }

      var done = finalhandler(req, res)
      serve(req, res, done)
    });
    var listenPort = this.multi ? this.port : this.config.serverPort;
    hserver.listen(listenPort);
    
    
    // Start the server
    this.socketServer = new WebSocket.Server({server: hserver });
    
    for (var worldId in this.worlds) {
        this.withWorld(this.worlds[worldId], function() {
            var config = this.getWorldConfig();
            for (var i = 0; i < config.foodStartAmount; i++) {
                this.spawnFood();
            }
        });
    }
    
    // Start Main Loop
    setInterval(this.mainLoop.bind(this), 50);
    
    // Done
    console.log("[Game] Listening on port %d", listenPort);
    console.log("[Game] Current game mode is "+this.gameMode.name);
    
    // Player bots (Experimental)

    if (this.config.serverBots > 0) {
        var BotLoader = require('./ai/BotLoader.js');
        this.bots = new BotLoader(this,this.config.serverBots);
        console.log("[Game] Loaded "+this.config.serverBots+" player bots");
    }
    this.socketServer.on('connection', connectionEstablished.bind(this));

    function connectionEstablished(ws) {
        if (this.allClients.length > this.config.serverMaxConnections) {
            ws.close();
            console.log("[Game] Client tried to connect, but server player limit has been reached!");
            return;
        }
    	
        function close(error) {
            console.log("[Game] Disconnect: %s:%d", this.socket.remoteAddress, this.socket.remotePort);
            this.server.pauseTop1Stats(this.socket.playerTracker, this.socket.world, true);
            this.server.removeClientCells(this.socket.playerTracker);

            var index = this.server.allClients.indexOf(this.socket);
            if (index != -1) {
                this.server.allClients.splice(index, 1);
            }

            if (this.socket.world) {
                index = this.socket.world.clients.indexOf(this.socket);
                if (index != -1) {
                    this.socket.world.clients.splice(index, 1);
                }
            }
            
            // Switch online flag off
            this.socket.playerTracker.setStatus(false);
        }

        console.log("[Game] Connect: %s:%d", ws._socket.remoteAddress, ws._socket.remotePort);
        ws.remoteAddress = ws._socket.remoteAddress;
        ws.remotePort = ws._socket.remotePort;
        ws.playerTracker = new PlayerTracker(this, ws);
        ws.packetHandler = new PacketHandler(this, ws);
        this.setClientWorld(ws, this.getDefaultWorldId(), true);
        ws.on('message', ws.packetHandler.handleMessage.bind(ws.packetHandler));

        var bindObject = { server: this, socket: ws };
        ws.on('error', close.bind(bindObject));
        ws.on('close', close.bind(bindObject));
        this.allClients.push(ws);
    }
}

GameServer.prototype.getMode = function() {
    return this.gameMode;
}

GameServer.prototype.normalizeBattleLobbyMode = function(mode) {
    mode = String(mode || '').toLowerCase();
    if (mode === '1v1' || mode === '1vs1' || mode === ':battle:1v1') return ':battle:1v1';
    if (mode === '2v2' || mode === '2vs2' || mode === ':battle:2v2') return ':battle:2v2';
    return '';
}

GameServer.prototype.getBattleLobbySize = function(mode) {
    return mode === ':battle:2v2' ? 4 : 2;
}

GameServer.prototype.getBattleLobby = function(mode) {
    if (!this.battleLobbies[mode]) {
        this.battleLobbies[mode] = {
            members: [],
            activeMatch: null
        };
    }
    return this.battleLobbies[mode];
}

GameServer.prototype.isBattleWorldAvailable = function(mode) {
    var world = this.worlds[mode];
    if (!world || !world.gameMode) return false;
    return world.gameMode.gamePhase === 0;
}

GameServer.prototype.pruneBattleLobby = function(mode) {
    var lobby = this.getBattleLobby(mode);
    var now = Date.now();

    lobby.members = lobby.members.filter(function(member) {
        return member && member.clientId && (!member.expiresAt || member.expiresAt > now);
    });

    if (lobby.activeMatch && lobby.activeMatch.expiresAt <= now) {
        lobby.activeMatch = null;
    }
}

GameServer.prototype.releaseBattleLobbyIfReady = function(mode) {
    var lobby = this.getBattleLobby(mode);
    var size = this.getBattleLobbySize(mode);
    var now = Date.now();

    if (lobby.activeMatch || lobby.members.length < size || !this.isBattleWorldAvailable(mode)) {
        return;
    }

    lobby.activeMatch = {
        id: now.toString(36) + Math.random().toString(36).slice(2),
        mode: mode,
        members: lobby.members.slice(0, size),
        expiresAt: now + 30000
    };
    lobby.members = lobby.members.slice(size);
}

GameServer.prototype.getBattleLobbyPayload = function(mode, clientId) {
    this.pruneBattleLobby(mode);
    this.releaseBattleLobbyIfReady(mode);

    var lobby = this.getBattleLobby(mode);
    var size = this.getBattleLobbySize(mode);
    var activeMatch = lobby.activeMatch;
    var ready = false;
    var players = lobby.members;

    if (activeMatch) {
        for (var i = 0; i < activeMatch.members.length; i++) {
            if (activeMatch.members[i].clientId === clientId) {
                ready = true;
                players = activeMatch.members;
                break;
            }
        }
    }

    return {
        ok: true,
        mode: mode,
        ready: ready,
        players: players.map(function(member) {
            return {
                name: member.name || 'Player',
                clientId: member.clientId
            };
        }),
        count: players.length,
        required: size,
        status: ready ? 'Match ready' : (this.isBattleWorldAvailable(mode) ? 'Waiting for players' : 'Battle in progress')
    };
}

GameServer.prototype.joinBattleLobby = function(data) {
    var mode = this.normalizeBattleLobbyMode(data && data.mode);
    var clientId = String(data && data.clientId || '').trim();
    var name = String(data && data.name || 'Player').trim().slice(0, 32) || 'Player';
    var lobby;
    var now = Date.now();
    var found = false;

    if (!mode || !this.worlds[mode]) {
        return { ok: false, message: 'Battle mode is inactive.' };
    }
    if (!clientId) {
        return { ok: false, message: 'Missing lobby client.' };
    }

    this.pruneBattleLobby(mode);
    lobby = this.getBattleLobby(mode);

    for (var i = 0; i < lobby.members.length; i++) {
        if (lobby.members[i].clientId === clientId) {
            lobby.members[i].name = name;
            lobby.members[i].expiresAt = now + 45000;
            found = true;
            break;
        }
    }

    if (!found) {
        lobby.members.push({
            clientId: clientId,
            name: name,
            joinedAt: now,
            expiresAt: now + 45000
        });
    }

    return this.getBattleLobbyPayload(mode, clientId);
}

GameServer.prototype.getBattleLobbyStatus = function(data) {
    var mode = this.normalizeBattleLobbyMode(data && data.mode);
    var clientId = String(data && data.clientId || '').trim();

    if (!mode || !this.worlds[mode]) {
        return { ok: false, message: 'Battle mode is inactive.' };
    }

    return this.getBattleLobbyPayload(mode, clientId);
}

GameServer.prototype.leaveBattleLobby = function(data) {
    var mode = this.normalizeBattleLobbyMode(data && data.mode);
    var clientId = String(data && data.clientId || '').trim();
    var lobby;

    if (!mode || !this.worlds[mode]) {
        return { ok: true };
    }

    lobby = this.getBattleLobby(mode);
    lobby.members = lobby.members.filter(function(member) {
        return member.clientId !== clientId;
    });

    return this.getBattleLobbyPayload(mode, clientId);
}

GameServer.prototype.createWorld = function(id, gameMode, config) {
    return {
        id: id,
        clients: [],
        nodes: [],
        nodesVirus: [],
        nodesEjected: [],
        nodesPlayer: [],
        currentFood: 0,
        movingNodes: [],
        leaderboard: [],
        tickSpawn: 0,
        tickMain: 0,
        gameMode: gameMode,
        config: config || {},
        initialized: false
    };
}

GameServer.prototype.initWorlds = function() {
    if (Gamemode.Tournament && !this.isWorldDisabled(':tournament')) {
        this.worlds[':tournament'] = this.createWorld(':tournament', new Gamemode.Tournament(), this.getModeConfig('tournament'));
    }
    if (!this.isWorldDisabled(':x5')) {
        this.worlds[':x5'] = this.createWorld(':x5', new Gamemode.X5(), this.getModeConfig('x5'));
    }
    if (!this.isWorldDisabled(':hardcore:1')) {
        this.worlds[':hardcore:1'] = this.createWorld(':hardcore:1', new Gamemode.FFA(), this.getModeConfig('hardcore'));
    }
    if (!this.isWorldDisabled(':hardcore:2')) {
        this.worlds[':hardcore:2'] = this.createWorld(':hardcore:2', new Gamemode.FFA(), this.getModeConfig('hardcore'));
    }
    if (!this.isWorldDisabled(':teams')) {
        this.worlds[':teams'] = this.createWorld(':teams', new Gamemode.Teams(), this.getModeConfig('teams'));
    }
    if (!this.isWorldDisabled(':experimental')) {
        this.worlds[':experimental'] = this.createWorld(':experimental', new Gamemode.Experimental(), this.getModeConfig('experimental'));
    }
    if (!this.isWorldDisabled(':battle:1v1')) {
        this.worlds[':battle:1v1'] = this.createWorld(':battle:1v1', new Gamemode.Tournament(), this.getBattleTournamentConfig('battle1v1', 2, 1));
    }
    if (!this.isWorldDisabled(':battle:2v2')) {
        this.worlds[':battle:2v2'] = this.createWorld(':battle:2v2', new Gamemode.Tournament(), this.getBattleTournamentConfig('battle2v2', 4, 2));
    }
    this.setActiveWorld(this.worlds[this.getDefaultWorldId()]);
}

GameServer.prototype.setActiveWorld = function(world) {
    if (!world) {
        throw new Error('No enabled game world is available.');
    }

    this.activeWorld = world;
    this.clients = world.clients;
    this.nodes = world.nodes;
    this.nodesVirus = world.nodesVirus;
    this.nodesEjected = world.nodesEjected;
    this.nodesPlayer = world.nodesPlayer;
    this.currentFood = world.currentFood;
    this.movingNodes = world.movingNodes;
    this.leaderboard = world.leaderboard;
    this.gameMode = world.gameMode;
}

GameServer.prototype.saveActiveWorld = function() {
    if (!this.activeWorld) return;

    this.activeWorld.currentFood = this.currentFood;
    this.activeWorld.leaderboard = this.leaderboard;
}

GameServer.prototype.isWorldDisabled = function(worldId) {
    var disabled = String(this.config.disabledWorlds || '').split(',');
    worldId = String(worldId || '').trim().toLowerCase();

    for (var i = 0; i < disabled.length; i++) {
        if (String(disabled[i] || '').trim().toLowerCase() === worldId) {
            return true;
        }
    }

    return false;
}

GameServer.prototype.getDefaultWorldId = function() {
    var preferred = String(this.config.defaultWorld || '').trim();
    var fallbacks = [
        preferred,
        ':hardcore:1',
        ':x5',
        ':battle:1v1',
        ':battle:2v2',
        ':hardcore:2',
        ':tournament',
        ':teams',
        ':experimental'
    ];

    for (var i = 0; i < fallbacks.length; i++) {
        if (fallbacks[i] && this.worlds[fallbacks[i]]) {
            return fallbacks[i];
        }
    }

    for (var worldId in this.worlds) {
        return worldId;
    }

    throw new Error('No enabled game world is available.');
}

GameServer.prototype.getModeConfig = function(prefix) {
    var config = {};

    for (var key in this.config) {
        var overrideKey = prefix + key.charAt(0).toUpperCase() + key.slice(1);
        if (typeof this.config[overrideKey] !== 'undefined') {
            config[key] = this.config[overrideKey];
        }
    }

    return config;
}

GameServer.prototype.getBattleTournamentConfig = function(prefix, maxPlayers, teamSize) {
    var config = this.getModeConfig(prefix);

    config.tourneyMaxPlayers = maxPlayers;
    config.tourneyAutoFillPlayers = maxPlayers;
    config.battleTeamSize = teamSize || 1;
    config.battleTeamCount = Math.max(1, Math.ceil(maxPlayers / config.battleTeamSize));

    return config;
}

GameServer.prototype.getWorldConfig = function(world) {
    var config = {};

    for (var key in this.config) {
        config[key] = this.config[key];
    }

    world = world || this.activeWorld;
    if (world && world.config) {
        for (var overrideKey in world.config) {
            config[overrideKey] = world.config[overrideKey];
        }
    }

    return config;
}

GameServer.prototype.ensureWorldInitialized = function(world) {
    if (!world || world.initialized) return;

    var previous = this.activeWorld;
    this.saveActiveWorld();
    this.setActiveWorld(world);
    this.gameMode.onServerInit(this);
    world.initialized = true;
    this.saveActiveWorld();

    if (previous) {
        this.setActiveWorld(previous);
    }
}

GameServer.prototype.withWorld = function(world, callback) {
    var previous = this.activeWorld;
    var fallback = this.worlds[this.getDefaultWorldId()];

    this.saveActiveWorld();
    this.ensureWorldInitialized(world || fallback);
    this.setActiveWorld(world || fallback);

    var result = callback.call(this);

    this.saveActiveWorld();
    if (previous) {
        this.setActiveWorld(previous);
    }
    return result;
}

GameServer.prototype.getWorldPlayerCount = function(world) {
    if (!world || !world.clients) return 0;

    var count = 0;
    for (var i = 0; i < world.clients.length; i++) {
        var client = world.clients[i];
        if (client && client.playerTracker && client.playerTracker.getStatus()) {
            count++;
        }
    }
    return count;
}

GameServer.prototype.getHardcoreRoomMaxPlayers = function() {
    var maxPlayers = parseInt(this.config.hardcoreRoomMaxPlayers, 10);
    return maxPlayers > 0 ? maxPlayers : parseInt(this.config.serverMaxConnections, 10) || 64;
}

GameServer.prototype.resolveHardcoreWorldId = function() {
    var room1 = this.worlds[':hardcore:1'];
    var room2 = this.worlds[':hardcore:2'];
    var maxPlayers = this.getHardcoreRoomMaxPlayers();

    if (room1 && this.getWorldPlayerCount(room1) < maxPlayers) return ':hardcore:1';
    if (room2) return ':hardcore:2';
    if (room1) return ':hardcore:1';
    return null;
}

GameServer.prototype.isBattleModeRequest = function(mode) {
    mode = String(mode || '').toLowerCase();
    return mode === ':battle' || mode.indexOf(':battle') === 0;
}

GameServer.prototype.resolveWorldId = function(mode, allowFallback) {
    if (mode == ':hardcore') {
        return this.resolveHardcoreWorldId();
    }

    if (this.worlds[mode]) {
        return mode;
    }

    if (!this.isBattleModeRequest(mode) && this.worlds[':tournament']) {
        return ':tournament';
    }

    return allowFallback ? this.getDefaultWorldId() : null;
}

GameServer.prototype.setClientWorld = function(socket, mode, allowFallback) {
    var worldId = this.resolveWorldId(mode, allowFallback);
    var world = this.worlds[worldId];
    if (!world) {
        console.log("[Game] Client requested inactive world " + mode + "; closing connection");
        if (socket && typeof socket.close === 'function') {
            socket.close(4001, 'inactive_world');
        }
        return false;
    }

    socket.sendPacket(new Packet.ClearNodes());
    var worldConfig = this.getWorldConfig(world);
    socket.sendPacket(new Packet.SetBorder(worldConfig.borderLeft, worldConfig.borderRight, worldConfig.borderTop, worldConfig.borderBottom));

    if (socket.world === world) {
        this.removeClientCells(socket.playerTracker);
        socket.playerTracker.visibleNodes = [];
        socket.playerTracker.nodeDestroyQueue = [];
        socket.playerTracker.cells = [];
        socket.playerTracker.spectate = false;
        return;
    }

    if (socket.world) {
        this.removeClientCells(socket.playerTracker);
        var oldIndex = socket.world.clients.indexOf(socket);
        if (oldIndex != -1) {
            socket.world.clients.splice(oldIndex, 1);
        }
    }

    socket.world = world;
    console.log("[Game] Client world set to " + world.id + " (" + world.gameMode.name + ")");
    socket.playerTracker.world = world;
    socket.playerTracker.visibleNodes = [];
    socket.playerTracker.nodeDestroyQueue = [];
    socket.playerTracker.cells = [];
    socket.playerTracker.spectate = false;
    world.clients.push(socket);
    this.withWorld(world, function() {
        this.gameMode.onPlayerInit(socket.playerTracker);
    });
    return true;
}

GameServer.prototype.removeClientCells = function(client) {
    if (!client || !client.cells) return;

    var cells = client.cells.slice(0);
    for (var i = 0; i < cells.length; i++) {
        var cell = cells[i];
        if (cell && cell.owner && cell.owner.world) {
            this.withWorld(cell.owner.world, function() {
                this.removeNode(cell);
            });
        }
    }

    client.cells = [];
    client.visibleNodes = [];
    client.nodeDestroyQueue = [];
}

GameServer.prototype.getNextNodeId = function() {
	// Resets integer
    if (this.lastNodeId > 2147483647) {
        this.lastNodeId = 1;
    }
    return this.lastNodeId++;
}

GameServer.prototype.getRandomPosition = function() {
    var config = this.getWorldConfig();
    return {
        x: Math.floor(Math.random() * (config.borderRight - config.borderLeft)) + config.borderLeft,
        y: Math.floor(Math.random() * (config.borderBottom - config.borderTop)) + config.borderTop
    };
}
GameServer.prototype.getCertainPosition = function(a, b) {
    return {
        x: a,
        y: b
    };
}
GameServer.prototype.getRandomColor = function() {
  var config = this.getWorldConfig ? this.getWorldConfig() : this.config;
  if(config.serverOldColors) {
	  var index = Math.floor(Math.random() * this.colors.length);
    var color = this.colors[index];
    return {
        r: color.r,
        b: color.b,
        g: color.g
  }; } else {
  var colorRGB = [0xFF, 0x07, (Math.random() * 256) >> 0];
    colorRGB.sort(function() {
        return 0.5 - Math.random();
    });
    return {
        r: colorRGB[0],
        g: colorRGB[1],
        b: colorRGB[2]
    };
  }
};

GameServer.prototype.addNode = function(node) {
    this.nodes.push(node);
    
    // Special on-add actions
    node.onAdd(this);
    
    // Adds to the owning player's screen
    if (node.owner){
        node.owner.socket.sendPacket(new Packet.AddNodes(node));
    }
    
    // Add to visible nodes
    for (var i = 0; i < this.clients.length;i++) {
        client = this.clients[i].playerTracker;
        if (!client) {
            continue;
        }

        if (node.visibleCheck(client.viewBox,client.centerPos)) {
            client.visibleNodes.push(node);
        }
    }
}

GameServer.prototype.removeNode = function(node) {
    var removedPlayer = node && node.getType && node.getType() == 0 ? node.owner : null;

    // Remove from main nodes list
    var index = this.nodes.indexOf(node);
    if (index != -1) {
        this.nodes.splice(index, 1);
    }
    
    // Remove from moving cells list
    index = this.movingNodes.indexOf(node);
    if (index != -1) {
    	this.movingNodes.splice(index, 1);
    }
    
	// Special on-remove actions
    node.onRemove(this);

    if (removedPlayer && removedPlayer.cells.length <= 0 && !removedPlayer.matchResultSent && !this.shouldDelayMatchResult(removedPlayer)) {
        removedPlayer.matchResultSent = true;
        this.pauseTop1Stats(removedPlayer, removedPlayer.world, true);
        this.sendMatchResult(removedPlayer);
    }
    
    // Animation when eating
    for (var i = 0; i < this.clients.length;i++) {
        client = this.clients[i].playerTracker;
        if (!client) {
            continue;
        }

        // Remove from client
        client.nodeDestroyQueue.push(node); 
    }
}

GameServer.prototype.shouldDelayMatchResult = function(player) {
    var world = player && (player.world || this.activeWorld);
    var mode = world && world.gameMode;

    if (!mode || mode.name !== "Tournament") return false;
    return mode.gamePhase == 2;
}

GameServer.prototype.mainLoop = function() {
    // Timer
    var local = new Date();
    this.tick += (local - this.time);
    this.time = local;

    if (this.tick >= 50) {
        var worldsToUpdate = [];
        if (this.activeWorld && this.activeWorld.clients.length > 0) {
            worldsToUpdate.push(this.activeWorld);
        }

        for (var worldId in this.worlds) {
            var world = this.worlds[worldId];
            if (!world || world === this.activeWorld || world.clients.length <= 0) {
                continue;
            }
            worldsToUpdate.push(world);
        }

        for (var i = 0; i < worldsToUpdate.length; i++) {
            var world = worldsToUpdate[i];
            this.withWorld(world, function() {
                var config = this.getWorldConfig();

                // Loop main functions
                this.updateMoveEngine();
                this.updateClients();

                // Spawn food
                world.tickSpawn++;
                if (world.tickSpawn >= config.spawnInterval) {
                    this.updateFood(); // Spawn food
                    this.virusCheck(); // Spawn viruses
                    world.tickSpawn = 0;
                }

                // Update cells/leaderboard loop
                world.tickMain++;
                if (world.tickMain >= 40) { // 2 seconds
                    // Update cells
                    this.updateCells();

                    // Update leaderboard with the gamemode's method
                    this.leaderboard = [];
                    this.gameMode.updateLB(this);
                    this.updateMatchLeaderboardStats(world);
                    world.tickMain = 0;
                }
            });
        }
		
        // Debug
        //console.log(this.tick - 50);
		
        // Reset
        this.tick = 0; 
    }
}

GameServer.prototype.sendMessage = function(msg) {
    for (var i = 0; i < this.clients.length; i++) {
        if (typeof this.clients[i] == "undefined") {
            continue;
        }

        this.clients[i].playerTracker.socket.sendPacket(new Packet.Message(msg));
    }
}

GameServer.prototype.getPlayerGuildId = function(player) {
    if (!player) return '';

    return String(
        player.guildId ||
        player.guild_id ||
        player.guildTag ||
        (player.user && (player.user.guild_id || player.user.guildTag)) ||
        (player.authUser && (player.authUser.guild_id || player.authUser.guildTag)) ||
        ''
    ).trim();
}

GameServer.prototype.sendSystemMessage = function(player, msg) {
    if (!player || !player.socket) return;

    player.socket.sendPacket(new Packet.Message(msg));
}

GameServer.prototype.sendGuildChat = function(sender, message) {
    var senderGuildId = this.getPlayerGuildId(sender);

    if (!senderGuildId) {
        return;
    }

    var clients = this.clients || [];
    var senderWorld = sender && sender.socket ? sender.socket.world : null;

    for (var i = 0; i < clients.length; i++) {
        var client = clients[i];
        if (!client || !client.playerTracker) continue;
        if (senderWorld && client.world !== senderWorld) continue;

        var target = client.playerTracker;
        var targetGuildId = this.getPlayerGuildId(target);

        if (String(targetGuildId) !== String(senderGuildId)) {
            continue;
        }

        this.sendGuildChatPacket(client, sender, message);
    }
}

GameServer.prototype.sendGuildChatPacket = function(client, sender, message) {
    var flags = 32; // tanda guild chat

    client.sendPacket(new Packet.Chat(sender, message, flags));
}

GameServer.prototype.getXpMax = function(level) {
    level = Math.max(1, parseInt(level, 10) || 1);
    return 500 + (level - 1) * 250 + Math.floor(Math.pow(level - 1, 1.7) * 120);
}

GameServer.prototype.getTopPositionBonus = function(rank) {
    rank = parseInt(rank, 10) || 0;
    if (rank === 1) return 50;
    if (rank === 2) return 30;
    if (rank === 3) return 20;
    if (rank >= 4 && rank <= 10) return 10;
    return 0;
}

GameServer.prototype.calculateMatchXp = function(player) {
    var now = Date.now();
    var timeAliveSeconds = Math.floor(Math.max(0, now - (player.matchStartTime || now)) / 1000);
    var leaderboardTimeSeconds = Math.floor(Math.max(0, player.matchLeaderboardTimeMs || 0) / 1000);
    var leaderboardBonus = Math.floor(leaderboardTimeSeconds / 10);
    var topPositionBonus = this.getTopPositionBonus(player.matchTopPosition);

    var xpGain =
        (player.matchFoodEaten || 0) +
        (player.matchCellsEaten || 0) * 8 +
        Math.floor((player.matchHighestMass || 0) / 50) +
        Math.floor(timeAliveSeconds / 20) +
        leaderboardBonus +
        topPositionBonus;

    xpGain = Math.min(xpGain, 500);
    xpGain = Math.max(xpGain, 1);
    return xpGain;
}

GameServer.prototype.applyMatchXp = function(player) {
    var xpGain = this.calculateMatchXp(player);
    var userId = player.authUser && player.authUser.id;

    if (!userId) {
        return {
            xpGain: 0,
            xp: 0,
            xpMax: this.getXpMax(1),
            level: 1,
            leveledUp: 0
        };
    }

    var currentUser = userStore.findByUsernameOrEmail(player.authUser.username);
    var level = Math.max(1, parseInt(currentUser && currentUser.level, 10) || 1);
    var xp = Math.max(0, parseInt(currentUser && currentUser.xp, 10) || 0) + xpGain;
    var xpMax = this.getXpMax(level);
    var leveledUp = 0;

    while (xp >= xpMax) {
        xp -= xpMax;
        level++;
        leveledUp++;
        xpMax = this.getXpMax(level);
    }

    var updatedUser = userStore.updateUser(userId, {
        xp: xp,
        xpMax: xpMax,
        level: level
    });

    if (updatedUser) {
        player.authUser.xp = xp;
        player.authUser.xpMax = xpMax;
        player.authUser.level = level;
    }

    return {
        xpGain: xpGain,
        xp: xp,
        xpMax: xpMax,
        level: level,
        leveledUp: leveledUp
    };
}

GameServer.prototype.getStatsServerId = function(world) {
    return String(this.config.serverId || this.config.serverRegion || (world && world.id) || 'default');
}

GameServer.prototype.getTop1StatsMode = function(world) {
    var worldId = world && world.id ? world.id : '';
    return statsStore.normalizeTop1Mode(worldId);
}

GameServer.prototype.isTop1StatsWorld = function(world) {
    return !!this.getTop1StatsMode(world);
}

GameServer.prototype.getPlayerStatsUserId = function(player) {
    return player && player.authUser && player.authUser.id ? player.authUser.id : '';
}

GameServer.prototype.flushTop1Stats = function(player, world, force) {
    if (!player || !player.top1UnsavedMs || player.top1UnsavedMs <= 0) return;
    if (!force && player.top1UnsavedMs < 60000) return;

    var userId = this.getPlayerStatsUserId(player);
    var mode = player.top1CurrentMode || this.getTop1StatsMode(world || player.world);
    if (!userId || !mode) return;

    statsStore.upsertTop1Time({
        userId: userId,
        mode: mode,
        serverId: this.getStatsServerId(world || player.world),
        country_code: player.authUser && (player.authUser.country_code || player.authUser.countryCode),
        addMs: player.top1UnsavedMs
    });

    player.top1UnsavedMs = 0;
}

GameServer.prototype.pauseTop1Stats = function(player, world, forceSave) {
    if (!player || !player.top1Counting) return;

    var now = Date.now();
    var delta = Math.max(0, now - (player.top1StartMs || now));
    player.top1TotalMs = (player.top1TotalMs || 0) + delta;
    player.top1UnsavedMs = (player.top1UnsavedMs || 0) + delta;
    player.top1Counting = false;
    player.top1StartMs = 0;

    this.flushTop1Stats(player, world || player.world, !!forceSave || player.top1UnsavedMs >= 60000);
}

GameServer.prototype.resetTop1Session = function(player) {
    if (!player) return;
    player.top1TotalMs = 0;
    player.top1StartMs = 0;
    player.top1Counting = false;
    player.top1LastPopupMinute = 0;
    player.top1UnsavedMs = 0;
    player.top1CurrentMode = '';
    player.top1CurrentDate = statsStore.getJakartaDate();
}

GameServer.prototype.sendTopTimePopup = function(player, totalMs) {
    if (!player || !player.socket) return;

    var payload = JSON.stringify({
        text: 'Top Time++',
        ms: totalMs
    });
    var buf = new ArrayBuffer(1 + payload.length * 2 + 2);
    var view = new DataView(buf);
    var offset = 0;

    view.setUint8(offset++, 123);
    for (var i = 0; i < payload.length; i++) {
        view.setUint16(offset, payload.charCodeAt(i), true);
        offset += 2;
    }
    view.setUint16(offset, 0, true);

    player.socket.sendPacket({
        build: function() {
            return buf;
        }
    });
}

GameServer.prototype.recordBattleResult = function(player, result) {
    if (!player || player.battleStatsRecorded) return;

    var world = player.world || this.activeWorld;
    var mode = statsStore.normalizeBattleMode(world && world.id);
    var userId = this.getPlayerStatsUserId(player);
    result = String(result || 'lose').toLowerCase();
    if (!mode || !userId) return;
    if (result !== 'win' && result !== 'lose') return;

    player.battleStatsRecorded = true;
    statsStore.addBattleRecord({
        userId: userId,
        mode: mode,
        result: result,
        serverId: this.getStatsServerId(world),
        country_code: player.authUser && (player.authUser.country_code || player.authUser.countryCode)
    });

    if (result !== 'lose') return;

    var leaderboard = world && world.leaderboard ? world.leaderboard : [];
    for (var i = 0; i < leaderboard.length; i++) {
        var winner = leaderboard[i];
        if (!winner || winner === player || winner.battleStatsRecorded || !this.getPlayerStatsUserId(winner) || winner.cells.length <= 0) continue;
        winner.battleStatsRecorded = true;
        statsStore.addBattleRecord({
            userId: this.getPlayerStatsUserId(winner),
            mode: mode,
            result: 'win',
            serverId: this.getStatsServerId(world),
            country_code: winner.authUser && (winner.authUser.country_code || winner.authUser.countryCode)
        });
        break;
    }
}

GameServer.prototype.updateMatchLeaderboardStats = function(world) {
    var now = Date.now();
    var leaderboard = world && world.leaderboard ? world.leaderboard : this.leaderboard;
    var clients = world && world.clients ? world.clients : this.clients;
    var top1Mode = this.getTop1StatsMode(world);
    var topPlayer = leaderboard && leaderboard.length ? leaderboard[0] : null;

    for (var i = 0; i < clients.length; i++) {
        var socket = clients[i];
        var player = socket && socket.playerTracker;
        if (!player || player.cells.length <= 0 || !player.matchStartTime) {
            this.pauseTop1Stats(player, world, true);
            continue;
        }

        var lastCheck = player.matchLastLeaderboardCheck || now;
        var delta = now - lastCheck;
        var rank = 0;

        for (var j = 0; j < leaderboard.length; j++) {
            if (leaderboard[j] === player) {
                rank = j + 1;
                break;
            }
        }

        if (rank === 1) {
            player.matchLeaderboardTimeMs = (player.matchLeaderboardTimeMs || 0) + delta;
        }

        if (top1Mode && this.getPlayerStatsUserId(player) && topPlayer === player && !player.spectate) {
            if (!player.top1Counting || player.top1CurrentMode !== top1Mode) {
                player.top1Counting = true;
                player.top1StartMs = now;
                player.top1CurrentMode = top1Mode;
                player.top1CurrentDate = statsStore.getJakartaDate();
            } else {
                var elapsedTop1 = Math.max(0, now - (player.top1StartMs || now));
                var currentTotal = (player.top1TotalMs || 0) + elapsedTop1;
                var minute = Math.floor(currentTotal / 60000);
                if (minute > 0 && minute > (player.top1LastPopupMinute || 0)) {
                    player.top1TotalMs = currentTotal;
                    player.top1UnsavedMs = (player.top1UnsavedMs || 0) + elapsedTop1;
                    player.top1StartMs = now;
                    player.top1LastPopupMinute = minute;
                    this.flushTop1Stats(player, world, player.top1UnsavedMs >= 60000);
                    this.sendTopTimePopup(player, player.top1TotalMs);
                }
            }
        } else {
            this.pauseTop1Stats(player, world, false);
        }

        if (rank > 0 && (player.matchTopPosition === 0 || rank < player.matchTopPosition)) {
            player.matchTopPosition = rank;
        }

        player.matchLastLeaderboardCheck = now;
    }
}

GameServer.prototype.sendMatchResult = function(player, result) {
    if (!player || !player.socket) return;
    this.recordBattleResult(player, result);
    var xpResult = this.applyMatchXp(player);

    var payload = JSON.stringify({
        foodEaten: player.matchFoodEaten || 0,
        cellsEaten: player.matchCellsEaten || 0,
        xpGain: xpResult.xpGain || 0,
        xp: xpResult.xp || 0,
        xpMax: xpResult.xpMax || this.getXpMax(1),
        level: xpResult.level || 1,
        leveledUp: xpResult.leveledUp || 0
    });

    var buf = new ArrayBuffer(1 + payload.length * 2 + 2);
    var view = new DataView(buf);
    var offset = 0;

    view.setUint8(offset++, 122);

    for (var i = 0; i < payload.length; i++) {
        view.setUint16(offset, payload.charCodeAt(i), true);
        offset += 2;
    }

    view.setUint16(offset, 0, true);

    player.socket.sendPacket({
        build: function() {
            return buf;
        }
    });
}

GameServer.prototype.updateClients = function() {
    for (var i = 0; i < this.clients.length; i++) {
        if (typeof this.clients[i] == "undefined") {
            continue;
        }

        this.clients[i].playerTracker.update();
    }
}

GameServer.prototype.updateFood = function() {
    var config = this.getWorldConfig();
    var toSpawn = Math.min(config.foodSpawnAmount,(config.foodMaxAmount-this.currentFood));
    for (var i = 0; i < toSpawn; i++) {
        this.spawnFood();
    }    
}

GameServer.prototype.spawnFood = function() {
var config = this.getWorldConfig();
var foodMaxMass = config.foodMaxMass || 1;
var f = new Entity.Food(this.getNextNodeId(), null, this.getRandomPosition(), Math.floor(Math.random() * foodMaxMass) + config.foodMass);
  f.setColor(this.getRandomColor());
	
    this.addNode(f);
    this.currentFood++; 
}

GameServer.prototype.spawnPlayer = function(client) {
   var config = this.getWorldConfig();
   client.matchFoodEaten = 0;
   client.matchCellsEaten = 0;
   client.matchResultSent = false;
   client.matchStartTime = Date.now();
   client.matchHighestMass = 0;
   client.matchLeaderboardTimeMs = 0;
   client.matchTopPosition = 0;
   client.matchLastLeaderboardCheck = Date.now();
   client.battleStatsRecorded = false;
   this.resetTop1Session(client);
   if(config.serverGamemode == 2) {
   var pos = this.getCertainPosition(0,0);
   } else {
   var pos = this.getRandomPosition();
   }
	
    var startMass = config.playerStartMass;
    
    // Check if there are ejected mass in the world. Does not work in team mode
    if ((this.nodesEjected.length > 0) && (!this.gameMode.haveTeams)) {
        var index = Math.floor(Math.random() * 100) + 1;
        if (index <= config.ejectSpawnPlayer) {
            // Get ejected cell
            var index = Math.floor(Math.random() * this.nodesEjected.length);
            var e = this.nodesEjected[index];
    		
            // Remove ejected mass
            this.removeNode(e);
    		
            // Inherit
            pos.x = e.position.x;
            pos.y = e.position.y;
            startMass = e.mass;
    		
            var color = e.getColor();
            client.setColor({
                'r': color.r,
                'g': color.g,
                'b': color.b
            });
        }
    }
    
    // Spawn player and add to world
    var cell = new Entity.PlayerCell(this.getNextNodeId(), client, pos, startMass);
    this.addNode(cell);
    
    // Set initial mouse coords
    client.mouse = {x: pos.x, y: pos.y};
}

GameServer.prototype.spawnPlayerForMode = function(client) {
    if (this.gameMode && this.gameMode.onPlayerSpawn !== Gamemode.Mode.prototype.onPlayerSpawn) {
        this.gameMode.onPlayerSpawn(this, client);
        return;
    }

    this.spawnPlayer(client);
}

GameServer.prototype.virusCheck = function() {
    var config = this.getWorldConfig();
    // Checks if there are enough viruses on the map
    if (this.nodesVirus.length < config.virusMinAmount) {
        // Spawns a virus
        var pos = this.getRandomPosition();
        
        // Check for players (Experimental)
        for (var i = 0; i < this.nodesPlayer.length; i++) {
            var check = this.nodesPlayer[i];
            
            if (check.mass < config.virusStartMass) {
                continue;
            }
    		
            var r = check.getSize(); // Radius of checking player cell
    		
            // Collision box
            var topY = check.position.y - r;
            var bottomY = check.position.y + r;
            var leftX = check.position.x - r;
            var rightX = check.position.x + r;
            
            // Check for collisions
            if (pos.y > bottomY) {
                continue;
            } if (pos.y < topY) {
                continue;
            } if (pos.x > rightX) {
                continue;
            } if (pos.x < leftX) {
                continue;
            }
            
            // Collided
            return;
        }
    	
        // Spawn if no cells are colliding
        var v = new Entity.Virus(this.getNextNodeId(), null, pos, config.virusStartMass);
        this.addNode(v);
    }
}

GameServer.prototype.updateMoveEngine = function() {
    var config = this.getWorldConfig();
    // Move player cells
    var len = this.nodesPlayer.length;
    for (var i = 0; i < len; i++) {
        var cell = this.nodesPlayer[i];
    		
        // Do not move cells that have collision turned off
        if ((!cell) || (cell.getCollision())){
            continue;
        }
    		
        var client = cell.owner;
        
        // If cell's owner is offline, remove this cell
        if (!client.getStatus()) {
            this.removeNode(cell);
            continue;
        }

        if (client.isPaused) {
            continue;
        }

        if (!this.gameMode.canPlayerMove || this.gameMode.canPlayerMove(client)) {
            cell.calcMove(client.mouse.x, client.mouse.y, this);
        }

        // Check if cells nearby
        var list = this.getCellsInRange(cell);
        for (var j = 0; j < list.length ; j++) {
            var check = list[j];
            if (cell.owner) {
                if (check.getType && (check.getType() == 1 || check.getType() == 3)) {
                    cell.owner.matchFoodEaten = (cell.owner.matchFoodEaten || 0) + 1;
                } else if (check.getType && check.getType() == 0 && check.owner != cell.owner) {
                    cell.owner.matchCellsEaten = (cell.owner.matchCellsEaten || 0) + 1;
                }
            }
        	//if(!cell.firstSplit){ soon will be used
            // Consume effect
            check.onConsume(cell,this);
            /*cell.hasAte = true;
			setTimeout(function(){cell.hasAte = false},100);*/
            // Remove cell
            check.setKiller(cell);
            this.removeNode(check); 
		//}
        }
    }
	// A system to move cells not controlled by players (ex. viruses, ejected mass)
    len = this.movingNodes.length;
    for (var i = 0; i < len; i++) {
        var check = this.movingNodes[i];
    	
        // Recycle unused nodes
        while ((typeof check == "undefined") && (i < this.movingNodes.length)) {
            // Remove moving cells that are undefined
            this.movingNodes.splice(i, 1);
            check = this.movingNodes[i];
        } if (i >= this.movingNodes.length) {
            continue;
        }
        
        if (check.getMoveTicks() > 0) {
            // If the cell has enough move ticks, then move it
            check.calcMovePhys(config);
            if ((check.getType() == 3) && (this.nodesVirus.length < config.virusMaxAmount)) {
                // Check for viruses
                var v = this.getNearestVirus(check);
                if (v) { // Feeds the virus if it exists
                    v.feed(check,this);
                }
            }
        } else {
            // Auto move is done
        	check.moveDone(this);
            // Remove cell from list
            var index = this.movingNodes.indexOf(check);
            if (index != -1) {
                this.movingNodes.splice(index, 1);
            }
        }
    }
}

GameServer.prototype.setAsMovingNode = function(node) {
	this.movingNodes.push(node);
}

GameServer.prototype.splitCells = function(client) {
    var config = this.getWorldConfig();
    var len = client.cells.length;
    for (var i = 0; i < len; i++) {
    	
        if (client.cells.length >= config.playerMaxCells) {
            continue;
        }
        
        var cell = client.cells[i];
        if (!cell) continue;
        if (cell.mass < config.playerMinMassSplit) continue;

        var deltaY = client.mouse.y - cell.position.y;
        var deltaX = client.mouse.x - cell.position.x;
        var angle = Math.atan2(deltaX, deltaY);
    	
        var size = cell.getSize();
        var spawnOffset = Math.max(24, Math.min(40, size * 0.16));

        var startPos = {
            x: cell.position.x + (spawnOffset * Math.sin(angle)),
            y: cell.position.y + (spawnOffset * Math.cos(angle))
        };

        var newMass = cell.mass / 2;
        cell.mass = newMass;

        var split = new Entity.PlayerCell(this.getNextNodeId(), client, startPos, newMass);
        split.setAngle(angle);
        split.setMoveEngineData(26 + (cell.getSpeed() * 2), 22);
        split.calcMergeTime(config.playerRecombineTime);

        this.setAsMovingNode(split);
        this.addNode(split);
    }
}
GameServer.prototype.gainMass = function(client, size) {
    var len = client.cells.length;
    for (var i = 0; i < len; i++) {
        var cell = client.cells[i];
       cell.mass += 100;
	  //  cell.recombineTicks = 0;
    }
}
GameServer.prototype.mergeCells = function(client, size) {
    var len = client.cells.length;
    for (var i = 0; i < len; i++) {
        var cell = client.cells[i];
     //  cell.mass += 100;
	    cell.recombineTicks = 0;
    }
}
GameServer.prototype.ejectMass = function(client) {
    var config = this.getWorldConfig();
    for (var i = 0; i < client.cells.length; i++) {
        var cell = client.cells[i];
        
        if (!cell) {
            continue;
        }
       
        if (cell.mass < config.playerMinMassEject) {
            continue;
        }
		
        var deltaY = client.mouse.y - cell.position.y;
        var deltaX = client.mouse.x - cell.position.x;
        var angle = Math.atan2(deltaX,deltaY);
   	
        // Get starting position
        var size = cell.getSize() + 5;
        var startPos = {
            x: cell.position.x + ( (size + config.ejectMass) * Math.sin(angle) ), 
            y: cell.position.y + ( (size + config.ejectMass) * Math.cos(angle) )
        };
        
        // Remove mass from parent cell
        cell.mass -= config.ejectMass;
        
        // Randomize angle
        angle += (Math.random() * .5) - .25;
        
        // Create cell
       if(!config.ejectVirus) {
	    ejected = new Entity.EjectedMass(this.getNextNodeId(), null, startPos, config.ejectMassGain);
       } else {
      ejected = new Entity.Virus(this.getNextNodeId(), null, startPos, config.ejectMassGain);
       }
        ejected.setAngle(angle);
        ejected.setMoveEngineData(config.ejectSpeed, 10);
        ejected.setColor(cell.getColor());
       
        // Add to moving cells list
        this.addNode(ejected);
        this.setAsMovingNode(ejected);
    }
}

GameServer.prototype.newCellVirused = function(client, parent, angle, mass, speed) {
    var config = this.getWorldConfig();
    // Starting position
    var startPos = {
        x: parent.position.x, 
        y: parent.position.y
    };
	
	// Create cell
	newCell = new Entity.PlayerCell(this.getNextNodeId(), client, startPos, mass);
	newCell.setAngle(angle);
	newCell.setMoveEngineData(speed, 10);
	newCell.calcMergeTime(config.playerRecombineTime);
	newCell.setCollisionOff(true); // Turn off collision
	
    // Add to moving cells list
    this.addNode(newCell);
    this.setAsMovingNode(newCell);
}

GameServer.prototype.shootVirus = function(parent) {
    var config = this.getWorldConfig();
	var parentPos = {
        x: parent.position.x,
        y: parent.position.y,
	};
	
    var newVirus = new Entity.Virus(this.getNextNodeId(), null, parentPos, config.virusStartMass);
    newVirus.setAngle(parent.getAngle());
    newVirus.setMoveEngineData(150, 15);
	
    // Add to moving cells list
    this.addNode(newVirus);
    this.setAsMovingNode(newVirus);
}

GameServer.prototype.getCellsInRange = function(cell) {
    var list = new Array();
    var r = cell.getSize(); // Get cell radius (Cell size = radius)
	
    var topY = cell.position.y - r;
    var bottomY = cell.position.y + r;
	
    var leftX = cell.position.x - r;
    var rightX = cell.position.x + r;

    // Loop through all cells that are visible to the cell. There is probably a more efficient way of doing this but whatever
	var len = cell.owner.visibleNodes.length;
    for (var i = 0;i < len;i++) {
        var check = cell.owner.visibleNodes[i];
		
        if (typeof check === 'undefined') {
            continue;
        }
		
        // Can't eat itself
        if (cell.nodeId == check.nodeId) {
            continue;
        }
        
        // Can't eat cells that have collision turned off
        if ((cell.owner == check.owner) && (cell.getCollision())) {
            continue;
        }
        
        // AABB Collision
        if (!check.collisionCheck(bottomY,topY,rightX,leftX)) {
            continue;
        }

        // Cell type check - Cell must be bigger than this number times the mass of the cell being eaten
        var multiplier = 1.25;
		
        switch (check.getType()) {
            case 1: // Food cell
                list.push(check);
                continue;
            case 2: // Virus
                multiplier = 1.33;
                break;
            case 0: // Players
                if (check.owner == cell.owner) {
                    if (cell.recombineTicks > 0 || check.recombineTicks > 0) {
                        continue;
                    }
                    multiplier = 1.00;
                }
                // Can't eat team members
                if (this.gameMode.haveTeams) {
                    if (!check.owner) { // Error check
                        continue;
                    }
                	
                    if ((check.owner != cell.owner) && (check.owner.getTeam() == cell.owner.getTeam())) {
                        continue;
                    }
                }
		/*if(cell.firstSplit || cell.hasAte){
			continue;
		}*/
                break;
            default: 
                break;
        }
        
        // Make sure the cell is big enough to be eaten.
        if ((check.mass * multiplier) > cell.mass) {
            continue;
        }
            	
        // Eating range
        var xs = Math.pow(check.position.x - cell.position.x, 2);
        var ys = Math.pow(check.position.y - cell.position.y, 2);
        var dist = Math.sqrt( xs + ys );
                
        var eatingRange = cell.getSize() - check.getEatingRange(); // Eating range = radius of eating cell + 1/3 of the radius of the cell being eaten
        if (dist > eatingRange) {
            // Not in eating range
            continue;
        }
		
        // Add to list of cells nearby
        list.push(check);
    }
    return list;
}

GameServer.prototype.getNearestVirus = function(cell) { 
	var virus = null;

    // Only feed viruses when the ejected mass directly touches the virus.
	var len = this.nodesVirus.length;
    for (var i = 0;i < len;i++) {
        var check = this.nodesVirus[i];
		
        if (typeof check === 'undefined') {
            continue;
        }

        var dx = check.position.x - cell.position.x;
        var dy = check.position.y - cell.position.y;
        var feedRange = check.getSize() + cell.getSize();

        if ((dx * dx + dy * dy) > (feedRange * feedRange)) {
            continue;
        }
        		
        virus = check;
        break;
    }
    return virus;
}

GameServer.prototype.updateCells = function() {
    var config = this.getWorldConfig();
    var massDecay = 1 - ((config.playerMassDecayRate/1000) * this.gameMode.decayMod);
    for (var i = 0; i < this.nodesPlayer.length; i++) {
        var cell = this.nodesPlayer[i];
        
        if (!cell) {
        	continue;
        }
        
        // Recombining
        if (cell.getRecombineTicks() > 0) {
            cell.setRecombineTicks(cell.getRecombineTicks() - 1);
        }
		
        // Mass decay
        if (cell.mass >= config.playerMinMassDecay) {
            cell.mass *= massDecay;
        }
    }
}

GameServer.prototype.loadConfig = function() {
    try {
        this.config = ini.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (err) {
        // No config
        console.log("[Game] Config not found... Generating new config");
    	
        // Create a new config
        fs.writeFileSync(configPath, ini.stringify(this.config));
    }

    try {
        if (fs.existsSync(adminConfigPath)) {
            var adminConfig = JSON.parse(fs.readFileSync(adminConfigPath, 'utf8'));
            for (var key in adminConfig) {
                if (Object.prototype.hasOwnProperty.call(adminConfig, key)) {
                    this.config[key] = adminConfig[key];
                }
            }
            console.log("[Game] Loaded admin config overrides");
        }
    } catch (err) {
        console.log("[Game] Failed to load admin config overrides: " + err.message);
    }
}

// Custom prototype functions
WebSocket.prototype.sendPacket = function(packet) {
    function getbuf(data) {
        if (!data) return null;
        var array = new Uint8Array(data.buffer || data);
        var l = data.byteLength || data.length;
        var o = data.byteOffset || 0;
        var buffer = Buffer.alloc(l);

        for (var i = 0; i < l; i++) {
            buffer[i] = array[o + i];
        }

        return buffer;
    }

    if (this.readyState == WebSocket.OPEN && packet.build) {
        var buf = packet.build();
        buf = getbuf(buf);
        if (buf) {
            this.send(buf, { binary: true });
        }
    }
}
