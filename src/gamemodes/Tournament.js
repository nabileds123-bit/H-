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
    this.teamSize = 1;
    this.teamCount = 0;
    this.teamColors = [
        {r: 245, g: 0, b: 0},
        {r: 0, g: 120, b: 245}
    ];

    this.winner;
    this.winningTeam = -1;
    this.timer;
    this.timeLimit = 3600; // in seconds
}

module.exports = Tournament; // ⚡ hanya ini, tidak ada export lain
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

Tournament.prototype.getTeamColor = function(team) {
    var color = this.teamColors[team % this.teamColors.length];
    return {
        r: color.r,
        g: color.g,
        b: color.b
    };
};

Tournament.prototype.getTeamSize = function() {
    return this.teamSize > 0 ? this.teamSize : 1;
};

Tournament.prototype.isTeamBattle = function() {
    return this.getTeamSize() > 1;
};

Tournament.prototype.getTeamCount = function() {
    if (this.teamCount > 0) return this.teamCount;
    return Math.max(1, Math.ceil(this.maxContenders / this.getTeamSize()));
};

Tournament.prototype.getTeamPlayerCount = function(team) {
    var count = 0;
    for (var i = 0; i < this.contenders.length; i++) {
        if (this.contenders[i].team === team) count++;
    }
    return count;
};

Tournament.prototype.assignBattleTeam = function(player) {
    var teamCount = this.getTeamCount();
    var bestTeam = 0;
    var bestCount = this.getTeamPlayerCount(0);

    for (var i = 1; i < teamCount; i++) {
        var count = this.getTeamPlayerCount(i);
        if (count < bestCount) {
            bestTeam = i;
            bestCount = count;
        }
    }

    player.team = bestTeam;
    if (this.isTeamBattle()) {
        player.color = this.getTeamColor(bestTeam);
    }
};

Tournament.prototype.getAliveTeams = function() {
    var teams = [];

    for (var i = 0; i < this.contenders.length; i++) {
        var team = this.contenders[i].team || 0;
        if (teams.indexOf(team) == -1) {
            teams.push(team);
        }
    }

    return teams;
};

Tournament.prototype.getWinnerName = function() {
    if (!this.isTeamBattle()) {
        return this.winner ? this.winner.getName() : "";
    }

    var names = [];
    for (var i = 0; i < this.contenders.length; i++) {
        if (this.contenders[i].team === this.winningTeam) {
            names.push(this.contenders[i].getName());
        }
    }

    return names.length ? names.join(" + ") : ("Team " + (this.winningTeam + 1));
};

Tournament.prototype.endGame = function(gameServer) {
    var teams = this.getAliveTeams();
    this.winningTeam = teams.length ? teams[0] : -1;
    this.winner = this.contenders[0];
    this.gamePhase = 3;
    this.timer = this.endTime;
};

Tournament.prototype.endGameTimeout = function(gameServer) {
    gameServer.run = false;
    this.gamePhase = 4;
    this.timer = this.endTime;
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
    this.winningTeam = -1;

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
    var worldId = gameServer.activeWorld && gameServer.activeWorld.id;
    var defaultTeamSize = worldId === ':battle:2v2' ? 2 : 1;
    this.teamSize = Math.max(1, parseInt(config.battleTeamSize, 10) || defaultTeamSize);
    this.teamCount = Math.max(0, parseInt(config.battleTeamCount, 10) || 0);
    this.haveTeams = this.isTeamBattle();

    this.timeLimit = config.tourneyTimeLimit * 60;
};

Tournament.prototype.onPlayerDeath = function(gameServer) { };

Tournament.prototype.formatTime = function(time) {
    if (time < 0) return "0:00";
    var min = Math.floor(this.timeLimit/60);
    var sec = this.timeLimit % 60;
    sec = (sec > 9) ? sec : "0" + sec.toString();
    return min+":"+sec;
};

Tournament.prototype.onServerInit = function(gameServer) {
    this.prepare(gameServer);
};

Tournament.prototype.onPlayerSpawn = function(gameServer,player) {
    if ((this.gamePhase == 0) && (this.contenders.length < this.maxContenders)) {
        player.color = gameServer.getRandomColor();
        this.assignBattleTeam(player);
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
        var index = this.contenders.indexOf(owner);
        if (index != -1) {
            if ('_socket' in this.contenders[index].socket) human_just_died = true;
            this.eliminated.push(owner);
            this.contenders.splice(index,1);
        }

        var humans = 0;
        for (var i = 0; i < this.contenders.length; i++) {
            if ('_socket' in this.contenders[i].socket) humans++;
        }

        var aliveTeams = this.getAliveTeams();
        var teamBattleEnded = this.isTeamBattle() && aliveTeams.length <= 1;
        var soloBattleEnded = !this.isTeamBattle() && this.contenders.length == 1;

        if ((soloBattleEnded || teamBattleEnded || humans == 0 || (humans == 1 && human_just_died)) && this.gamePhase == 2) {
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
            lb[2] = this.contenders.length+"/"+this.maxContenders;
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
            if (this.isTeamBattle()) {
                lb[0] = "Battle 2 vs 2";
                lb[1] = "Team A: " + this.getTeamPlayerCount(0);
                lb[2] = "Team B: " + this.getTeamPlayerCount(1);
                lb[3] = "Time Limit:";
                lb[4] = this.formatTime(this.timeLimit);
            } else {
                lb[0] = "Players Remaining";
                lb[1] = this.contenders.length+"/"+this.maxContenders;
                lb[2] = "Time Limit:";
                lb[3] = this.formatTime(this.timeLimit);
            }
            if (this.timeLimit < 0) {
                this.endGameTimeout(gameServer);
            } else {
                this.timeLimit--;
            }
            break;
        case 3:
            lb[0] = "Congratulations";
            lb[1] = this.getWinnerName();
            lb[2] = "for winning!";
            if (this.timer <= 0) {
                this.onServerInit(gameServer);
                gameServer.startingFood();
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
