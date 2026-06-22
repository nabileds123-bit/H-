var Packet = require('./packet');
var GameServer = require('./GameServer');

function PlayerTracker(gameServer, socket) {
    this.isOnline = true;
    this.name = "";
    this.guildTag = "";
    this.skinKey = "";
    this.battleTier = "UNRANKED";
    this.battleTeam = '';
    this.gameServer = gameServer;
    this.socket = socket;
    this.nodeDestroyQueue = [];
    this.visibleNodes = [];
    this.cells = [];
    this.score = 0; // Needed for leaderboard

    this.mouse = {x: 0, y: 0};
    this.tickLeaderboard = 0; // 
    this.tickViewBox = 0;
    this.isPaused = false;
    this.matchFoodEaten = 0;
    this.matchCellsEaten = 0;
    this.matchResultSent = false;
    this.matchResultKey = '';
    this.matchStartTime = 0;
    this.matchHighestMass = 0;
    this.matchLeaderboardTimeMs = 0;
    this.matchTopPosition = 0;
    this.matchLastLeaderboardCheck = 0;
    this.battleStatsRecorded = false;
    this.battleStatsKey = '';
    this.top1TotalMs = 0;
    this.top1StartMs = 0;
    this.top1Counting = false;
    this.top1LastPopupMinute = 0;
    this.top1UnsavedMs = 0;
    this.top1CurrentMode = '';
    this.top1CurrentDate = '';
    
    this.team = 0;
    this.spectate = false;
    this.spectatedPlayer; // Current player that this player is watching
    
    // Viewing box
    this.sightRange = 0;
    this.centerPos = {x: 0, y: 0 }
    this.viewBox = {
        topY: 0,
        bottomY: 0,
        leftX: 0,
        rightX: 0,
        width: 0 // Half-width
    }
    
    // Gamemode function
    if (gameServer) {
        this.color = gameServer.getRandomColor(); // Get color
        gameServer.gameMode.onPlayerInit(this);
    }
}

module.exports = PlayerTracker;

// Setters/Getters

PlayerTracker.prototype.setStatus = function(bool) {
    this.isOnline = bool;
}

PlayerTracker.prototype.getStatus = function() {
    return this.isOnline;
}

PlayerTracker.prototype.setName = function(name) {
    this.name = name;
}

PlayerTracker.prototype.getName = function() {
    return this.name;
}

PlayerTracker.prototype.setGuildTag = function(tag) {
    this.guildTag = String(tag || '').trim();
}

PlayerTracker.prototype.getDisplayName = function() {
    if (this.authUser && (this.authUser.hideNickname === true || String(this.authUser.hideNickname || '').toLowerCase() === 'true')) {
        return "";
    }

    if (!this.guildTag) {
        return this.name;
    }

    return "[" + this.guildTag + "] " + this.name;
}

PlayerTracker.prototype.getSkinName = function() {
    return this.skinKey || "";
}

PlayerTracker.prototype.getBattleTier = function() {
    return this.battleTier || "";
}

PlayerTracker.prototype.getScore = function(reCalcScore) {
    if (reCalcScore) {
        var s = 0;
        for (var i = 0; i < this.cells.length; i++) {
            s += this.cells[i].mass;
            this.score = s;
        }
    }
    return this.score;
}

PlayerTracker.prototype.setColor = function(color) {
    this.color.r = color.r;
    this.color.b = color.b;
    this.color.g = color.g;
}

PlayerTracker.prototype.getTeam = function() {
    return this.team;
}

// Functions

PlayerTracker.prototype.update = function() {
    if (this.isPaused) {
        this.socket.packetHandler.pressSpace = false;
        this.socket.packetHandler.pressW = false;
        this.socket.packetHandler.merg = false;
        this.socket.packetHandler.massSize = false;
    }

	// Actions buffer
    if (!this.isPaused && this.socket.packetHandler.pressSpace) {
        // Split cell
        this.gameServer.splitCells(this);
        this.socket.packetHandler.pressSpace = false;
    }
	  if (!this.isPaused && this.socket.packetHandler.massSize ) {
        // Split cell
        this.gameServer.gainMass(this);
        this.socket.packetHandler.massSize = false;
    }
	 if (!this.isPaused && this.socket.packetHandler.merg ) {
        // Split cell
        this.gameServer.mergeCells(this);
        this.socket.packetHandler.merg = false;
    }
    if (!this.isPaused && this.socket.packetHandler.pressW) {
        // Eject mass
        this.gameServer.ejectMass(this);
        this.socket.packetHandler.pressW = false;
    }

    if (this.cells.length > 0) {
        var currentMass = ~~(this.getScore(true) / 100);
        if (currentMass > this.matchHighestMass) {
            this.matchHighestMass = currentMass;
        }
    }
    
	// Remove nodes from visible nodes if possible
    for (var i = 0; i < this.nodeDestroyQueue.length; i++) {
        var index = this.visibleNodes.indexOf(this.nodeDestroyQueue[i]);
        if (index > -1) {
            this.visibleNodes.splice(index, 1);
        }
    }

    // Get visible nodes every 200 ms
    var nonVisibleNodes = []; // Nodes that are not visible
    if (this.tickViewBox <= 0) {
        var newVisible = this.calcViewBox();
        
        // Compare and destroy nodes that are not seen
        for (var i = 0; i < this.visibleNodes.length; i++) {
            var index = newVisible.indexOf(this.visibleNodes[i]);
            if (index == -1) {
                // Not seen by the client anymore
                nonVisibleNodes.push(this.visibleNodes[i]);
            }
        }
        
        this.visibleNodes = newVisible;
        // Reset Ticks
        this.tickViewBox = 4;
    } else {
        this.tickViewBox--;
    }
    
    // Send packet
    this.socket.sendPacket(new Packet.UpdateNodes(this.nodeDestroyQueue.slice(0), this.visibleNodes, nonVisibleNodes));

    this.nodeDestroyQueue = []; // Reset destroy queue

    // Update leaderboard
    var world = this.world || this.gameServer.activeWorld;
    var config = this.gameServer.getWorldConfig ? this.gameServer.getWorldConfig(world) : this.gameServer.config;
    var leaderboardUpdateRate = config.leaderboardUpdateClient;
    if (world && this.gameServer.isBattleModeRequest && this.gameServer.isBattleModeRequest(world.id)) {
        leaderboardUpdateRate = 10; // 0.5 seconds, keeps battle countdown readable
    }
    if (this.tickLeaderboard > leaderboardUpdateRate) {
        this.tickLeaderboard = leaderboardUpdateRate;
    }

    if (this.tickLeaderboard <= 0) {
        var leaderboard = world ? world.leaderboard : this.gameServer.leaderboard;
        var gameMode = world ? world.gameMode : this.gameServer.gameMode;
        this.socket.sendPacket(new Packet.UpdateLeaderboard(leaderboard,gameMode.packetLB));
        this.tickLeaderboard = leaderboardUpdateRate;
    } else {
        this.tickLeaderboard--;
    }
    
}

