var FFA = require('./FFA');

function Battle2vs2() {
    FFA.apply(this, Array.prototype.slice.call(arguments));

    this.ID = 11;
    this.name = "Battle 2vs2";
    this.packetLB = 49;
    this.maxPlayers = 4;
}

module.exports = Battle2vs2;
Battle2vs2.prototype = new FFA();

Battle2vs2.prototype.onServerInit = function(gameServer) {
    var config = gameServer.getWorldConfig ? gameServer.getWorldConfig() : gameServer.config;
    this.maxPlayers = parseInt(config.battle2v2MaxPlayers, 10) || 4;
};

Battle2vs2.prototype.onPlayerSpawn = function(gameServer, player) {
    var alive = 0;
    for (var i = 0; i < gameServer.clients.length; i++) {
        var other = gameServer.clients[i] && gameServer.clients[i].playerTracker;
        if (other && other.cells.length > 0) alive++;
    }

    if (alive >= this.maxPlayers) return;
    if (alive === 0) {
        var world = player.world || gameServer.activeWorld;
        if (world) world.rankedResultSaved = false;
    }

    player.battleTeam = alive < 2 ? 'A' : 'B';
    player.color = gameServer.getRandomColor();
    gameServer.spawnPlayer(player);
};

Battle2vs2.prototype.updateLB = function(gameServer) {
    FFA.prototype.updateLB.call(this, gameServer);
};
