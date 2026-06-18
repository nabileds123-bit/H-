var FFA = require('./FFA');

function Battle1vs1() {
    FFA.apply(this, Array.prototype.slice.call(arguments));

    this.ID = 10;
    this.name = "Battle 1vs1";
    this.packetLB = 49;
    this.maxPlayers = 2;
}

module.exports = Battle1vs1;
Battle1vs1.prototype = new FFA();

Battle1vs1.prototype.onServerInit = function(gameServer) {
    var config = gameServer.getWorldConfig ? gameServer.getWorldConfig() : gameServer.config;
    this.maxPlayers = parseInt(config.battle1v1MaxPlayers, 10) || 2;
};

Battle1vs1.prototype.onPlayerSpawn = function(gameServer, player) {
    var alive = 0;
    for (var i = 0; i < gameServer.clients.length; i++) {
        var other = gameServer.clients[i] && gameServer.clients[i].playerTracker;
        if (other && other.cells.length > 0) alive++;
    }

    if (alive >= this.maxPlayers) return;

    player.color = gameServer.getRandomColor();
    gameServer.spawnPlayer(player);
};

Battle1vs1.prototype.updateLB = function(gameServer) {
    FFA.prototype.updateLB.call(this, gameServer);
};
