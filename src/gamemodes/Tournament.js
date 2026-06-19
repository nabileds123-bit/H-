'use strict';
var Mode = require('./Mode');

function Tournament() {
    Mode.apply(this, Array.prototype.slice.call(arguments));

    this.ID = 10;
    this.name = "Tournament";
    this.packetLB = 48;

    // Config (1 tick = 1000 ms)
    this.prepTime = 5; // Amount of ticks after the server fills up to wait until starting the game
    this.endTime = 15; // Amount of ticks after someone wins to restart the game
    this.autoFill = false;
    this.autoFillPlayers = 1;
    this.dcTime = 0;

    // Gamemode Specific Variables
    this.gamePhase = 0; // 0 = Waiting for players, 1 = Prepare to start, 2 = Game in progress, 3 = End
    this.contenders = [];
    this.eliminated = [];
    this.maxContenders = 12;

    this.winner;
    this.timer;
    this.timeLimit = 3600; // in seconds
}

module.exports = Tournament;
Tournament.prototype = new Mode();

// Gamemode Specific Functions

Tournament.prototype.startGamePrep = function(gameServer) {
    this.gamePhase = 1;
    this.timer = this.prepTime;
};

Tournament.prototype.startGame = function(gameServer) {
    gameServer.run = true;
    this.gamePhase = 2;
    this.getSpectate();
    gameServer.config.playerDisconnectTime = this.dcTime;
};

Tournament.prototype.endGame = function(gameServer) {
    this.winner = this.contenders[0];
    this.updateEliminatedSpectators(this.winner);
    this.gamePhase = 3;
    this.timer = this.endTime;
    this.finishDelayedMatchResults(gameServer);
};

Tournament.prototype.endGameTimeout = function(gameServer) {
    gameServer.run = false;
    this.gamePhase = 4;
    this.timer = this.endTime;
    this.finishDelayedMatchResults(gameServer);
};

Tournament.prototype.fillBots = function(gameServer) {
    if (!gameServer.bots) return;

    var fill = this.maxContenders - this.contenders.length;
    for (var i = 0; i < fill; i++) {
        gameServer.bots.addBot();
    }
};

Tournament.prototype.getSpectate = function() {
    var index = Math.floor(Math.random() * this.contenders.length);
    this.rankOne = this.contenders[index];
};

Tournament.prototype.prepare = function(gameServer) {
    var config = gameServer.getWorldConfig ? gameServer.getWorldConfig() : gameServer.config;
    var len = gameServer.nodes.length;
    for (var i = 0; i < len; i++) {
        var node = gameServer.nodes[0];
        if (!node) continue;
        gameServer.removeNode(node);
    }

    if (gameServer.bots) {
        gameServer.bots.loadNames();
    }

    gameServer.run = false;
    this.gamePhase = 0;
    this.contenders = [];
    this.eliminated = [];
    this.winner = null;

    if (config.tourneyAutoFill > 0) {
        this.timer = config.tourneyAutoFill;
        this.autoFill = true;
        this.autoFillPlayers = config.tourneyAutoFillPlayers;
    }

    this.dcTime = config.playerDisconnectTime;
    gameServer.config.playerDisconnectTime = 0;
    gameServer.config.playerMinMassDecay = config.playerStartMass;

    this.prepTime = config.tourneyPrepTime;
    this.endTime = config.tourneyEndTime;
    this.maxContenders = config.tourneyMaxPlayers;

    this.timeLimit = config.tourneyTimeLimit * 60;
};

Tournament.prototype.onPlayerDeath = function(gameServer) { };

Tournament.prototype.queueEliminatedPlayer = function(player) {
    if (!player || this.gamePhase != 2) return;
    if (this.eliminated.indexOf(player) == -1) {
        this.eliminated.push(player);
    }
    player.spectate = true;
    player.spectatedPlayer = this.rankOne || null;
};

Tournament.prototype.updateEliminatedSpectators = function(target) {
    for (var i = 0; i < this.eliminated.length; i++) {
        if (this.eliminated[i]) {
            this.eliminated[i].spectate = true;
            this.eliminated[i].spectatedPlayer = target || null;
        }
    }
};

Tournament.prototype.sendPlayerMatchResult = function(gameServer, player, result) {
    if (!player || player.matchResultSent) return;

    player.matchResultSent = true;
    if (gameServer.pauseTop1Stats) {
        gameServer.pauseTop1Stats(player, player.world, true);
    }
    gameServer.sendMatchResult(player, result);
};

