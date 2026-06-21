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
    this.winners = [];
    this.maxContenders = 12;

    this.winner;
    this.timer;
    this.timerEndsAt = 0;
    this.timerZeroShown = false;
    this.timeLimit = 3600; // in seconds
    this.timeLimitEndsAt = 0;
    this.matchResultSeq = 0;
    this.matchResultKey = '';
    this.battleRound = 1;
    this.battleScores = {};
    this.battleWinsToFinish = 2;
    this.battleNextRoundTime = 5;
    this.battleMatchFinal = false;
    this.resettingBattleRound = false;
}

module.exports = Tournament;
Tournament.prototype = new Mode();

// Gamemode Specific Functions

Tournament.prototype.setPhaseTimer = function(seconds) {
    this.timer = Math.max(0, parseInt(seconds, 10) || 0);
    this.timerEndsAt = Date.now() + (this.timer * 1000);
    this.timerZeroShown = false;
};

Tournament.prototype.getPhaseTimer = function() {
    if (!this.timerEndsAt) return Math.max(0, this.timer || 0);
    return Math.max(0, Math.ceil((this.timerEndsAt - Date.now()) / 1000));
};

Tournament.prototype.isPhaseTimerDone = function() {
    return this.getPhaseTimer() <= 0;
};

Tournament.prototype.setTimeLimitTimer = function(seconds) {
    this.timeLimit = Math.max(0, parseInt(seconds, 10) || 0);
    this.timeLimitEndsAt = Date.now() + (this.timeLimit * 1000);
};

Tournament.prototype.getTimeLimitTimer = function() {
    if (!this.timeLimitEndsAt) return Math.max(0, this.timeLimit || 0);
    return Math.max(0, Math.ceil((this.timeLimitEndsAt - Date.now()) / 1000));
};

Tournament.prototype.startGamePrep = function(gameServer) {
    this.gamePhase = 1;
    this.setPhaseTimer(this.prepTime);
};

Tournament.prototype.startGame = function(gameServer) {
    gameServer.run = true;
    this.gamePhase = 2;
    this.timerEndsAt = 0;
    this.timerZeroShown = false;
    this.setTimeLimitTimer(this.timeLimit);
    if (this.isBattleWorld(gameServer) && gameServer.releaseBattlePendingSplitMoves) {
        gameServer.releaseBattlePendingSplitMoves();
    }
    this.matchResultSeq++;
    this.matchResultKey = [
        gameServer.activeWorld && gameServer.activeWorld.id || 'world',
        Date.now(),
        this.matchResultSeq
    ].join(':');
    if (gameServer.activeWorld) {
        gameServer.activeWorld.matchResultKey = this.matchResultKey;
        gameServer.activeWorld.rankedResultSaved = false;
    }
    this.getSpectate();
    gameServer.config.playerDisconnectTime = this.dcTime;
};

Tournament.prototype.endGame = function(gameServer) {
    this.winner = this.contenders[0];
    this.updateEliminatedSpectators(this.winner);
    this.gamePhase = 3;
    this.setPhaseTimer(this.endTime);
    this.finishDelayedMatchResults(gameServer);
};

Tournament.prototype.endGameTimeout = function(gameServer) {
    gameServer.run = false;
    this.gamePhase = 4;
    this.setPhaseTimer(this.endTime);
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
    this.winners = [];
    this.winner = null;
    this.timerEndsAt = 0;
    this.timerZeroShown = false;
    this.timeLimitEndsAt = 0;
    this.matchResultKey = '';
    this.battleRound = 1;
    this.battleScores = {};
    this.battleMatchFinal = false;
    this.resettingBattleRound = false;
    if (gameServer.activeWorld) {
        gameServer.activeWorld.matchResultKey = '';
        gameServer.activeWorld.rankedResultSaved = false;
    }

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
    var resultKey = this.matchResultKey || (player && player.matchStartTime) || '';
    if (!player || player.matchResultSent || (resultKey && player.matchResultKey === resultKey)) return;

    player.matchResultSent = true;
    player.matchResultKey = resultKey;
    if (gameServer.pauseTop1Stats) {
        gameServer.pauseTop1Stats(player, player.world, true);
    }
    if (this.isBattleWorld(gameServer)) {
        if (gameServer.recordBattleResult) gameServer.recordBattleResult(player, result, this.getBattleMatchScore(gameServer, player));
        if (gameServer.applyMatchXp) gameServer.applyMatchXp(player);
        if (gameServer.applyBattlePoints) gameServer.applyBattlePoints(player, result);
        return;
    }
    gameServer.sendMatchResult(player, result);
};

