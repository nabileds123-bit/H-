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
var userStore = require('./auth/userStore');
var configPath = path.join(__dirname, '..', 'gameserver.ini');

// GameServer implementation
function GameServer(mult, prt) {
    // Start msg
    console.log("[Game] Ogar - An open source Agar.io server implementation");
    this.multi = mult;
	this.port = prt;
    this.lastNodeId = 1;
    this.allClients = [];
    this.worlds = {};
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
        maintenanceImage: '/img/bg.png'
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

      if (AdminServer.handle(req, res, self)) {
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

          userStore.listUsers().forEach(function(user) {
            var playerName = String(user.username || user.skin || '').trim();
            var guildTag = String(user.guildTag || '').trim();
            var activeSkinType = String(user.activeSkinType || 'player').toLowerCase();

            if (activeSkinType === 'guild' && guildTag && user.guildSkinUrl) {
              names.push(guildTag);
              skinFiles[guildTag.toLowerCase()] = user.guildSkinUrl;
              return;
            }

            if (playerName && user.skinUrl) {
              names.push(playerName);
              skinFiles[playerName.toLowerCase()] = user.skinUrl;
            } else if (guildTag && user.guildSkinUrl) {
              names.push(guildTag);
              skinFiles[guildTag.toLowerCase()] = user.guildSkinUrl;
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
    setInterval(this.mainLoop.bind(this), 1);
    
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
        this.setClientWorld(ws, ':x5');
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
    this.worlds[':x5'] = this.createWorld(':x5', new Gamemode.X5(), this.getModeConfig('x5'));
    this.worlds[':hardcore:1'] = this.createWorld(':hardcore:1', new Gamemode.FFA(), this.getModeConfig('hardcore'));
    this.worlds[':hardcore:2'] = this.createWorld(':hardcore:2', new Gamemode.FFA(), this.getModeConfig('hardcore'));
    this.worlds[':teams'] = this.createWorld(':teams', new Gamemode.Teams(), this.getModeConfig('teams'));
    this.worlds[':experimental'] = this.createWorld(':experimental', new Gamemode.Experimental(), this.getModeConfig('experimental'));
    this.worlds[':battle:1v1'] = this.createWorld(':battle:1v1', new Gamemode.FFA(), this.getModeConfig('battle1v1'));
    this.worlds[':battle:2v2'] = this.createWorld(':battle:2v2', new Gamemode.FFA(), this.getModeConfig('battle2v2'));
    this.setActiveWorld(this.worlds[':x5']);
}

GameServer.prototype.setActiveWorld = function(world) {
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
    this.saveActiveWorld();
    this.ensureWorldInitialized(world || this.worlds[':x5']);
    this.setActiveWorld(world || this.worlds[':x5']);

    var result = callback.call(this);

    this.saveActiveWorld();
    if (previous) {
        this.setActiveWorld(previous);
    }
    return result;
}

GameServer.prototype.resolveWorldId = function(mode) {
    if (mode == ':hardcore') {
        return Math.random() < 0.5 ? ':hardcore:1' : ':hardcore:2';
    }

    if (this.worlds[mode]) {
        return mode;
    }

    return ':x5';
}

GameServer.prototype.setClientWorld = function(socket, mode) {
    var world = this.worlds[this.resolveWorldId(mode)];
    if (!world) {
        world = this.worlds[':x5'];
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

GameServer.prototype.mainLoop = function() {
    // Timer
    var local = new Date();
    this.tick += (local - this.time);
    this.time = local;

    if (this.tick >= 50) {
        for (var worldId in this.worlds) {
            var world = this.worlds[worldId];
            this.withWorld(this.worlds[worldId], function() {
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
        
        cell.calcMove(client.mouse.x, client.mouse.y, this);

        // Check if cells nearby
        var list = this.getCellsInRange(cell);
        for (var j = 0; j < list.length ; j++) {
            var check = list[j];
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
}

// Custom prototype functions
WebSocket.prototype.sendPacket = function(packet) {
    function getbuf(data) {
        var array = new Uint8Array(data.buffer || data);
        var l = data.byteLength || data.length;
        var o = data.byteOffset || 0;
        var buffer = new Buffer(l);

        for (var i = 0; i < l; i++) {
            buffer[i] = array[o + i];
        }

        return buffer;
    }

    if (this.readyState == WebSocket.OPEN && packet.build) {
        var buf = packet.build();
        this.send(getbuf(buf), { binary: true });
    }
}