// Viewing box

PlayerTracker.prototype.updateSightRange = function() { // For view distance
    var config = this.gameServer.getWorldConfig ? this.gameServer.getWorldConfig(this.world) : this.gameServer.config;
    var totalSize = 1.0;
    var len = this.cells.length;
    
    for (var i = 0; i < len;i++) {
    	
        if (!this.cells[i]) {
            continue;
        }
    	
        totalSize += this.cells[i].getSize();
    }
    this.sightRange = config.serverViewBase / Math.pow(Math.min(64.0 / totalSize, 1), 0.4);
}

PlayerTracker.prototype.updateCenter = function() { // Get center of cells
	var len = this.cells.length;
	
    if (len <= 0) {
        return; // End the function if no cells exsist
    }
    
    var X = 0;
    var Y = 0;
    for (var i = 0; i < len ;i++) {
    	
        if (!this.cells[i]) {
            continue;
        }
    	
        X += this.cells[i].position.x;
        Y += this.cells[i].position.y;
    }
    
    this.centerPos.x = X / len >> 0;
    this.centerPos.y = Y / len >> 0;
}

PlayerTracker.prototype.calcViewBox = function() {
    var world = this.world || this.gameServer.activeWorld;
    var nodes = world ? world.nodes : this.gameServer.nodes;
    var gameMode = world ? world.gameMode : this.gameServer.gameMode;

    if (this.spectate) {
        // Spectate mode
        this.spectatedPlayer = gameMode.rankOne;
        if (this.spectatedPlayer) {
            // Get spectated player's location and calculate zoom amount
            var specZoom = Math.sqrt(100 * this.spectatedPlayer.score);
            specZoom = Math.pow(Math.min(40.5 / specZoom, 1.0), 0.4) * 0.75;
            this.socket.sendPacket(new Packet.UpdatePosition(this.spectatedPlayer.centerPos.x,this.spectatedPlayer.centerPos.y,specZoom));
            return this.spectatedPlayer.visibleNodes;
        } else {
            var config = this.gameServer.getWorldConfig ? this.gameServer.getWorldConfig(world) : this.gameServer.config;
            this.centerPos.x = (config.borderLeft + config.borderRight) / 2;
            this.centerPos.y = (config.borderTop + config.borderBottom) / 2;
            this.sightRange = Math.max(config.borderRight - config.borderLeft, config.borderBottom - config.borderTop);
            this.viewBox.topY = config.borderTop;
            this.viewBox.bottomY = config.borderBottom;
            this.viewBox.leftX = config.borderLeft;
            this.viewBox.rightX = config.borderRight;
            this.viewBox.width = this.sightRange;
            this.socket.sendPacket(new Packet.UpdatePosition(this.centerPos.x, this.centerPos.y, 0.4));
            return nodes.slice(0);
        }
    }
		
    // Main function
    this.updateSightRange();
    this.updateCenter();
	
    // Box
    this.viewBox.topY = this.centerPos.y - this.sightRange;
    this.viewBox.bottomY = this.centerPos.y + this.sightRange;
    this.viewBox.leftX = this.centerPos.x - this.sightRange;
    this.viewBox.rightX = this.centerPos.x + this.sightRange;
    this.viewBox.width = this.sightRange;
	
    var newVisible = [];
    for (var i = 0; i < nodes.length ;i++) {
        node = nodes[i];
		
        if (!node) {
            continue;
        }
		
        if (node.visibleCheck(this.viewBox,this.centerPos)) {
            // Cell is in range of viewBox
            newVisible.push(node);
        }
    }
    return newVisible;
}