Tournament.prototype.finishDelayedMatchResults = function(gameServer) {
    for (var i = 0; i < this.eliminated.length; i++) {
        this.sendPlayerMatchResult(gameServer, this.eliminated[i], 'lose');
    }
    this.eliminated = [];

    if (this.winners && this.winners.length) {
        for (var w = 0; w < this.winners.length; w++) {
            this.sendPlayerMatchResult(gameServer, this.winners[w], 'win');
        }
        this.winners = [];
        return;
    }

    if (this.winner) {
        this.sendPlayerMatchResult(gameServer, this.winner, 'win');
    }
};

Tournament.prototype.finishBattleTeamMatchResults = function(gameServer, winningTeam) {
    var world = gameServer && gameServer.activeWorld;
    var clients = world && world.clients ? world.clients : [];

    for (var i = 0; i < clients.length; i++) {
        var player = clients[i] && clients[i].playerTracker;
        if (!player || !player.battleTeam) continue;
        this.sendPlayerMatchResult(gameServer, player, player.battleTeam === winningTeam ? 'win' : 'lose');
    }

    this.eliminated = [];
    this.winners = [];
};

Tournament.prototype.getBattleMatchScore = function(gameServer, player) {
    var world = gameServer && gameServer.activeWorld;
    var clients = world && world.clients ? world.clients : [];
    var playerKey = this.getBattleRoundKey(player, player && player.battleTeam);
    var scoreFor = this.battleScores[playerKey] || 0;
    var scoreAgainst = 0;

    for (var i = 0; i < clients.length; i++) {
        var opponent = clients[i] && clients[i].playerTracker;
        if (!opponent || opponent === player) continue;

        var opponentKey = this.getBattleRoundKey(opponent, opponent.battleTeam);
        if (!opponentKey || opponentKey === playerKey) continue;
        scoreAgainst = Math.max(scoreAgainst, this.battleScores[opponentKey] || 0);
    }

    return {
        scoreFor: scoreFor,
        scoreAgainst: scoreAgainst
    };
};