Tournament.prototype.finishDelayedMatchResults = function(gameServer) {
    for (var i = 0; i < this.eliminated.length; i++) {
        this.sendPlayerMatchResult(gameServer, this.eliminated[i], 'lose');
    }
    this.eliminated = [];

    if (this.winner) {
        this.sendPlayerMatchResult(gameServer, this.winner, 'win');
    }
};

Tournament.prototype.canPlayerMove = function(player) {
    return this.gamePhase == 2;
};

Tournament.prototype.formatTime = function(time) {
    if (time < 0) return "0:00";

    var min = Math.floor(time / 60);
    var sec = time % 60;
    sec = (sec > 9) ? sec : "0" + sec.toString();
    return min + ":" + sec;
};

// Override

Tournament.prototype.onServerInit = function(gameServer) {
    this.prepare(gameServer);
};

Tournament.prototype.restartCurrentPlayers = function(gameServer) {
    for (var i = 0; i < gameServer.clients.length; i++) {
        var socket = gameServer.clients[i];
        var player = socket && socket.playerTracker;
        if (!player || !player.getStatus || !player.getStatus()) continue;
        if (this.contenders.length >= this.maxContenders) break;

        player.spectate = false;
        player.spectatedPlayer = null;
        this.onPlayerSpawn(gameServer, player);
    }
};

Tournament.prototype.onPlayerSpawn = function(gameServer, player) {
    if ((this.gamePhase == 0) && (this.contenders.length < this.maxContenders)) {
        player.color = gameServer.getRandomColor();
        this.contenders.push(player);
        gameServer.spawnPlayer(player);

        if (this.contenders.length == this.maxContenders) {
            this.startGamePrep(gameServer);
        }
    }
};

Tournament.prototype.onCellRemove = function(cell) {
    var owner = cell.owner,
        human_just_died = false;

    if (owner.cells.length <= 0) {
        this.queueEliminatedPlayer(owner);
        this.sendPlayerMatchResult(cell.owner.gameServer, owner, 'lose');

        var index = this.contenders.indexOf(owner);
        if (index != -1) {
            if ('_socket' in this.contenders[index].socket) human_just_died = true;
            this.contenders.splice(index, 1);
        }
        owner.spectatedPlayer = this.contenders[0] || this.rankOne || null;

        var humans = 0;
        for (var i = 0; i < this.contenders.length; i++) {
            if ('_socket' in this.contenders[i].socket) humans++;
        }

        if ((this.contenders.length == 1 || humans == 0 || (humans == 1 && human_just_died)) && this.gamePhase == 2) {
            this.endGame(cell.owner.gameServer);
        } else {
            this.onPlayerDeath(cell.owner.gameServer);
        }
    }
};

Tournament.prototype.updateLB = function(gameServer) {
    var lb = gameServer.leaderboard;

    switch (this.gamePhase) {
        case 0:
            lb[0] = "Waiting for";
            lb[1] = "players: ";
            lb[2] = this.contenders.length + "/" + this.maxContenders;
            if (this.autoFill) {
                if (this.timer <= 0) {
                    this.fillBots(gameServer);
                } else if (this.contenders.length >= this.autoFillPlayers) {
                    this.timer--;
                }
            }
            break;
        case 1:
            lb[0] = "Game starting in";
            lb[1] = this.timer.toString();
            lb[2] = "Good luck!";
            if (this.timer <= 0) {
                this.startGame(gameServer);
            } else {
                this.timer--;
            }
            break;
        case 2:
            lb[0] = "Players Remaining";
            lb[1] = this.contenders.length + "/" + this.maxContenders;
            lb[2] = "Time Limit:";
            lb[3] = this.formatTime(this.timeLimit);
            if (this.timeLimit < 0) {
                this.endGameTimeout(gameServer);
            } else {
                this.timeLimit--;
            }
            break;
        case 3:
            lb[0] = "Congratulations";
            lb[1] = this.winner.getName();
            lb[2] = "for winning!";
            if (this.timer <= 0) {
                this.onServerInit(gameServer);
                gameServer.startingFood();
                this.restartCurrentPlayers(gameServer);
            } else {
                lb[3] = "Game restarting in";
                lb[4] = this.timer.toString();
                this.timer--;
            }
            break;
        case 4:
            lb[0] = "Time Limit";
            lb[1] = "Reached!";
            if (this.timer <= 0) {
                this.onServerInit(gameServer);
                gameServer.startingFood();
                this.restartCurrentPlayers(gameServer);
            } else {
                lb[2] = "Game restarting in";
                lb[3] = this.timer.toString();
                this.timer--;
            }
            break;
        default:
            break;
    }
};