Tournament.prototype.canPlayerMove = function(player) {
    if (this.gamePhase == 2) return true;
    if (this.gamePhase != 3 || !player || !this.isBattleWorld(player.gameServer)) return false;
    if (player === this.winner) return true;
    return this.winners && this.winners.indexOf(player) !== -1;
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

Tournament.prototype.isBattleWorld = function(gameServer) {
    var worldId = gameServer && gameServer.activeWorld && gameServer.activeWorld.id || '';
    return String(worldId).indexOf(':battle') === 0;
};

Tournament.prototype.isBattle2v2World = function(gameServer) {
    return gameServer && gameServer.activeWorld && gameServer.activeWorld.id === ':battle:2v2';
};

Tournament.prototype.addBattleLeaderboardPlayers = function(lb, startIndex) {
    var index = startIndex;
    for (var i = 0; i < this.contenders.length; i++) {
        var player = this.contenders[i];
        if (!player || !player.cells || player.cells.length <= 0) continue;
        var key = this.getBattleRoundKey(player, player.battleTeam);
        var score = this.battleScores[key] || 0;
        var name = player.getName ? player.getName() : (player.name || 'player');
        lb[index++] = name + ' - ' + score;
    }

    if (index === startIndex) {
        var winnerKey = this.getBattleRoundKey(this.winner, this.winner && this.winner.battleTeam);
        var winnerScore = this.battleScores[winnerKey] || 0;
        var winnerName = this.winner && this.winner.getName ? this.winner.getName() : '-';
        lb[index] = winnerName + ' - ' + winnerScore;
    }
};

Tournament.prototype.getBattleRoundKey = function(player, team) {
    if (team) return 'team:' + team;
    if (!player) return '';
    if (player.authUser && player.authUser.id) return 'user:' + player.authUser.id;
    if (player.battleLobbyClientId) return 'client:' + player.battleLobbyClientId;
    if (player.socket && player.socket.battleLobbyClientId) return 'client:' + player.socket.battleLobbyClientId;
    return 'name:' + (player.getName ? player.getName() : player.name || 'player');
};

Tournament.prototype.addBattleRoundWin = function(player, team) {
    var key = this.getBattleRoundKey(player, team);
    if (!key) return false;

    this.battleScores[key] = (this.battleScores[key] || 0) + 1;
    return this.battleScores[key] >= this.battleWinsToFinish;
};

Tournament.prototype.clearBattleArenaNodes = function(gameServer) {
    this.resettingBattleRound = true;
    var len = gameServer.nodes.length;
    for (var i = 0; i < len; i++) {
        var node = gameServer.nodes[0];
        if (!node) continue;
        gameServer.removeNode(node);
    }
    this.resettingBattleRound = false;
};

Tournament.prototype.startNextBattleRound = function(gameServer) {
    var world = gameServer && gameServer.activeWorld;
    var sockets = world && world.clients ? world.clients.slice(0) : [];
    var config = gameServer.getWorldConfig ? gameServer.getWorldConfig(world) : gameServer.config;

    this.clearBattleArenaNodes(gameServer);
    this.battleRound++;
    this.gamePhase = 0;
    this.contenders = [];
    this.eliminated = [];
    this.winners = [];
    this.winner = null;
    this.battleMatchFinal = false;
    this.matchResultKey = '';
    this.timerEndsAt = 0;
    this.timerZeroShown = false;
    this.timeLimitEndsAt = 0;
    this.timeLimit = config.tourneyTimeLimit * 60;
    this.prepTime = config.tourneyPrepTime;
    this.endTime = config.tourneyEndTime;
    this.maxContenders = config.tourneyMaxPlayers;

    if (world) {
        world.matchResultKey = '';
        world.rankedResultSaved = false;
    }

    if (typeof gameServer.startingFood === 'function') {
        gameServer.startingFood();
    }

    for (var i = 0; i < sockets.length; i++) {
        var player = sockets[i] && sockets[i].playerTracker;
        if (!player || !player.getStatus || !player.getStatus()) continue;
        player.battleTeam = '';
        player.spectate = false;
        player.spectatedPlayer = null;
        this.onPlayerSpawn(gameServer, player);
    }
};

Tournament.prototype.endBattleRound = function(gameServer, winner) {
    this.winner = winner || null;
    this.updateEliminatedSpectators(this.winner);
    this.battleMatchFinal = this.addBattleRoundWin(winner);
    this.gamePhase = 3;
    this.setPhaseTimer(this.battleMatchFinal ? this.endTime : this.battleNextRoundTime);

    if (this.battleMatchFinal) {
        this.finishDelayedMatchResults(gameServer);
    }
};

Tournament.prototype.endBattleTeamRound = function(gameServer, winningTeam) {
    var clients = gameServer && gameServer.activeWorld && gameServer.activeWorld.clients || [];

    this.winners = [];
    for (var c = 0; c < clients.length; c++) {
        var tracker = clients[c] && clients[c].playerTracker;
        if (tracker && tracker.battleTeam === winningTeam) {
            this.winners.push(tracker);
        }
    }

    this.winner = this.winners[0] || null;
    this.updateEliminatedSpectators(this.winner);
    this.battleMatchFinal = this.addBattleRoundWin(this.winner, winningTeam);
    this.gamePhase = 3;
    this.setPhaseTimer(this.battleMatchFinal ? this.endTime : this.battleNextRoundTime);

    if (this.battleMatchFinal) {
        this.finishBattleTeamMatchResults(gameServer, winningTeam);
    }
};

Tournament.prototype.cleanupBattleMatch = function(gameServer) {
    var world = gameServer && gameServer.activeWorld;
    var sockets = world && world.clients ? world.clients.slice(0) : [];
    var fallbackMode = gameServer.getNonBattleDefaultWorldId ? gameServer.getNonBattleDefaultWorldId() : null;

    if (gameServer.clearBattleActiveMatch && world) {
        gameServer.clearBattleActiveMatch(world.id, 'match_end');
    }

    for (var i = 0; i < sockets.length; i++) {
        var player = sockets[i] && sockets[i].playerTracker;
        if (!player) continue;
        player.battleTeam = '';
        player.spectate = false;
        player.spectatedPlayer = null;
    }

    this.prepare(gameServer);
    this.matchResultKey = '';

    if (!fallbackMode || (gameServer.isBattleModeRequest && gameServer.isBattleModeRequest(fallbackMode))) return;

    for (var s = 0; s < sockets.length; s++) {
        if (!sockets[s] || sockets[s].readyState !== 1) continue;
        gameServer.setClientWorld(sockets[s], fallbackMode, true);
    }
};

Tournament.prototype.onPlayerSpawn = function(gameServer, player) {
    if ((this.gamePhase == 0) && (this.contenders.length < this.maxContenders)) {
        player.color = gameServer.getRandomColor();
        player.battleTeam = this.isBattle2v2World(gameServer) ? (this.contenders.length < 2 ? 'A' : 'B') : '';
        this.contenders.push(player);
        gameServer.spawnPlayer(player);

        if (this.contenders.length == this.maxContenders) {
            this.startGamePrep(gameServer);
        }
    }
};

Tournament.prototype.tryEndBattleTeamGame = function(gameServer) {
    if (!this.isBattle2v2World(gameServer) || this.gamePhase != 2) return false;

    var aliveTeams = {};
    for (var i = 0; i < this.contenders.length; i++) {
        var contender = this.contenders[i];
        if (!contender || !contender.battleTeam || !contender.cells || contender.cells.length <= 0) continue;
        aliveTeams[contender.battleTeam] = true;
    }

    var teams = Object.keys(aliveTeams);
    if (teams.length !== 1) return false;

    this.endBattleTeamRound(gameServer, teams[0]);
    return true;
};

Tournament.prototype.onCellRemove = function(cell) {
    var owner = cell.owner,
        human_just_died = false;

    if (this.resettingBattleRound) return;

    if (owner.cells.length <= 0) {
        this.queueEliminatedPlayer(owner);
        if (!this.isBattleWorld(cell.owner.gameServer) && !this.isBattle2v2World(cell.owner.gameServer)) {
            this.sendPlayerMatchResult(cell.owner.gameServer, owner, 'lose');
        }

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

        if (this.tryEndBattleTeamGame(cell.owner.gameServer)) {
            return;
        }

        if ((this.contenders.length == 1 || humans == 0 || (humans == 1 && human_just_died)) && this.gamePhase == 2) {
            if (this.isBattleWorld(cell.owner.gameServer)) {
                this.endBattleRound(cell.owner.gameServer, this.contenders[0] || this.rankOne || null);
            } else {
                this.endGame(cell.owner.gameServer);
            }
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
            this.timer = this.getPhaseTimer();
            if (this.isBattleWorld(gameServer)) {
                lb[0] = "Game Starting in";
                lb[1] = this.timer.toString();
                lb[2] = "Good luck!";
            } else {
                lb[0] = "Game starting in";
                lb[1] = this.timer.toString();
                lb[2] = "Good luck!";
            }
            if (this.isPhaseTimerDone() && this.timerZeroShown) {
                this.startGame(gameServer);
            } else if (this.isPhaseTimerDone()) {
                this.timerZeroShown = true;
            }
            break;
        case 2:
            this.timeLimit = this.getTimeLimitTimer();
            if (this.isBattleWorld(gameServer)) {
                lb[0] = "Players Remaining";
                lb[1] = this.contenders.length + "/" + this.maxContenders;
                lb[2] = "-----------";
                lb[3] = "round " + this.battleRound;
                this.addBattleLeaderboardPlayers(lb, 4);
            } else {
                lb[0] = "Players Remaining";
                lb[1] = this.contenders.length + "/" + this.maxContenders;
                lb[2] = "Time Limit:";
                lb[3] = this.formatTime(this.timeLimit);
                if (this.timeLimit <= 0) {
                    this.endGameTimeout(gameServer);
                }
            }
            break;
        case 3:
            this.timer = this.getPhaseTimer();
            lb[0] = this.battleMatchFinal ? "Congratulations" : "Round " + this.battleRound;
            lb[1] = this.winner ? this.winner.getName() : "Winner";
            lb[2] = this.battleMatchFinal ? "for winning!" : "winner";
            if (this.isPhaseTimerDone() && this.timerZeroShown) {
                if (this.isBattleWorld(gameServer)) {
                    if (this.battleMatchFinal) {
                        this.cleanupBattleMatch(gameServer);
                    } else {
                        this.startNextBattleRound(gameServer);
                    }
                } else {
                    this.onServerInit(gameServer);
                    gameServer.startingFood();
                    this.restartCurrentPlayers(gameServer);
                }
            } else if (this.isPhaseTimerDone()) {
                this.timerZeroShown = true;
            } else {
                if (!this.isBattleWorld(gameServer)) {
                    lb[3] = "Game restarting in";
                    lb[4] = this.timer.toString();
                }
            }
            break;
        case 4:
            this.timer = this.getPhaseTimer();
            lb[0] = "Time Limit";
            lb[1] = "Reached!";
            if (this.isPhaseTimerDone() && this.timerZeroShown) {
                if (this.isBattleWorld(gameServer)) {
                    this.cleanupBattleMatch(gameServer);
                } else {
                    this.onServerInit(gameServer);
                    gameServer.startingFood();
                    this.restartCurrentPlayers(gameServer);
                }
            } else if (this.isPhaseTimerDone()) {
                this.timerZeroShown = true;
            } else {
                if (!this.isBattleWorld(gameServer)) {
                    lb[2] = "Game restarting in";
                    lb[3] = this.timer.toString();
                }
            }
            break;
        default:
            break;
    }
};
