(function (wHandle, wjQuery) {
    /**
     * Enter url in the following format: HOST : PORT
     *
     * Example: 127.0.0.1:443
     *
     */
    var CONNECTION_PORT = window.location.port ? ":" + window.location.port : "";
    var CONNECTION_URL = window.location.hostname + CONNECTION_PORT;
    var CONNECTION_PROTOCOL = window.location.protocol === "https:" ? "wss://" : "ws://";
    /**
     * Enter path to the skin image folder
     * To take skins from the official server enter: "http://agar.io/skins/"
     */
    var SKIN_URL = "../skins/";//skins folder


    var touchX, touchY,
    // is this running in a touch capable environment?
        touchable = 'createTouch' in document,
        touches = []; // array of touch vectors
    var nonPassiveEventOptions = false;
    try {
        var passiveTestOptions = Object.defineProperty({}, "passive", {
            get: function () {
                nonPassiveEventOptions = { passive: false };
            }
        });
        var passiveTestHandler = function () {};
        wHandle.addEventListener("testPassive", passiveTestHandler, passiveTestOptions);
        wHandle.removeEventListener("testPassive", passiveTestHandler, passiveTestOptions);
    } catch (e) {
        nonPassiveEventOptions = false;
    }

    var leftTouchID = -1,
        leftTouchPos = new Vector2(0,0),
        leftTouchStartPos = new Vector2(0,0),
        leftVector = new Vector2(0,0);



    function gameLoop() {
        ma = true;
        document.getElementById("canvas").focus();
        var isTyping = false;
        var chattxt;
        getServerList();
        setInterval(getServerList, 18E4);
        mainCanvas = nCanvas = document.getElementById("canvas");
        ctx = mainCanvas.getContext("2d");
        /*mainCanvas.onmousedown = function (event) {
            if (isTouchStart) {
                var xOffset = event.clientX - (5 + canvasWidth / 5 / 2),
                    yOffset = event.clientY - (5 + canvasWidth / 5 / 2);
                if (Math.sqrt(xOffset * xOffset + yOffset * yOffset) <= canvasWidth / 5 / 2) {
                    sendMouseMove();
                    sendUint8(17); //split
                    return
                }
            }


            rawMouseX = event.clientX;
            rawMouseY = event.clientY;
            mouseCoordinateChange();
            sendMouseMove()
        };*/
        mainCanvas.onmousemove = function (event) {
            rawMouseX = event.clientX;
            rawMouseY = event.clientY;
            mouseCoordinateChange()
        };


        if(touchable) {
            mainCanvas.addEventListener( 'touchstart', onTouchStart, nonPassiveEventOptions );
            mainCanvas.addEventListener( 'touchmove', onTouchMove, nonPassiveEventOptions );
            mainCanvas.addEventListener( 'touchend', onTouchEnd, nonPassiveEventOptions );
             }

        mainCanvas.onmouseup = function () {
        };
        if ("onwheel" in document) {
            document.addEventListener("wheel", handleWheel, nonPassiveEventOptions);
        } else if (/firefox/i.test(navigator.userAgent)) {
            document.addEventListener("DOMMouseScroll", handleWheel, nonPassiveEventOptions);
        } else {
            document.body.onmousewheel = handleWheel;
        }

        mainCanvas.onfocus = function () {
            isTyping = false;
        };

        document.getElementById("chat_textbox").onblur = function () {
            isTyping = false;
        };


        document.getElementById("chat_textbox").onfocus = function () {
            isTyping = true;
        };

        var spacePressed = false,
            qPressed = false,
            wPressed = false,
            ctrlPressed = false;
        function isGamePaused() {
            return wjQuery("#overlays").is(":visible");
        }

        function sendPauseState(paused) {
            sendUint8(paused ? 90 : 91);
        }

        wHandle.onkeydown = function (event) {
            switch (event.keyCode) {
                case 17: // Ctrl = buka chat guild
                    if (!ctrlPressed && !hasOverlay) {
                        var chatInput = document.getElementById("chat_textbox");

                        if (chatInput) {
                            chatInput.focus();
                            isTyping = true;

                            var value = chatInput.value || "";

                            // kalau kosong, isi /g
                            if (value.trim().length < 1) {
                                chatInput.value = "/g ";
                            }
                            // kalau belum diawali /g, tambahkan /g di depan
                            else if (!/^\/g\s/i.test(value)) {
                                chatInput.value = "/g " + value;
                            }
                            // kalau sudah ada /g, biarkan saja, jangan ketik ulang

                            // cursor taruh di akhir tulisan
                            chatInput.selectionStart = chatInput.selectionEnd = chatInput.value.length;
                        }

                        ctrlPressed = true;
                        event.preventDefault();
                    }
                    break;
                case 32: // split
                    if ((!spacePressed) && (!isTyping) && !isGamePaused()) {
                        sendMouseMove();
                        sendUint8(17);
                        spacePressed = true;
                    }
                    break;
                case 81: // key q pressed
                    if ((!qPressed) && (!isTyping) && !isGamePaused()) {
                        sendUint8(18);
                        qPressed = true;
                    }
                    break;
                case 69: // eject mass
                case 87: // eject mass
                    if ((!wPressed) && (!isTyping) && !isGamePaused()) {
                        sendMouseMove();
                        sendUint8(21);
                        wPressed = true;
                    }
                    break;
                case 27: // quit
                    showOverlays(true);
                    sendPauseState(true);
                    wPressed = qPressed = spacePressed = ctrlPressed = false;
                    wHandle.isSpectating = false;
                    break;

                case 13:
                    if (isTyping) {
                        isTyping = false;
                        document.getElementById("chat_textbox").blur();
                        chattxt = document.getElementById("chat_textbox").value;
                        if (chattxt.length > 0) sendChat(chattxt);
                        document.getElementById("chat_textbox").value = "";

                    }
                    else {
                        if (!hasOverlay) {
                            document.getElementById("chat_textbox").focus();
                            isTyping = true;
                        }
                    }
            }
        };
        wHandle.onkeyup = function (event) {
            switch (event.keyCode) {
                case 17:
                    ctrlPressed = false;
                    break;
                case 32:
                    spacePressed = false;
                    break;
                case 69:
                case 87:
                    wPressed = false;
                    break;
                case 81:
                    if (qPressed) {
                        sendUint8(19);
                        qPressed = false;
                    }
                    break;
            }
        };
        wHandle.onblur = function () {
            sendUint8(19);
            wPressed = qPressed = spacePressed = ctrlPressed = false
        };

        wHandle.onresize = canvasResize;
        canvasResize();
        if (wHandle.requestAnimationFrame) {
            wHandle.requestAnimationFrame(redrawGameScene);
        } else {
            setInterval(drawGameScene, 1E3 / 60);
        }
        setInterval(function () {
            if (!isGamePaused()) {
                sendMouseMove();
            }
        }, 40);
        if (w) {
            wjQuery("#region").val(w);
        }
        Ha();
        null == ws && w && showConnecting();
        wjQuery("#overlays").show();

    }




    function onTouchStart(e) {

        for(var i = 0; i<e.changedTouches.length; i++){
            var touch =e.changedTouches[i];
            //console.log(leftTouchID + " "
            if((leftTouchID<0) && (touch.clientX<canvasWidth/2))
            {
                leftTouchID = touch.identifier;
                leftTouchStartPos.reset(touch.clientX, touch.clientY);
                leftTouchPos.copyFrom(leftTouchStartPos);
                leftVector.reset(0,0);
            }

            var size = ~~ (canvasWidth / 7);
            if ((touch.clientX > canvasWidth - size) && (touch.clientY > canvasHeight - size)) {
                sendMouseMove();
                sendUint8(17); //split
            }

            if ((touch.clientX > canvasWidth - size) && (touch.clientY > canvasHeight - 2*size -10) && (touch.clientY < canvasHeight - size -10 )) {
                sendMouseMove();
                sendUint8(21); //eject
            }



        }
        touches = e.touches;
    }

    function onTouchMove(e) {
        // Prevent the browser from doing its default thing (scroll, zoom)
        if (e.cancelable) e.preventDefault();

        for(var i = 0; i<e.changedTouches.length; i++){
            var touch =e.changedTouches[i];
            if(leftTouchID == touch.identifier)
            {
                leftTouchPos.reset(touch.clientX, touch.clientY);
                leftVector.copyFrom(leftTouchPos);
                leftVector.minusEq(leftTouchStartPos);
                rawMouseX = leftVector.x*3 + canvasWidth/2;
                rawMouseY = leftVector.y*3 + canvasHeight/2;
                mouseCoordinateChange();
                sendMouseMove();
            }
        }

        touches = e.touches;

    }

    function onTouchEnd(e) {

        touches = e.touches;

        for(var i = 0; i<e.changedTouches.length; i++){
            var touch =e.changedTouches[i];
            if(leftTouchID == touch.identifier)
            {
                leftTouchID = -1;
                leftVector.reset(0,0);
                break;
            }
        }
    }


    function handleWheel(event) {
        if (event && event.cancelable) event.preventDefault();
    // Normalisasi ke dy (px): dy>0 = scroll down
    var dy = 0;
    if (typeof event.deltaY === 'number') {
        dy = event.deltaY;
        if (event.deltaMode === 1) dy = 33;       // line -> px
        else if (event.deltaMode === 2) dy= 120; // page -> px
    } else if (typeof event.wheelDelta === 'number') {
        dy = -event.wheelDelta; // up=+120 -> dy=-120
    } else if (typeof event.detail === 'number') {
        dy = event.detail * 120;
    }

    var steps = dy / 120;                 // 1 step ≈ 120px
    if (INVERT_WHEEL) steps = -steps;     // opsi balik arah

    // TANPA BATAS (no clamp)
    zoom *= Math.pow(0.9, steps);

    // Safety agar tidak 0/NaN/Inf
    if (!isFinite(zoom) || zoom <= 0) zoom = 1e-6;

    return false;
}

// === Zoom options ===
var USE_MASS_ZOOM = false;   // false = zoom murni dari wheel (tanpa pengaruh massa)
var INVERT_WHEEL  = false;   // true kalau mau kebalik (scroll up = zoom in)

    function buildQTree() {
        if (.4 > viewZoom) qTree = null;
        else {
            var a = Number.POSITIVE_INFINITY,
                b = Number.POSITIVE_INFINITY,
                c = Number.NEGATIVE_INFINITY,
                d = Number.NEGATIVE_INFINITY,
                e = 0;
            for (var i = 0; i < nodelist.length; i++) {
                var node = nodelist[i];
                if (node.shouldRender() && !node.prepareData && 20 < node.size * viewZoom) {
                    e = Math.max(node.size, e);
                    a = Math.min(node.x, a);
                    b = Math.min(node.y, b);
                    c = Math.max(node.x, c);
                    d = Math.max(node.y, d);
                }
            }
            qTree = Quad.init({
                minX: a - (e + 100),
                minY: b - (e + 100),
                maxX: c + (e + 100),
                maxY: d + (e + 100),
                maxChildren: 2,
                maxDepth: 4
            });
            for (i = 0; i < nodelist.length; i++) {
                node = nodelist[i];
                if (node.shouldRender() && !(20 >= node.size * viewZoom)) {
                    for (a = 0; a < node.points.length; ++a) {
                        b = node.points[a].x;
                        c = node.points[a].y;
                        b < nodeX - canvasWidth / 2 / viewZoom || c < nodeY - canvasHeight / 2 / viewZoom || b > nodeX + canvasWidth / 2 / viewZoom || c > nodeY + canvasHeight / 2 / viewZoom || qTree.insert(node.points[a]);
                    }
                }
            }
        }
    }

    function mouseCoordinateChange() {
        X = (rawMouseX - canvasWidth / 2) / viewZoom + nodeX;
        Y = (rawMouseY - canvasHeight / 2) / viewZoom + nodeY
    }

    function getServerList() {
        if (null == playerStat) {
            playerStat = {};
            wjQuery("#region").children().each(function () {
                var a = wjQuery(this),
                    b = a.val();
                b && (playerStat[b] = a.text())
            });
        }
        wjQuery.get("info.php", function (a) {
            var numPlayers = {};
            for (var region in a.regions) {
                var d = region.split(":")[0];
                numPlayers[d] = numPlayers[d] || 0;
                numPlayers[d] += a.regions[region].numPlayers
            }
            for (var numplayer in numPlayers) {
                wjQuery('#region option[value="' + numplayer + '"]').text(playerStat[numplayer] + " (" + numPlayers[numplayer] + " Player)")
            }
        }, "json")
    }

    function hideOverlays() {
        hasOverlay = false;
        wjQuery("#adsBottom").hide();
        wjQuery("#overlays").removeClass("is-menu-only").hide();
        sendUint8(91);
        Ha()
    }

    function setRegion(a) {
        if (a && a != w) {
            if (wjQuery("#region").val() != a) {
                wjQuery("#region").val(a);
            }
            w = wHandle.localStorage.location = a;
            wjQuery(".region-message").hide();
            wjQuery(".region-message." + a).show();
            wjQuery(".btn-needs-server").prop("disabled", false);
            ma && showConnecting();
        }
    }

    function showOverlays(arg) {
        hasOverlay = true;
        userNickName = null;
        sendUint8(90);
        wjQuery("#overlays").toggleClass("is-menu-only", !!arg);
        wjQuery("#overlays").fadeIn(arg ? 200 : 3E3);
        arg || wjQuery("#adsBottom").fadeIn(3E3)
    }

    function Ha() {
        wjQuery("#region").val() ? wHandle.localStorage.location = wjQuery("#region").val() : wHandle.localStorage.location && wjQuery("#region").val(wHandle.localStorage.location);
        wjQuery("#region").val() ? wjQuery("#locationKnown").append(wjQuery("#region")) : wjQuery("#locationUnknown").append(wjQuery("#region"))
    }

    function attemptConnection(force) {
        console.log("Find " + w + gameMode);
        wsConnect(CONNECTION_PROTOCOL + CONNECTION_URL, force)
    }

    function showConnecting(force) {
        if (ma && w) {
            if (!force && (wsIsOpen() || wsIsConnecting())) {
                wjQuery("#connecting").hide();
                return;
            }
            wjQuery("#connecting").show();
            attemptConnection(force)
        }
    }

    function wsConnect(wsUrl, force) {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        if (ws) {
            if (!force && (ws.readyState === 0 || ws.readyState === 1)) {
                return;
            }
            ws.onopen = null;
            ws.onmessage = null;
            ws.onclose = null;
            try {
                ws.close()
            } catch (b) {
            }
            ws = null
        }
        var c = CONNECTION_URL;
        wsUrl = CONNECTION_PROTOCOL + c;
        nodesOnScreen = [];
        playerCells = [];
        nodes = {};
        nodelist = [];
        Cells = [];
        leaderBoard = [];
        mainCanvas = teamScores = null;
        userScore = 0;
        resetMatchStats();
        console.log("Connecting to " + wsUrl);
        ws = new WebSocket(wsUrl);
        ws.binaryType = "arraybuffer";
        ws.onopen = onWsOpen;
        ws.onmessage = onWsMessage;
        ws.onclose = onWsClose;
        ws.onerror = function () {
            console.log("socket error");
        }
    }

    function prepareData(a) {
        return new DataView(new ArrayBuffer(a))
    }

    function wsSend(a) {
        ws.send(a.buffer)
    }

    function onWsOpen() {
        var msg;
        delay = 500;
        wjQuery("#connecting").hide();
        console.log("socket open");
        msg = prepareData(5);
        msg.setUint8(0, 254);
        msg.setUint32(1, 1, true);
        wsSend(msg);
        msg = prepareData(5);
        msg.setUint8(0, 255);
        msg.setUint32(1, 1332175218, true);
        wsSend(msg);
        sendGameMode();
        sendNickName();
        if (wHandle.isSpectating) {
            sendUint8(1);
        }
    }

    function onWsClose(event) {
        console.log("socket close" + (event ? " code=" + event.code + " reason=" + (event.reason || "") + " clean=" + event.wasClean : ""));
        if (event && event.code === 4001) {
            console.log("selected game mode is inactive; reconnect stopped");
            wjQuery("#connecting").show();
            return;
        }
        if (gameMode === ':tournament') {
            console.log("tournament connection closed; reconnect stopped");
            wjQuery("#connecting").show();
            return;
        }
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
        }
        reconnectTimer = setTimeout(showConnecting, delay);
        delay *= 1.5
    }

    function onWsMessage(msg) {
        handleWsMessage(new DataView(msg.data))
    }

    var SKIN_META_START = "\uE120";
    var SKIN_META_END = "\uE121";

    function parseCellName(name) {
        name = String(name || "");
        if (name.charAt(0) !== SKIN_META_START) {
            return {
                name: name,
                skinName: ""
            };
        }

        var endIndex = name.indexOf(SKIN_META_END, 1);
        if (endIndex < 0) {
            return {
                name: name,
                skinName: ""
            };
        }

        return {
            name: name.slice(endIndex + 1),
            skinName: name.slice(1, endIndex).toLowerCase()
        };
    }

    function isPrivateSkinKey(skinName) {
        return /^(user|guild):/i.test(String(skinName || ""));
    }

    function getPlainPlayerName(name) {
        name = String(name || "").toLowerCase();
        if (name.charAt(0) === "[") {
            var guildEnd = name.indexOf("]");
            if (guildEnd >= 0) {
                name = name.slice(guildEnd + 1).trim();
            }
        }

        return name;
    }

    function hasGuildTagName(name) {
        name = String(name || "");
        return name.charAt(0) === "[" && name.indexOf("]") > 0;
    }

    function isNoDisplayName(name) {
        name = String(name || "").toLowerCase();
        for (var i = 0; i < knownNameDict_noDisp.length; i++) {
            if (String(knownNameDict_noDisp[i] || "").toLowerCase() === name) {
                return true;
            }
        }

        return false;
    }

    function shouldHideCellName(name, skinName) {
        if (hasGuildTagName(name)) {
            return false;
        }

        return isNoDisplayName(skinName) || isNoDisplayName(getPlainPlayerName(name));
    }

    function handleWsMessage(msg) {
        function getString() {
            var text = '',
                char;
            while ((char = msg.getUint16(offset, true)) != 0) {
                offset += 2;
                text += String.fromCharCode(char);
            }
            offset += 2;
            return text;
        }

        var offset = 0,
            setCustomLB = false;
        240 == msg.getUint8(offset) && (offset += 5);
        switch (msg.getUint8(offset++)) {
            case 16: // update nodes
                updateNodes(msg, offset);
                break;
            case 17: // update position
                posX = msg.getFloat32(offset, true);
                offset += 4;
                posY = msg.getFloat32(offset, true);
                offset += 4;
                posSize = msg.getFloat32(offset, true);
                offset += 4;
                break;
            case 20: // clear nodes
                playerCells = [];
                nodesOnScreen = [];
                nodes = {};
                nodelist = [];
                Cells = [];
                leaderBoard = [];
                userScore = 0;
                break;
            case 21: // draw line
                lineX = msg.getInt16(offset, true);
                offset += 2;
                lineY = msg.getInt16(offset, true);
                offset += 2;
                if (!drawLine) {
                    drawLine = true;
                    drawLineX = lineX;
                    drawLineY = lineY;
                }
                break;
            case 32: // add node
                nodesOnScreen.push(msg.getUint32(offset, true));
                offset += 4;
                break;
            case 42:
                var systemMessage = '';
                while (offset + 1 < msg.byteLength) {
                    systemMessage += String.fromCharCode(msg.getUint16(offset, true));
                    offset += 2;
                }
                addSystemChat(systemMessage);
                break;
            case 48: // update leaderboard (custom text)
                setCustomLB = true;
                noRanking = true;
                teamScores = null;
                leaderBoard = [];
                var LBtextNum = msg.getUint32(offset, true);
                offset += 4;
                for (i = 0; i < LBtextNum; ++i) {
                    leaderBoard.push({
                        id: 0,
                        name: getString()
                    });
                }
                drawLeaderBoard();
                break;
            case 49: // update leaderboard (ffa)
                if (!setCustomLB) {
                    noRanking = false;
                }
                teamScores = null;
                var LBplayerNum = msg.getUint32(offset, true);
                offset += 4;
                leaderBoard = [];
                for (i = 0; i < LBplayerNum; ++i) {
                    var nodeId = msg.getUint32(offset, true);
                    offset += 4;
                    leaderBoard.push({
                        id: nodeId,
                        name: getString()
                    })
                }
                drawLeaderBoard();
                break;
            case 50: // update leaderboard (teams)
                teamScores = [];
                var LBteamNum = msg.getUint32(offset, true);
                offset += 4;
                for (var i = 0; i < LBteamNum; ++i) {
                    teamScores.push(msg.getFloat32(offset, true));
                    offset += 4;
                }
                drawLeaderBoard();
                break;
            case 64: // set border
                leftPos = msg.getFloat64(offset, true);
                offset += 8;
                topPos = msg.getFloat64(offset, true);
                offset += 8;
                rightPos = msg.getFloat64(offset, true);
                offset += 8;
                bottomPos = msg.getFloat64(offset, true);
                offset += 8;
                posX = (rightPos + leftPos) / 2;
                posY = (bottomPos + topPos) / 2;
                posSize = 1;
                if (0 == playerCells.length) {
                    nodeX = posX;
                    nodeY = posY;
                    viewZoom = posSize;
                }
                break;
            case 99:
                //alert("get message");

                addChat(msg, offset);

                break;
            case 122:
                var resultJson = getString();

                try {
                    var resultData = JSON.parse(resultJson);
                    matchStats.foodEaten = resultData.foodEaten || 0;
                    matchStats.cellsEaten = resultData.cellsEaten || 0;
                    if (null != wHandle.localStorage) {
                        if (typeof resultData.xpGain !== "undefined") {
                            wHandle.localStorage.authLastXpGain = resultData.xpGain || 0;
                        }
                        if (typeof resultData.xp !== "undefined") {
                            wHandle.localStorage.authXp = resultData.xp || 0;
                        }
                        if (typeof resultData.xpMax !== "undefined") {
                            wHandle.localStorage.authXpMax = resultData.xpMax || 0;
                        }
                        if (typeof resultData.level !== "undefined") {
                            wHandle.localStorage.authLevel = resultData.level || 1;
                        }
                    }
                    if (typeof wHandle.updatePlayerExpVisibility === "function") {
                        wHandle.updatePlayerExpVisibility();
                    }
                    if (resultData.result !== "win") {
                        if (!matchStats.endTime) {
                            matchStats.endTime = Date.now();
                        }
                        hideTopTimePopup();
                        showMatchResult();
                    } else if (matchResultVisible) {
                        showMatchResult();
                    }
                } catch (e) {}

                break;
            case 123:
                var topTimeJson = getString();
                try {
                    var topTimeData = JSON.parse(topTimeJson);
                    showTopTimePopup(topTimeData.ms || 0);
                } catch (e) {}
                break;

        }
    }

    function addSystemChat(message) {
        if (!message) return;

        chatBoard.push({
            "name": "System",
            "color": "#ff6666",
            "message": message,
            "time": Date.now(),
            "isSystem": true
        });
        drawChatBoard();
    }
    wHandle.addSystemChat = addSystemChat;

    function parseChatEffectMessage(text) {
        text = String(text || "");
        var match = /^\uE100([a-z]+)\uE101([\s\S]*)$/.exec(text);
        if (!match) {
            return {
                effect: "",
                message: text
            };
        }

        return {
            effect: match[1],
            message: match[2]
        };
    }


    function addChat(view, offset) {
        function getString() {
            var text = '',
                char;
            while ((char = view.getUint16(offset, true)) != 0) {
                offset += 2;
                text += String.fromCharCode(char);
            }
            offset += 2;
            return text;
        }

        var flags = view.getUint8(offset++);
        // for future expansions
        if (flags & 2) {
            offset += 4;
        }
        if (flags & 4) {
            offset += 8;
        }
        if (flags & 8) {
            offset += 16;
        }

        var r = view.getUint8(offset++),
            g = view.getUint8(offset++),
            b = view.getUint8(offset++),
            color = (r << 16 | g << 8 | b).toString(16);
        while (color.length > 6) {
            color = '0' + color;
        }
        color = '#' + color;
        var isGuildChat = !!(flags & 32);
        var isDeadChat = !!(flags & 16);
        var premiumEffect = (flags & 128) ? "love" : (flags & 64) ? "bull" : "";
        var chatName = getString();
        var chatMessage = getString();
        var parsedEffect = parseChatEffectMessage(chatMessage);
        chatMessage = parsedEffect.message;
        premiumEffect = parsedEffect.effect || premiumEffect;

        chatBoard.push({
            "name": chatName,
            "color": color,
            "message": chatMessage,
            "time": Date.now(),
            "isGuild": isGuildChat,
            "isDead": isDeadChat,
            "premiumEffect": premiumEffect
        });
        //console.log(chatBoard);
        drawChatBoard();
        //drawChatBoardLine();
    }

    function drawChatBoard() {
        var nowtime = Date.now();
        var CHAT_LIFE_TIME = 15000;     // chat mulai hilang setelah 15 detik
        var CHAT_REMOVE_DELAY = 1000;   // hilang 1 chat tiap 1 detik
        var CHAT_MAX_WIDTH = 320;   // kecilkan kalau mau lebih cepat turun ke bawah

        if (!drawChatBoard.lastRemoveTime) {
            drawChatBoard.lastRemoveTime = 0;
        }

        // hapus chat paling lama duluan, 1 per 1
        if (
            chatBoard.length > 0 &&
            nowtime - chatBoard[0].time >= CHAT_LIFE_TIME &&
            nowtime - drawChatBoard.lastRemoveTime >= CHAT_REMOVE_DELAY
        ) {
            chatBoard.shift();
            drawChatBoard.lastRemoveTime = nowtime;
        }

        if (chatBoard.length < 1) {
            chatCanvas = null;
            return;
        }

        chatCanvas = document.createElement("canvas");
        var ctx = chatCanvas.getContext("2d");

        var scaleFactor = Math.min(Math.max(canvasWidth / 1200, 0.75), 1);
        var maxChatVisible = 15;
        var visibleCount = Math.min(chatBoard.length, maxChatVisible);

        // ini yang bikin chat tidak tembus ke kanan
        chatCanvas.width = Math.min(canvasWidth - 16, CHAT_MAX_WIDTH);
        chatCanvas.height = (24 * 15 + 8) * scaleFactor;

        ctx.scale(scaleFactor, scaleFactor);
        ctx.font = "14px Ubuntu";
        ctx.textBaseline = "top";
        ctx.globalAlpha = 1; // tidak pakai fade

        var startY = 8;
        var y = startY;

        var lineHeight = 18;
        var paddingX = 8;
        var chatWidth = chatCanvas.width / scaleFactor;
        var maxY = chatCanvas.height / scaleFactor - 8;

        function getChatTextColor(msg) {
            if (msg && msg.isSystem) return showDarkTheme ? "#ffb3b3" : "#aa2222";
            if (msg && msg.isDead) return "#9a9a9a";
            if (msg && msg.isGuild) return "#ff9800";
            return showDarkTheme ? "#ffffff" : "#222222";
        }

        function getChatNameColor(msg) {
            if (msg && msg.isSystem) return "#ff6666";
            if (msg && msg.isDead) return "#9a9a9a";
            return msg && msg.color ? msg.color : "#ff3333";
        }

        function wrapText(ctx, text, maxWidth) {
            var lines = [];
            var line = "";

            text = String(text || "");

            for (var i = 0; i < text.length; i++) {
                var testLine = line + text[i];

                if (ctx.measureText(testLine).width > maxWidth && line.length > 0) {
                    lines.push(line);
                    line = text[i];
                } else {
                    line = testLine;
                }
            }

            if (line.length > 0) {
                lines.push(line);
            }

            return lines;
        }

        function drawRedBullCharge(ctx, msg, x, y) {
            if (!msg || msg.premiumEffect !== "bull") return;

            var age = Math.max(0, Date.now() - (msg.time || Date.now()));
            var cycle = age % 900;
            var progress = cycle / 900;
            var dash = Math.sin(progress * Math.PI);
            var bx = x + dash * 8;
            var by = y + 9;

            ctx.save();
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.globalAlpha = 0.25 + dash * 0.35;
            ctx.strokeStyle = "#ff3b3b";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(bx - 16, by + 4);
            ctx.lineTo(bx - 7, by + 4);
            ctx.moveTo(bx - 13, by);
            ctx.lineTo(bx - 5, by);
            ctx.stroke();

            ctx.globalAlpha = 1;
            ctx.shadowColor = "#ff1f1f";
            ctx.shadowBlur = 7;
            ctx.fillStyle = "#d40000";
            ctx.beginPath();
            ctx.moveTo(bx + 1, by - 7);
            ctx.lineTo(bx + 12, by);
            ctx.lineTo(bx + 1, by + 7);
            ctx.closePath();
            ctx.fill();

            ctx.shadowBlur = 0;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.moveTo(bx + 2, by - 6);
            ctx.lineTo(bx - 5, by - 10);
            ctx.lineTo(bx - 2, by - 3);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(bx + 2, by + 6);
            ctx.lineTo(bx - 5, by + 10);
            ctx.lineTo(bx - 2, by + 3);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        function drawLoveBurst(ctx, msg, x, y) {
            if (!msg || msg.premiumEffect !== "love") return;

            var age = Math.max(0, Date.now() - (msg.time || Date.now()));
            var pulse = (Math.sin(age / 180) + 1) / 2;
            var by = y + 9;
            var hearts = [
                { dx: -4, dy: -2, s: 1 },
                { dx: 8, dy: -7, s: 0.75 },
                { dx: 17, dy: 1, s: 0.65 }
            ];

            ctx.save();
            ctx.fillStyle = "#ff4fa3";
            ctx.shadowColor = "#ff4fa3";
            ctx.shadowBlur = 6 + pulse * 5;
            hearts.forEach(function(heart, index) {
                var floatY = Math.sin(age / 240 + index) * 3;
                var hx = x + heart.dx;
                var hy = by + heart.dy + floatY;
                var size = (5 + pulse * 2) * heart.s;

                ctx.beginPath();
                ctx.moveTo(hx, hy + size * 0.5);
                ctx.bezierCurveTo(hx - size, hy - size * 0.25, hx - size, hy - size, hx, hy - size * 0.45);
                ctx.bezierCurveTo(hx + size, hy - size, hx + size, hy - size * 0.25, hx, hy + size * 0.5);
                ctx.fill();
            });
            ctx.restore();
        }

        function drawLightningNameEffect(ctx, msg, x, y) {
            if (!msg || msg.premiumEffect !== "lightning") return;

            var age = Math.max(0, Date.now() - (msg.time || Date.now()));
            var flash = (Math.sin(age / 90) + 1) / 2;

            ctx.save();
            ctx.fillStyle = flash > .45 ? "#fff36a" : "#38c9ff";
            ctx.shadowColor = "#38c9ff";
            ctx.shadowBlur = 6 + flash * 8;
            ctx.font = "bold 18px Ubuntu";
            ctx.fillText("⚡", x + 2, y - 1);
            ctx.restore();
        }

        function drawFireNameEffect(ctx, msg, x, y) {
            if (!msg || msg.premiumEffect !== "fire") return;

            var age = Math.max(0, Date.now() - (msg.time || Date.now()));
            var rise = Math.sin(age / 160);

            ctx.save();
            ctx.fillStyle = "#ff6b1a";
            ctx.shadowColor = "#ff2200";
            ctx.shadowBlur = 7;
            ctx.font = "16px Ubuntu";
            ctx.fillText("🔥", x + 1, y - 1 + rise * 2);
            ctx.restore();
        }

        function drawStarNameEffect(ctx, msg, x, y) {
            if (!msg || msg.premiumEffect !== "star") return;

            var age = Math.max(0, Date.now() - (msg.time || Date.now()));
            var spin = (age / 8) % 360;

            ctx.save();
            ctx.translate(x + 9, y + 8);
            ctx.rotate(spin * Math.PI / 180);
            ctx.fillStyle = "#ffe66b";
            ctx.shadowColor = "#fff2a8";
            ctx.shadowBlur = 8;
            ctx.font = "16px Ubuntu";
            ctx.fillText("⭐", -8, -8);
            ctx.restore();
        }

        function drawCrownNameEffect(ctx, msg, x, y) {
            if (!msg || msg.premiumEffect !== "crown") return;

            var age = Math.max(0, Date.now() - (msg.time || Date.now()));
            var bob = Math.sin(age / 180) * 2;

            ctx.save();
            ctx.fillStyle = "#ffd84d";
            ctx.shadowColor = "#ffbf00";
            ctx.shadowBlur = 9;
            ctx.font = "17px Ubuntu";
            ctx.fillText("👑", x, y - 3 + bob);
            ctx.restore();
        }

        function drawConfettiNameEffect(ctx, msg, x, y) {
            if (!msg || msg.premiumEffect !== "confetti") return;

            var age = Math.max(0, Date.now() - (msg.time || Date.now()));
            var colors = ["#ff4fa3", "#ffce3a", "#28d7ff", "#7cff65", "#ff7043"];

            ctx.save();
            for (var k = 0; k < 6; k++) {
                var px = x + 2 + (k % 3) * 7;
                var py = y + 1 + ((age / 120 + k * 5) % 16);
                ctx.fillStyle = colors[k % colors.length];
                ctx.save();
                ctx.translate(px, py);
                ctx.rotate((age / 140 + k) % 6.28);
                ctx.fillRect(-2, -3, 4, 6);
                ctx.restore();
            }
            ctx.restore();
        }

        function drawWaterfallNameEffect(ctx, msg, x, y) {
            if (!msg || msg.premiumEffect !== "waterfall") return;

            var age = Math.max(0, Date.now() - (msg.time || Date.now()));

            ctx.save();
            ctx.fillStyle = "#57d7ff";
            ctx.shadowColor = "#00a8ff";
            ctx.shadowBlur = 8;
            ctx.font = "16px Ubuntu";
            ctx.fillText("💧", x + 1, y + 1 + Math.sin(age / 150) * 2);
            ctx.restore();
        }

        function drawNicknameAura(ctx, msg, x, y, width, height) {
            if (!msg || !msg.premiumEffect) return;

            var age = Math.max(0, Date.now() - (msg.time || Date.now()));
            var pulse = (Math.sin(age / 160) + 1) / 2;
            var centerX = x + width / 2;
            var baseY = y + height - 3;
            var topY = y - 5;
            var rightX = x + width + 4;

            ctx.save();

            if (msg.premiumEffect === "bull") {
                var charge = (age % 900) / 900;
                var streakX = x + charge * Math.max(18, width);
                ctx.strokeStyle = "#ff1f1f";
                ctx.lineWidth = 2;
                ctx.shadowColor = "#ff1f1f";
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.moveTo(x - 2, baseY);
                ctx.lineTo(rightX, baseY);
                ctx.stroke();

                ctx.fillStyle = "#d40000";
                ctx.beginPath();
                ctx.moveTo(streakX - 5, y + 1);
                ctx.lineTo(streakX + 8, y + height / 2);
                ctx.lineTo(streakX - 5, y + height - 1);
                ctx.closePath();
                ctx.fill();

                ctx.fillStyle = "#ffffff";
                ctx.beginPath();
                ctx.moveTo(streakX - 3, y + 2);
                ctx.lineTo(streakX - 10, y - 3);
                ctx.lineTo(streakX - 6, y + 5);
                ctx.closePath();
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(streakX - 3, y + height - 2);
                ctx.lineTo(streakX - 10, y + height + 3);
                ctx.lineTo(streakX - 6, y + height - 5);
                ctx.closePath();
                ctx.fill();
            } else if (msg.premiumEffect === "love") {
                ctx.fillStyle = "#ff4fa3";
                ctx.shadowColor = "#ff4fa3";
                ctx.shadowBlur = 7 + pulse * 6;
                for (var i = 0; i < 6; i++) {
                    var t = age / 260 + i;
                    var hx = centerX + Math.cos(t) * (width / 2 + 7);
                    var hy = y + height / 2 + Math.sin(t * 1.3) * (height / 2 + 4);
                    var size = 3.5 + pulse * 1.8;
                    ctx.beginPath();
                    ctx.moveTo(hx, hy + size * 0.55);
                    ctx.bezierCurveTo(hx - size, hy - size * 0.2, hx - size, hy - size, hx, hy - size * 0.42);
                    ctx.bezierCurveTo(hx + size, hy - size, hx + size, hy - size * 0.2, hx, hy + size * 0.55);
                    ctx.fill();
                }
            } else if (msg.premiumEffect === "lightning") {
                ctx.strokeStyle = pulse > .45 ? "#fff36a" : "#38c9ff";
                ctx.lineWidth = 2;
                ctx.shadowColor = "#38c9ff";
                ctx.shadowBlur = 9 + pulse * 7;
                ctx.beginPath();
                ctx.moveTo(x - 2, topY + 3);
                ctx.lineTo(x + width * .32, y + height + 2);
                ctx.lineTo(x + width * .58, topY);
                ctx.lineTo(rightX, y + height);
                ctx.stroke();
            } else if (msg.premiumEffect === "fire") {
                ctx.shadowColor = "#ff2200";
                ctx.shadowBlur = 9;
                for (i = 0; i < Math.max(5, Math.min(10, Math.floor(width / 10))); i++) {
                    var fx = x + (i / Math.max(1, Math.floor(width / 10) - 1)) * width;
                    var flame = 6 + Math.sin(age / 120 + i) * 3;
                    var grad = ctx.createLinearGradient(fx, baseY, fx, baseY - flame);
                    grad.addColorStop(0, "#ff2a00");
                    grad.addColorStop(0.55, "#ff9a1f");
                    grad.addColorStop(1, "rgba(255, 236, 97, 0)");
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.moveTo(fx - 4, baseY);
                    ctx.quadraticCurveTo(fx, baseY - flame - 3, fx + 4, baseY);
                    ctx.closePath();
                    ctx.fill();
                }
            } else if (msg.premiumEffect === "star") {
                ctx.fillStyle = "#ffe66b";
                ctx.shadowColor = "#fff2a8";
                ctx.shadowBlur = 8;
                for (i = 0; i < 7; i++) {
                    t = age / 300 + i * 1.7;
                    var sx = centerX + Math.cos(t) * (width / 2 + 6);
                    var sy = y + height / 2 + Math.sin(t) * (height / 2 + 4);
                    ctx.save();
                    ctx.translate(sx, sy);
                    ctx.rotate(t);
                    ctx.fillText("✦", -4, -6);
                    ctx.restore();
                }
            } else if (msg.premiumEffect === "crown") {
                ctx.fillStyle = "#ffd84d";
                ctx.shadowColor = "#ffbf00";
                ctx.shadowBlur = 10;
                ctx.font = "14px Ubuntu";
                ctx.fillText("👑", centerX - 7, topY - 8 + Math.sin(age / 180) * 2);
                ctx.strokeStyle = "rgba(255, 216, 77, .75)";
                ctx.lineWidth = 1.5;
                ctx.strokeRect(x - 3, y - 2, width + 6, height + 3);
            } else if (msg.premiumEffect === "confetti") {
                var colors = ["#ff4fa3", "#ffce3a", "#28d7ff", "#7cff65", "#ff7043"];
                for (i = 0; i < 10; i++) {
                    t = age / 130 + i;
                    var cx = x + ((i * 17 + age / 12) % Math.max(24, width));
                    var cy = y - 6 + ((age / 95 + i * 6) % (height + 12));
                    ctx.fillStyle = colors[i % colors.length];
                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.rotate(t);
                    ctx.fillRect(-1.5, -3, 3, 6);
                    ctx.restore();
                }
            } else if (msg.premiumEffect === "waterfall") {
                var wave = ctx.createLinearGradient(x, topY, x, baseY + 8);
                wave.addColorStop(0, "rgba(132, 231, 255, 0)");
                wave.addColorStop(0.35, "rgba(58, 190, 255, .75)");
                wave.addColorStop(1, "rgba(0, 115, 255, .15)");
                ctx.fillStyle = wave;
                ctx.shadowColor = "#00a8ff";
                ctx.shadowBlur = 7 + pulse * 5;
                for (i = 0; i < Math.max(6, Math.min(14, Math.floor(width / 8))); i++) {
                    var dropX = x + (i / Math.max(1, Math.floor(width / 8))) * width;
                    var dropY = topY + ((age / 45 + i * 9) % (height + 18));
                    ctx.beginPath();
                    ctx.ellipse(dropX, dropY, 2.4, 6 + Math.sin(age / 120 + i) * 2, 0, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.strokeStyle = "rgba(102, 220, 255, .85)";
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(x - 3, baseY);
                for (i = 0; i <= Math.max(2, width / 8); i++) {
                    var wx = x + i * 8;
                    var wy = baseY + Math.sin(age / 95 + i) * 2;
                    ctx.lineTo(wx, wy);
                }
                ctx.stroke();
            }

            ctx.restore();
        }

        function getNameEffectSpace(msg) {
            return 0;
        }

        for (var i = 0; i < visibleCount; i++) {
            var msg = chatBoard[chatBoard.length - visibleCount + i];

            var nameText = msg.name + ": ";
            var effectSpace = getNameEffectSpace(msg);
            var nameX = paddingX + effectSpace;
            var nameWidth = ctx.measureText(nameText).width;
            var msgX = nameX + nameWidth;

            var firstLineWidth = chatWidth - msgX - paddingX;
            var nextLineWidth = chatWidth - paddingX * 2;

            var temp = wrapText(ctx, msg.message || "", firstLineWidth);
            var lines = [];

            if (temp.length > 0) {
                lines.push(temp[0]);

                var restText = temp.slice(1).join("");
                if (restText.length > 0) {
                    lines = lines.concat(wrapText(ctx, restText, nextLineWidth));
                }
            } else {
                lines.push("");
            }

            if (y + lineHeight > maxY) break;

            // nama player
            drawNicknameAura(ctx, msg, nameX, y, nameWidth, lineHeight);
            ctx.fillStyle = getChatNameColor(msg);
            if (msg.premiumEffect) {
                ctx.save();
                ctx.shadowColor = msg.premiumEffect === "love" ? "#ff4fa3" : msg.premiumEffect === "lightning" ? "#38c9ff" : msg.premiumEffect === "fire" ? "#ff6b1a" : msg.premiumEffect === "star" ? "#ffe66b" : msg.premiumEffect === "crown" ? "#ffd84d" : msg.premiumEffect === "confetti" ? "#28d7ff" : msg.premiumEffect === "waterfall" ? "#00a8ff" : "#ff1f1f";
                ctx.shadowBlur = 8;
            }
            ctx.fillText(nameText, nameX, y);
            if (msg.premiumEffect) {
                ctx.restore();
            }

            // pesan baris pertama
            ctx.fillStyle = getChatTextColor(msg);
            if (msg.premiumEffect) {
                ctx.save();
                ctx.shadowColor = msg.premiumEffect === "love" ? "#ff4fa3" : msg.premiumEffect === "lightning" ? "#38c9ff" : msg.premiumEffect === "fire" ? "#ff6b1a" : msg.premiumEffect === "star" ? "#ffe66b" : msg.premiumEffect === "crown" ? "#ffd84d" : msg.premiumEffect === "confetti" ? "#28d7ff" : msg.premiumEffect === "waterfall" ? "#00a8ff" : "#ff1f1f";
                ctx.shadowBlur = 6;
            }
            ctx.fillText(lines[0], msgX, y);
            if (msg.premiumEffect) {
                ctx.restore();
            }

            y += lineHeight;

            // pesan lanjutan turun ke bawah
            for (var j = 1; j < lines.length; j++) {
                if (y + lineHeight > maxY) break;

                ctx.fillStyle = getChatTextColor(msg);
                if (msg.premiumEffect) {
                    ctx.save();
                    ctx.shadowColor = msg.premiumEffect === "love" ? "#ff4fa3" : msg.premiumEffect === "lightning" ? "#38c9ff" : msg.premiumEffect === "fire" ? "#ff6b1a" : msg.premiumEffect === "star" ? "#ffe66b" : msg.premiumEffect === "crown" ? "#ffd84d" : msg.premiumEffect === "confetti" ? "#28d7ff" : msg.premiumEffect === "waterfall" ? "#00a8ff" : "#ff1f1f";
                    ctx.shadowBlur = 6;
                }
                ctx.fillText(lines[j], paddingX, y);
                if (msg.premiumEffect) {
                    ctx.restore();
                }

                y += lineHeight;
            }
        }

        ctx.globalAlpha = 1;
    }


    function updateNodes(view, offset) {
        timestamp = +new Date;
        var code = Math.random();
        ua = false;
        var queueLength = view.getUint16(offset, true);
        offset += 2;
        for (i = 0; i < queueLength; ++i) {
            var killer = nodes[view.getUint32(offset, true)],
                killedNode = nodes[view.getUint32(offset + 4, true)];
            offset += 8;
            if (killer && killedNode) {
                killedNode.destroy();
                killedNode.ox = killedNode.x;
                killedNode.oy = killedNode.y;
                killedNode.oSize = killedNode.size;
                killedNode.nx = killer.x;
                killedNode.ny = killer.y;
                killedNode.nSize = killedNode.size;
                killedNode.updateTime = timestamp;
            }
        }
        for (var i = 0; ;) {
            var nodeid = view.getUint32(offset, true);
            offset += 4;
            if (0 == nodeid) break;
            ++i;
            var size, posY, posX = view.getInt16(offset, true);
            offset += 2;
            posY = view.getInt16(offset, true);
            offset += 2;
            size = view.getInt16(offset, true);
            offset += 2;
            for (var r = view.getUint8(offset++), g = view.getUint8(offset++), b = view.getUint8(offset++),
                     color = (r << 16 | g << 8 | b).toString(16); 6 > color.length;) color = "0" + color;
            var colorstr = "#" + color,
                flags = view.getUint8(offset++),
                flagVirus = !!(flags & 1),
                flagAgitated = !!(flags & 16);
            flags & 2 && (offset += 4);
            flags & 4 && (offset += 8);
            flags & 8 && (offset += 16);
            for (var char, name = ""; ;) {
                char = view.getUint16(offset, true);
                offset += 2;
                if (0 == char) break;
                name += String.fromCharCode(char)
            }
            var parsedName = parseCellName(name);
            name = parsedName.name;
            var node = null;
            if (nodes.hasOwnProperty(nodeid)) {
                node = nodes[nodeid];
                node.updatePos();
                node.ox = node.x;
                node.oy = node.y;
                node.oSize = node.size;
                node.color = colorstr;
            } else {
                node = new Cell(nodeid, posX, posY, size, colorstr, name);
                nodelist.push(node);
                nodes[nodeid] = node;
                node.ka = posX;
                node.la = posY;
            }
            node.skinName = parsedName.skinName;
            node.isVirus = flagVirus;
            node.isAgitated = flagAgitated;
            node.nx = posX;
            node.ny = posY;
            node.nSize = size;
            node.updateCode = code;
            node.updateTime = timestamp;
            node.flag = flags;
            name && node.setName(name);
            if (-1 != nodesOnScreen.indexOf(nodeid) && -1 == playerCells.indexOf(node)) {
                document.getElementById("overlays").style.display = "none";
                playerCells.push(node);
                if (1 == playerCells.length) {
                    nodeX = node.x;
                    nodeY = node.y;
                }
            }
        }
        queueLength = view.getUint32(offset, true);
        offset += 4;
        for (i = 0; i < queueLength; i++) {
            var nodeId = view.getUint32(offset, true);
            offset += 4;
            node = nodes[nodeId];
            null != node && node.destroy();
        }
        ua && 0 == playerCells.length && !isTournamentLikeMode() && showOverlays(false)
    }

    function sendMouseMove() {
        var msg;
        if (wsIsOpen()) {
            msg = rawMouseX - canvasWidth / 2;
            var b = rawMouseY - canvasHeight / 2;
            if (64 <= msg * msg + b * b && !(.01 > Math.abs(oldX - X) && .01 > Math.abs(oldY - Y))) {
                oldX = X;
                oldY = Y;
                msg = prepareData(21);
                msg.setUint8(0, 16);
                msg.setFloat64(1, X, true);
                msg.setFloat64(9, Y, true);
                msg.setUint32(17, 0, true);
                wsSend(msg);
            }
        }
    }

    function sendNickName() {
        if (wsIsOpen() && null != userNickName) {
            var authToken = null != wHandle.localStorage ? wHandle.localStorage.authToken : null;
            var nickPayload = authToken ? userNickName + "|" + authToken : userNickName;
            var msg = prepareData(1 + 2 * nickPayload.length);
            msg.setUint8(0, 0);
            for (var i = 0; i < nickPayload.length; ++i) msg.setUint16(1 + 2 * i, nickPayload.charCodeAt(i), true);
            wsSend(msg)
        }
    }

    function sendGameMode() {
        if (wsIsOpen()) {
            var msg = prepareData(1 + 2 * gameMode.length);
            msg.setUint8(0, 10);
            for (var i = 0; i < gameMode.length; ++i) msg.setUint16(1 + 2 * i, gameMode.charCodeAt(i), true);
            wsSend(msg)
        }
    }

    function isCommandMessage(str) {
        var match = /^\/([a-z]+)(\s|$)/i.exec(String(str || "").trim());
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
            point: true,
            points: true,
            addpoints: true,
            status: true,
            name: true,
            split: true
        }[match[1].toLowerCase()] === true;
    }

    function sendChat(str) {
        str = String(str || "").trim();

        if (/^\/g\s*$/i.test(str)) {
            return;
        }

        if (wsIsOpen() && (str.length < 200) && (str.length > 0)) {
            var authToken = null != wHandle.localStorage ? wHandle.localStorage.authToken : null;
            if (!authToken) {
                return;
            }

            var isAdminCommand = isCommandMessage(str);
            var canSendPremiumChat = typeof wHandle.canSendPremiumChat === 'function' ? wHandle.canSendPremiumChat() : false;
            if (!isAdminCommand && !canSendPremiumChat) {
                if (typeof wHandle.showPremiumChatWarning === 'function') {
                    wHandle.showPremiumChatWarning();
                }
                return;
            }

            var msg = prepareData(2 + 2 * str.length + 2 + (authToken ? 2 * authToken.length + 2 : 0));
            var offset = 0;
            msg.setUint8(offset++, 99);
            msg.setUint8(offset++, authToken ? 16 : 0);
            for (var i = 0; i < str.length; ++i) {
                msg.setUint16(offset, str.charCodeAt(i), true);
                offset += 2;
            }
            msg.setUint16(offset, 0, true);
            offset += 2;

            if (authToken) {
                for (i = 0; i < authToken.length; ++i) {
                    msg.setUint16(offset, authToken.charCodeAt(i), true);
                    offset += 2;
                }
                msg.setUint16(offset, 0, true);
            }

            wsSend(msg);
            //console.log(msg);
        }
    }

    function wsIsOpen() {
        return null != ws && ws.readyState == ws.OPEN
    }

    function wsIsConnecting() {
        return null != ws && ws.readyState === 0
    }

    function sendUint8(a) {
        if (wsIsOpen()) {
            var msg = prepareData(1);
            msg.setUint8(0, a);
            wsSend(msg)
        }
    }

    function redrawGameScene() {
        drawGameScene();
        wHandle.requestAnimationFrame(redrawGameScene)
    }

    function canvasResize() {
        window.scrollTo(0,0);
        canvasWidth = wHandle.innerWidth;
        canvasHeight = wHandle.innerHeight;
        nCanvas.width = canvasWidth;
        nCanvas.height = canvasHeight;
        drawGameScene()
    }

    function viewRange() {
        var ratio;
        ratio = Math.max(canvasHeight / 1080, canvasWidth / 1920);
        return ratio * zoom;
    }

    function calcViewZoom() {
        if (0 != playerCells.length) {
            for (var newViewZoom = 0, i = 0; i < playerCells.length; i++) newViewZoom += playerCells[i].size;
            newViewZoom = Math.pow(Math.min(64 / newViewZoom, 1), .4) * viewRange();
            viewZoom = (9 * viewZoom + newViewZoom) / 10
        }
    }

    function resetMatchStats() {
        hasSpawnedOnce = false;
        wasAliveLastFrame = false;
        matchResultVisible = false;

        matchStats = {
            startTime: 0,
            endTime: 0,
            highestMass: 0,
            leaderboardTimeMs: 0,
            topOneTimeMs: 0,
            topPosition: 0,
            foodEaten: 0,
            cellsEaten: 0,
            massHistory: [],
            lastMassSample: 0,
            lastLeaderboardCheck: Date.now(),
            lastTopOnePopupMinute: 0
        };

        hideTopTimePopup();
        hideMatchResult();
    }

    function formatTopTime(ms) {
        var totalMinutes = Math.max(0, Math.floor(ms / 60000));
        var hours = Math.floor(totalMinutes / 60);
        var minutes = totalMinutes % 60;

        return (hours < 10 ? "0" : "") + hours + ":" + (minutes < 10 ? "0" : "") + minutes;
    }

    function ensureTopTimePopup() {
        var popup = document.getElementById("topTimePopup");
        if (popup) return popup;

        popup = document.createElement("div");
        popup.id = "topTimePopup";
        popup.style.position = "fixed";
        popup.style.top = "90px";
        popup.style.left = "50%";
        popup.style.transform = "translateX(-50%)";
        popup.style.color = "#2f8f3a";
        popup.style.fontSize = "30px";
        popup.style.fontWeight = "800";
        popup.style.fontFamily = "Arial, sans-serif";
        popup.style.textShadow = "2px 2px 0 #102d14, 0 0 8px rgba(0, 255, 60, 0.35)";
        popup.style.zIndex = "9999";
        popup.style.opacity = "0";
        popup.style.pointerEvents = "none";
        popup.style.userSelect = "none";
        popup.style.background = "none";
        popup.style.border = "none";
        popup.style.boxShadow = "none";
        popup.style.transition = "opacity 0.25s ease";
        document.body.appendChild(popup);
        return popup;
    }

    function showTopTimePopup(ms) {
        var popup = ensureTopTimePopup();
        popup.textContent = "Top Time++ " + formatTopTime(ms);
        popup.style.opacity = "1";

        if (showTopTimePopup.timer) {
            clearTimeout(showTopTimePopup.timer);
        }

        showTopTimePopup.timer = setTimeout(function () {
            popup.style.opacity = "0";
        }, 2000);
    }

    function hideTopTimePopup() {
        var popup = document.getElementById("topTimePopup");
        if (showTopTimePopup.timer) {
            clearTimeout(showTopTimePopup.timer);
            showTopTimePopup.timer = null;
        }
        if (popup) {
            popup.style.opacity = "0";
        }
    }

    function isPlayerTopOne() {
        if (!leaderBoard || !leaderBoard.length || !playerCells || !playerCells.length) {
            return false;
        }

        var leader = leaderBoard[0];
        var leaderId = leader && leader.id;

        if (leaderId) {
            for (var i = 0; i < playerCells.length; i++) {
                if (playerCells[i] && playerCells[i].id === leaderId) {
                    return true;
                }
            }
        }

        var myName = playerCells[0] && playerCells[0].name ? playerCells[0].name : "";
        return !!myName && (leader.name || "") === myName;
    }

    function updateMatchStats() {
        var now = Date.now();
        var isAlive = playerCells && playerCells.length > 0;

        if (isAlive && !hasSpawnedOnce) {
            hasSpawnedOnce = true;
            matchStats.startTime = now;
            matchStats.lastLeaderboardCheck = now;
        }

        if (isAlive) {
            var currentMass = ~~(calcUserScore() / 100);

            if (currentMass > matchStats.highestMass) {
                matchStats.highestMass = currentMass;
            }

            if (!matchStats.lastMassSample || now - matchStats.lastMassSample >= 1000) {
                matchStats.massHistory.push({
                    t: now,
                    mass: currentMass
                });

                if (matchStats.massHistory.length > 300) {
                    matchStats.massHistory.shift();
                }

                matchStats.lastMassSample = now;
            }

            if (leaderBoard && leaderBoard.length > 0) {
                var myName = playerCells[0] && playerCells[0].name ? playerCells[0].name : "";
                var myRank = -1;

                for (var i = 0; i < leaderBoard.length; i++) {
                    if ((leaderBoard[i].name || "") === myName) {
                        myRank = i + 1;
                        break;
                    }
                }

                var delta = now - (matchStats.lastLeaderboardCheck || now);

                if (myRank === 1) {
                    matchStats.leaderboardTimeMs += delta;
                }

                if (myRank > 0) {
                    if (matchStats.topPosition === 0 || myRank < matchStats.topPosition) {
                        matchStats.topPosition = myRank;
                    }
                }
            }

            matchStats.lastLeaderboardCheck = now;
        }

        if (wasAliveLastFrame && !isAlive && hasSpawnedOnce && !matchResultVisible && !isTournamentLikeMode()) {
            matchStats.endTime = now;
            hideTopTimePopup();
            showMatchResult();
        }

        wasAliveLastFrame = isAlive;
    }

    function getGameUIFont() {
        var selectors = [
            "#helloDialog",
            ".helloDialog",
            ".hello-dialog",
            "#overlays",
            "body"
        ];

        for (var i = 0; i < selectors.length; i++) {
            var el = document.querySelector(selectors[i]);

            if (el) {
                var font = window.getComputedStyle(el).fontFamily;

                if (font && font !== "initial" && font !== "inherit") {
                    return font;
                }
            }
        }

        return "Ubuntu, Arial, sans-serif";
    }

    function isTournamentLikeMode() {
        var mode = String(wHandle.currentGameMode || gameMode || '');
        return mode === ':tournament' || mode.indexOf(':battle') === 0;
    }

    function getMatchResultFooterHTML() {
        var source = document.querySelector("#dialogFooter center") || document.querySelector("#dialogFooter");
        var html = source ? source.innerHTML : ''
            + '<a href="#home" class="mode-footer-link" style="color:#337ab7; font-weight:500;">Home</a>'
            + ' | '
            + '<a href="#login" class="mode-footer-link" style="color:#337ab7; font-weight:500;">Login</a>'
            + ' | '
            + '<a href="#community" class="mode-footer-link" style="color:#337ab7; font-weight:500;">Community</a>'
            + ' | '
            + '<a href="https://discord.gg/EDbdRsnKWU" class="mode-footer-link" style="color:#337ab7; font-weight:500;">About</a>';

        return html.replace(/\s+id="[^"]*"/g, "");
    }

    function showMatchResult() {
        matchResultVisible = true;

        var aliveMs = Math.max(0, matchStats.endTime - matchStats.startTime);

        var modal = document.getElementById("matchResultModal");
        if (!modal) {
            modal = document.createElement("div");
            modal.id = "matchResultModal";
            document.body.appendChild(modal);
        }

        modal.style.position = "fixed";
        modal.style.left = "50%";
        modal.style.top = "50%";
        modal.style.transform = "translate(-50%, -50%)";
        modal.style.width = "400px";
        modal.style.maxWidth = "92vw";
        modal.style.height = "540px";
        modal.style.maxHeight = "92vh";
        modal.style.background = "#f7f7f7";
        modal.style.borderRadius = "16px";
        modal.style.boxShadow = "0 12px 40px rgba(0,0,0,0.35)";
        modal.style.zIndex = "99999";
        modal.style.fontFamily = getGameUIFont();
        modal.style.overflow = "hidden";
        modal.style.display = "flex";
        modal.style.flexDirection = "column";

        modal.innerHTML =
            '<div style="padding:18px 18px 10px 18px; flex:1; display:flex; flex-direction:column;">' +

                '<div style="text-align:center; font-size:26px; font-weight:700; color:#333; margin-bottom:16px;">Match Results</div>' +

                '<div style="position:relative; height:300px; margin-bottom:14px;">' +

                    '<canvas id="matchResultChart" width="260" height="220" style="' +
                        'position:absolute;' +
                        'left:50%;' +
                        'top:45%;' +
                        'transform:translate(-50%, -50%);' +
                        'width:260px;' +
                        'height:220px;' +
                        'z-index:1;' +
                        'opacity:0.75;' +
                        'pointer-events:none;' +
                    '"></canvas>' +

                    '<div style="' +
                        'position:relative;' +
                        'z-index:2;' +
                        'display:grid;' +
                        'grid-template-columns:1fr 1fr;' +
                        'row-gap:18px;' +
                        'column-gap:70px;' +
                        'text-align:center;' +
                        'padding:4px 28px 0 28px;' +
                    '">' +

                        '<div>' +
                            '<div style="font-size:18px; font-weight:700; color:#333;">' + (matchStats.foodEaten || 0) + '</div>' +
                            '<div style="font-size:12px; color:#666; margin-top:2px;">food eaten</div>' +
                        '</div>' +

                        '<div>' +
                            '<div style="font-size:18px; font-weight:700; color:#333;">' + (matchStats.highestMass || 0) + '</div>' +
                            '<div style="font-size:12px; color:#666; margin-top:2px;">highest mass</div>' +
                        '</div>' +

                        '<div>' +
                            '<div style="font-size:18px; font-weight:700; color:#333;">' + formatMatchTime(aliveMs) + '</div>' +
                            '<div style="font-size:12px; color:#666; margin-top:2px;">time alive</div>' +
                        '</div>' +

                        '<div>' +
                            '<div style="font-size:18px; font-weight:700; color:#333;">' + formatMatchTime(matchStats.leaderboardTimeMs || 0) + '</div>' +
                            '<div style="font-size:12px; color:#666; margin-top:2px;">leaderboard time</div>' +
                        '</div>' +

                        '<div>' +
                            '<div style="font-size:18px; font-weight:700; color:#333;">' + (matchStats.cellsEaten || 0) + '</div>' +
                            '<div style="font-size:12px; color:#666; margin-top:2px;">cells eaten</div>' +
                        '</div>' +

                        '<div>' +
                            '<div style="font-size:18px; font-weight:700; color:#333;">' + (matchStats.topPosition || "-") + '</div>' +
                            '<div style="font-size:12px; color:#666; margin-top:2px;">top position</div>' +
                        '</div>' +

                    '</div>' +

                '</div>' +

                '<button id="matchResultBackBtn" style="width:100%; height:40px; border:none; border-radius:6px; background:#347ee8; color:#fff; font-size:16px; font-weight:700; cursor:pointer;">Kembali</button>' +

            '</div>' +

            '<div style="position:relative; margin:0 15px 5px 15px; height:32px; line-height:32px; text-align:center; font-size:12px; background:#f7f7f7;">' +
                '<div style="position:absolute; left:0; right:0; top:-16px; border-top:1px solid #eee;"></div>' +
                '<center>' + getMatchResultFooterHTML() + '</center>' +
            '</div>';

        drawMatchResultChart();

        document.getElementById("matchResultBackBtn").onclick = function () {
            hideMatchResult();
            if (typeof showOverlays === "function") {
                showOverlays(true);
            }
        };
    }

    function hideMatchResult() {
        var modal = document.getElementById("matchResultModal");
        if (modal) {
            modal.remove();
        }
        matchResultVisible = false;
    }

    function formatMatchTime(ms) {
        ms = Math.max(0, ms || 0);
        var totalSec = Math.floor(ms / 1000);
        var min = Math.floor(totalSec / 60);
        var sec = totalSec % 60;
        return min + ":" + (sec < 10 ? "0" + sec : sec);
    }

    function drawMatchResultChart() {
        var canvas = document.getElementById("matchResultChart");
        if (!canvas) return;

        var ctx = canvas.getContext("2d");
        var w = canvas.width;
        var h = canvas.height;

        ctx.clearRect(0, 0, w, h);

        var data = matchStats.massHistory || [];
        if (data.length < 2) {
            ctx.fillStyle = "#d7c9ff";
            ctx.font = "14px " + getGameUIFont();
            ctx.textAlign = "center";
            ctx.fillText("No chart data", w / 2, h / 2);
            return;
        }

        var minMass = Infinity;
        var maxMass = 0;

        for (var i = 0; i < data.length; i++) {
            if (data[i].mass < minMass) minMass = data[i].mass;
            if (data[i].mass > maxMass) maxMass = data[i].mass;
        }

        if (!isFinite(minMass)) minMass = 0;
        if (maxMass <= minMass) maxMass = minMass + 1;

        var padX = 10;
        var padY = 8;
        var baseY = h - padY;

        ctx.beginPath();
        for (var j = 0; j < data.length; j++) {
            var x = padX + (j / (data.length - 1)) * (w - padX * 2);
            var y = baseY - ((data[j].mass - minMass) / (maxMass - minMass)) * (h - padY * 2);

            if (j === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }

        ctx.lineTo(w - padX, baseY);
        ctx.lineTo(padX, baseY);
        ctx.closePath();

        ctx.fillStyle = "rgba(186, 166, 255, 0.18)";
        ctx.fill();

        ctx.beginPath();
        for (var k = 0; k < data.length; k++) {
            var lx = padX + (k / (data.length - 1)) * (w - padX * 2);
            var ly = baseY - ((data[k].mass - minMass) / (maxMass - minMass)) * (h - padY * 2);

            if (k === 0) ctx.moveTo(lx, ly);
            else ctx.lineTo(lx, ly);
        }

        ctx.strokeStyle = "#c9b3ff";
        ctx.lineWidth = 3;
        ctx.stroke();
    }

    function drawGameScene() {
        var a, oldtime = Date.now();
        ++cb;
        timestamp = oldtime;
        if (0 < playerCells.length) {
            calcViewZoom();
            var c = a = 0;
            for (var d = 0; d < playerCells.length; d++) {
                playerCells[d].updatePos();
                a += playerCells[d].x / playerCells.length;
                c += playerCells[d].y / playerCells.length;
            }
            posX = a;
            posY = c;
            posSize = viewZoom;
            nodeX = (nodeX + a) / 2;
            nodeY = (nodeY + c) / 2
        } else {
            nodeX = (29 * nodeX + posX) / 30;
            nodeY = (29 * nodeY + posY) / 30;
            viewZoom = (9 * viewZoom + posSize * viewRange()) / 10;
        }
        buildQTree();
        mouseCoordinateChange();
        xa || ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        if (xa) {
            if (showDarkTheme) {
                ctx.fillStyle = '#111111';
                ctx.globalAlpha = .05;
                ctx.fillRect(0, 0, canvasWidth, canvasHeight);
                ctx.globalAlpha = 1;
            } else {
                ctx.fillStyle = '#F2FBFF';
                ctx.globalAlpha = .05;
                ctx.fillRect(0, 0, canvasWidth, canvasHeight);
                ctx.globalAlpha = 1;
            }
        } else {
            drawGrid();
        }
        nodelist.sort(function (a, b) {
            return a.size == b.size ? a.id - b.id : a.size - b.size
        });
        ctx.save();
        ctx.translate(canvasWidth / 2, canvasHeight / 2);
        ctx.scale(viewZoom, viewZoom);
        ctx.translate(-nodeX, -nodeY);
        ctx.save();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 1 / viewZoom;
        ctx.globalAlpha = .9;
        ctx.strokeRect(leftPos, topPos, rightPos - leftPos, bottomPos - topPos);
        ctx.restore();
        for (d = 0; d < Cells.length; d++) Cells[d].drawOneCell(ctx);

        for (d = 0; d < nodelist.length; d++) nodelist[d].drawOneCell(ctx);
        //console.log(Cells.length);
        if (drawLine) {
            drawLineX = (3 * drawLineX + lineX) /
                4;
            drawLineY = (3 * drawLineY + lineY) / 4;
            ctx.save();
            ctx.strokeStyle = "#FFAAAA";
            ctx.lineWidth = 10;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.globalAlpha = .5;
            ctx.beginPath();
            for (d = 0; d < playerCells.length; d++) {
                ctx.moveTo(playerCells[d].x, playerCells[d].y);
                ctx.lineTo(drawLineX, drawLineY);
            }
            ctx.stroke();
            ctx.restore()
        }
        ctx.restore();
        lbCanvas && lbCanvas.width && ctx.drawImage(lbCanvas, canvasWidth - lbCanvas.width - 10, 10); // draw Leader Board
        if (chatCanvas != null) {
            var chatInput = document.getElementById('chat_textbox');
            var chatInputTop = chatInput ? chatInput.getBoundingClientRect().top : canvasHeight - 40;
            ctx.drawImage(chatCanvas, 0, chatInputTop - chatCanvas.height - 8);
        }

        userScore = Math.max(userScore, calcUserScore());
        if (0 != userScore) {
            if (null == scoreText) {
                scoreText = new UText(24, '#FFFFFF');
            }
            scoreText.setValue('Score: ' + ~~(userScore / 100));
            c = scoreText.render();
            a = c.width;
            ctx.globalAlpha = .2;
            ctx.fillStyle = '#000000';
            ctx.fillRect(10, 10, a + 10, 34);//canvasHeight - 10 - 24 - 10
            ctx.globalAlpha = 1;
            ctx.drawImage(c, 15, 15);//canvasHeight - 10 - 24 - 5
        }
        drawSplitIcon(ctx);
        drawTouch(ctx);
        drawChatBoard();
        updateMatchStats();
        var deltatime = Date.now() - oldtime;
        deltatime > 1E3 / 60 ? z -= .01 : deltatime < 1E3 / 65 && (z += .01);
        .4 > z && (z = .4);
        1 < z && (z = 1)
    }


    function drawTouch(ctx)
    {
        ctx.save();
        if(touchable) {

            for(var i=0; i<touches.length; i++) {

                var touch = touches[i];

                if(touch.identifier == leftTouchID){
                    ctx.beginPath();
                    ctx.strokeStyle = "#0096ff";
                    ctx.lineWidth = 6;
                    ctx.arc(leftTouchStartPos.x, leftTouchStartPos.y, 40,0,Math.PI*2,true);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.strokeStyle = "#0096ff";
                    ctx.lineWidth = 2;
                    ctx.arc(leftTouchStartPos.x, leftTouchStartPos.y, 60,0,Math.PI*2,true);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.strokeStyle = "#0096ff";
                    ctx.arc(leftTouchPos.x, leftTouchPos.y, 40, 0,Math.PI*2, true);
                    ctx.stroke();

                } else {

                    ctx.beginPath();
                    //ctx.fillStyle = "#0096ff";
                    //ctx.fillText("touch id : "+touch.identifier+" x:"+touch.clientX+" y:"+touch.clientY, touch.clientX+30, touch.clientY-30);

                    ctx.beginPath();
                    ctx.strokeStyle = "#0096ff";
                    ctx.lineWidth = "6";
                    ctx.arc(touch.clientX, touch.clientY, 40, 0, Math.PI*2, true);
                    ctx.stroke();
                }
            }
        } else {

            //ctx.fillStyle	 = "white";
            //ctx.fillText("mouse : "+touchX+", "+touchY, touchX, touchY);
        }
        //c.fillText("hello", 0,0);
        ctx.restore();
    }
    function drawGrid() {
        ctx.fillStyle = showDarkTheme ? "#111111" : "#F2FBFF";
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        ctx.save();
        ctx.strokeStyle = showDarkTheme ? "#AAAAAA" : "#000000";
        ctx.globalAlpha = .2;
        ctx.scale(viewZoom, viewZoom);
        var a = canvasWidth / viewZoom,
            b = canvasHeight / viewZoom;
        for (var c = -.5 + (-nodeX + a / 2) % 50; c < a; c += 50) {
            ctx.beginPath();
            ctx.moveTo(c, 0);
            ctx.lineTo(c, b);
            ctx.stroke();
        }
        for (c = -.5 + (-nodeY + b / 2) % 50; c < b; c += 50) {
            ctx.beginPath();
            ctx.moveTo(0, c);
            ctx.lineTo(a, c);
            ctx.stroke();
        }
        ctx.restore()
    }

    function drawSplitIcon(ctx) {
        if (touchable && splitIcon.width) {
         var size = ~~ (canvasWidth / 7);
         ctx.drawImage(splitIcon, canvasWidth - size, canvasHeight - size, size, size);
        }

        if (touchable && splitIcon.width) {
            var size = ~~ (canvasWidth / 7);
            ctx.drawImage(ejectIcon, canvasWidth - size, canvasHeight - 2*size-10, size, size);
        }
        
    }

    function calcUserScore() {
        for (var score = 0, i = 0; i < playerCells.length; i++) score += playerCells[i].nSize * playerCells[i].nSize;
        return score
    }

    function drawLeaderBoard() {
        lbCanvas = null;
        if (null != teamScores || 0 != leaderBoard.length)
            if (null != teamScores || showName) {
                lbCanvas = document.createElement("canvas");
                var ctx = lbCanvas.getContext("2d"),
                    boardLength = 60;
                boardLength = null == teamScores ? boardLength + 24 * leaderBoard.length : boardLength + 180;
                var scaleFactor = Math.min(0.22*canvasHeight, Math.min(200, .3 * canvasWidth)) / 200;
                lbCanvas.width = 200 * scaleFactor;
                lbCanvas.height = boardLength * scaleFactor;

                ctx.scale(scaleFactor, scaleFactor);
                ctx.globalAlpha = .4;
                ctx.fillStyle = "#000000";
                ctx.fillRect(0, 0, 200, boardLength);

                ctx.globalAlpha = 1;
                ctx.fillStyle = "#FFFFFF";
                var c = "Leaderboard";
                ctx.font = "30px Ubuntu";
                ctx.fillText(c, 100 - ctx.measureText(c).width / 2, 40);
                var b;
                if (null == teamScores) {
                    for (ctx.font = "20px Ubuntu", b = 0; b < leaderBoard.length; ++b) {
                        c = leaderBoard[b].name || "An unnamed cell";
                        if (!showName) {
                            (c = "An unnamed cell");
                        }
                        if (-1 != nodesOnScreen.indexOf(leaderBoard[b].id)) {
                            playerCells[0].name && (c = playerCells[0].name);
                            ctx.fillStyle = "#FFAAAA";
                            if (!noRanking) {
                                c = b + 1 + ". " + c;
                            }
                            ctx.fillText(c, 100 - ctx.measureText(c).width / 2, 70 + 24 * b);
                        } else {
                            ctx.fillStyle = "#FFFFFF";
                            if (!noRanking) {
                                c = b + 1 + ". " + c;
                            }
                            ctx.fillText(c, 100 - ctx.measureText(c).width / 2, 70 + 24 * b);
                        }
                    }
                }
                else {
                    for (b = c = 0; b < teamScores.length; ++b) {
                        var d = c + teamScores[b] * Math.PI * 2;
                        ctx.fillStyle = teamColor[b + 1];
                        ctx.beginPath();
                        ctx.moveTo(100, 140);
                        ctx.arc(100, 140, 80, c, d, false);
                        ctx.fill();
                        c = d
                    }
                }
            }
    }

    function Cell(uid, ux, uy, usize, ucolor, uname) {
        this.id = uid;
        this.ox = this.x = ux;
        this.oy = this.y = uy;
        this.oSize = this.size = usize;
        this.color = ucolor;
        this.points = [];
        this.pointsAcc = [];
        this.createPoints();
        this.setName(uname)
    }

    function UText(usize, ucolor, ustroke, ustrokecolor) {
        usize && (this._size = usize);
        ucolor && (this._color = ucolor);
        this._stroke = !!ustroke;
        ustrokecolor && (this._strokeColor = ustrokecolor)
    }


    var localProtocol = wHandle.location.protocol,
        localProtocolHttps = "https:" == localProtocol;
    var nCanvas, ctx, mainCanvas, lbCanvas, chatCanvas, canvasWidth, canvasHeight, qTree = null,
        ws = null,
        nodeX = 0,
        nodeY = 0,
        nodesOnScreen = [],
        playerCells = [],
        nodes = {}, nodelist = [],
        Cells = [],
        leaderBoard = [],
        chatBoard = [],
        hasSpawnedOnce = false,
        wasAliveLastFrame = false,
        matchResultVisible = false,
        matchStats = {
            startTime: 0,
            endTime: 0,
            highestMass: 0,
            leaderboardTimeMs: 0,
            topOneTimeMs: 0,
            topPosition: 0,
            foodEaten: 0,
            cellsEaten: 0,
            massHistory: [],
            lastMassSample: 0,
            lastLeaderboardCheck: 0,
            lastTopOnePopupMinute: 0
        },
        rawMouseX = 0,
        rawMouseY = 0,
        X = -1,
        Y = -1,
        cb = 0,
        timestamp = 0,
        userNickName = null,
        leftPos = 0,
        topPos = 0,
        rightPos = 1E4,
        bottomPos = 1E4,
        viewZoom = 1,
        w = null,
        showSkin = true,
        showName = true,
        showColor = false,
        ua = false,
        userScore = 0,
        showDarkTheme = false,
        showMass = false,
        posX = nodeX = ~~((leftPos + rightPos) / 2),
        posY = nodeY = ~~((topPos + bottomPos) / 2),
        posSize = 1,
        gameMode = ":hardcore",
        pendingModeSwitch = false,
        teamScores = null,
        ma = false,
        hasOverlay = true,
        drawLine = false,
        lineX = 0,
        lineY = 0,
        drawLineX = 0,
        drawLineY = 0,
        Ra = 0,
        teamColor = ["#333333", "#FF3333", "#33FF33", "#3333FF"],
        xa = false,
        zoom = 1,
        isTouchStart = "ontouchstart" in wHandle && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
        splitIcon = new Image,
        ejectIcon = new Image,
        noRanking = false;
    splitIcon.src = "split.png";
    ejectIcon.src = "feed.png";
    var wCanvas = document.createElement("canvas");
    var playerStat = null;
    wHandle.currentGameMode = gameMode;
    wHandle.isSpectating = false;
    wHandle.hasActivePlayerCells = function () {
        return playerCells && playerCells.length > 0;
    };
    wHandle.resumeCurrentGame = function (desiredMode) {
        if (!wHandle.hasActivePlayerCells()) {
            return false;
        }

        if (desiredMode && desiredMode != gameMode) {
            return false;
        }

        wHandle.isSpectating = false;
        hideOverlays();
        return true;
    };
    wHandle.setNick = function (arg) {
        if (!pendingModeSwitch && wHandle.resumeCurrentGame()) {
            return;
        }

        hideOverlays();
        var authUser = null != wHandle.localStorage ? wHandle.localStorage.authUser : null;
        var guestNick = String(arg || '').trim();
        if (!authUser && !guestNick) {
            guestNick = knownNameDict_noDisp[Math.floor(Math.random() * knownNameDict_noDisp.length)];
        }
        userNickName = authUser || guestNick;
        sendNickName();
        pendingModeSwitch = false;
        resetMatchStats();
        userScore = 0
    };
    wHandle.setRegion = setRegion;
    wHandle.setSkins = function (arg) {
        showSkin = arg
    };
    wHandle.setNames = function (arg) {
        showName = arg
    };
    wHandle.setDarkTheme = function (arg) {
        showDarkTheme = arg
    };
    wHandle.setColors = function (arg) {
        showColor = arg
    };
    wHandle.setShowMass = function (arg) {
        showMass = arg
    };
    wHandle.spectate = function () {
        if (!pendingModeSwitch && wHandle.resumeCurrentGame()) {
            return;
        }

        userNickName = null;
        wHandle.isSpectating = true;
        if (wsIsOpen()) {
            sendGameMode();
            sendUint8(1);
        } else if (wsIsConnecting()) {
            wjQuery("#connecting").show();
        } else {
            wsConnect();
        }
        pendingModeSwitch = false;
        hideOverlays()
    };
    wHandle.setGameMode = function (arg, forceReset) {
        if (forceReset || arg != gameMode) {
            gameMode = arg;
            wHandle.currentGameMode = gameMode;
            pendingModeSwitch = true;
            sendGameMode();
            showConnecting();
        }
    };
    wHandle.setAcid = function (arg) {
        xa = arg
    };
    if (null != wHandle.localStorage) {
        if (null == wHandle.localStorage.AB8) {
            wHandle.localStorage.AB8 = ~~(100 * Math.random());
        }
        Ra = +wHandle.localStorage.AB8;
        wHandle.ABGroup = Ra;
    }
    /*wjQuery.get(localProtocol + "//gc.agar.io", function (a) {
     var b = a.split(" ");
     a = b[0];
     b = b[1] || "";
     -1 == "DE IL PL HU BR AT UA".split(" ").indexOf(a) && knownNameDict.push("nazi");
     -1 == ["UA"].indexOf(a) && knownNameDict.push("ussr");
     T.hasOwnProperty(a) && ("string" == typeof T[a] ? w || setRegion(T[a]) : T[a].hasOwnProperty(b) && (w || setRegion(T[a][b])))
     }, "text");*/
    setTimeout(function () {
    }, 3E5);
    var T = {
        ZW: "EU-London"
    };
    wHandle.connect = wsConnect;

    //This part is for loading custon skins
    var data = {"action": "test"};
    var response = [];
    var skinFileMap = {};

    function rememberSkinFiles(names, files) {
        if (!names || !names.length) return;

        if (files) {
            for (var key in files) {
                if (files.hasOwnProperty(key) && files[key]) {
                    skinFileMap[String(key).toLowerCase()] = files[key];
                }
            }
        }

        for (var i = 0; i < names.length; i++) {
            var key = String(names[i]).toLowerCase();
            if (!skinFileMap[key]) {
                skinFileMap[key] = names[i];
            }
        }
    }

    wjQuery.ajax({
        type: "POST",
        dataType: "json",
        url: "checkdir.php", //Relative or absolute path to response.php file
        data: data,
        success: function (data) {
            //alert(data["names"]);
            response = JSON.parse(data["names"]);
            rememberSkinFiles(response, data["files"] ? JSON.parse(data["files"]) : null);
        },
        error: function () {
            response = [];
        }
    });


    var interval1Id = setInterval(function () {
        //console.log("logging every 5 seconds");
        //console.log(Aa);

        wjQuery.ajax({
            type: "POST",
            dataType: "json",
            url: "checkdir.php", //Relative or absolute path to response.php file
            data: data,
        success: function (data) {
            //alert(data["names"]);
            response = JSON.parse(data["names"]);
            rememberSkinFiles(response, data["files"] ? JSON.parse(data["files"]) : null);
        },
            error: function () {
                response = [];
            }
        });
        //console.log(response);
        if (!response || !response.length) {
            return;
        }
        for (var i = 0; i < response.length; i++) {
            //console.log(response[insert]);
            var skinName = String(response[i]).toLowerCase();
            if (-1 == knownNameDict.indexOf(skinName)) {
                knownNameDict.push(skinName);
                //console.log("Add:"+response[i]);
            }
        }
    }, 15000);


    var delay = 500,
        reconnectTimer = null,
        oldX = -1,
        oldY = -1,
        Canvas = null,
        z = 1,
        scoreText = null,
        skins = {},
        knownNameDict = "poland;usa;china;russia;canada;australia;spain;brazil;germany;ukraine;france;sweden;hitler;north korea;south korea;japan;united kingdom;earth;greece;latvia;lithuania;estonia;finland;norway;cia;maldivas;austria;nigeria;reddit;yaranaika;confederate;9gag;indiana;4chan;italy;bulgaria;tumblr;2ch.hk;hong kong;portugal;jamaica;german empire;mexico;sanik;switzerland;croatia;chile;indonesia;bangladesh;thailand;iran;iraq;peru;moon;botswana;bosnia;netherlands;european union;taiwan;pakistan;hungary;satanist;qing dynasty;matriarchy;patriarchy;feminism;ireland;texas;facepunch;prodota;cambodia;steam;piccolo;india;kc;denmark;quebec;ayy lmao;sealand;bait;tsarist russia;origin;vinesauce;stalin;belgium;luxembourg;stussy;prussia;8ch;argentina;scotland;sir;romania;belarus;wojak;doge;nasa;byzantium;imperial japan;french kingdom;somalia;turkey;mars;pokerface;8;irs;receita federal;facebook".split(";"),
        knownNameDict_noDisp = ["merkel", "8", "nasa", "berlusconi", "blatter", "boris", "bush","cameron", "chavez", "clinton", "dilma", "fidel","hillary", "hitler", "hollande", "kim jong un","obama", "palin", "putin", "stalin", "trump", "tsipras"],
        ib = ["_canvas'blob"];
        Cell.prototype = {
        id: 0,
        points: null,
        pointsAcc: null,
        name: null,
        nameCache: null,
        sizeCache: null,
        x: 0,
        y: 0,
        size: 0,
        ox: 0,
        oy: 0,
        oSize: 0,
        nx: 0,
        ny: 0,
        nSize: 0,
        flag: 0, //what does this mean
        skinName: "",
        updateTime: 0,
        updateCode: 0,
        drawTime: 0,
        destroyed: false,
        isVirus: false,
        isAgitated: false,
        wasSimpleDrawing: true,
        destroy: function () {
            var tmp;
            for (tmp = 0; tmp < nodelist.length; tmp++)
                if (nodelist[tmp] == this) {
                    nodelist.splice(tmp, 1);
                    break
                }
            delete nodes[this.id];
            tmp = playerCells.indexOf(this);
            if (-1 != tmp) {
                ua = true;
                playerCells.splice(tmp, 1);
            }
            tmp = nodesOnScreen.indexOf(this.id);
            if (-1 != tmp) {
                nodesOnScreen.splice(tmp, 1);
            }
            this.destroyed = true;
            Cells.push(this)
        },
        getNameSize: function () {
            return Math.max(~~(.3 * this.size), 24)
        },
        setName: function (a) {
            if (this.name = a) {
                if (null == this.nameCache) {
                    this.nameCache = new UText(this.getNameSize(), "#FFFFFF", true, "#000000");
                    this.nameCache.setValue(this.name);
                } else {
                    this.nameCache.setSize(this.getNameSize());
                    this.nameCache.setValue(this.name);
                }
            }
        },
        createPoints: function () {
            for (var samplenum = this.getNumPoints(); this.points.length > samplenum;) {
                var rand = ~~(Math.random() * this.points.length);
                this.points.splice(rand, 1);
                this.pointsAcc.splice(rand, 1)
            }
            if (0 == this.points.length && 0 < samplenum) {
                this.points.push({
                    ref: this,
                    size: this.size,
                    x: this.x,
                    y: this.y
                });
                this.pointsAcc.push(Math.random() - .5);
            }
            while (this.points.length < samplenum) {
                var rand2 = ~~(Math.random() * this.points.length),
                    point = this.points[rand2];
                this.points.splice(rand2, 0, {
                    ref: this,
                    size: point.size,
                    x: point.x,
                    y: point.y
                });
                this.pointsAcc.splice(rand2, 0, this.pointsAcc[rand2])
            }
        },
        getNumPoints: function () {
            if (0 == this.id) return 16;
            var a = 10;
            if (20 > this.size) a = 0;
            if (this.isVirus) a = 30;
            var b = this.size;
            if (!this.isVirus) (b *= viewZoom);
            b *= z;
            if (this.flag & 32) (b *= .25);
            return ~~Math.max(b, a);
        },
        movePoints: function () {
            this.createPoints();
            for (var points = this.points, pointsacc = this.pointsAcc, numpoints = points.length, i = 0; i < numpoints; ++i) {
                var pos1 = pointsacc[(i - 1 + numpoints) % numpoints],
                    pos2 = pointsacc[(i + 1) % numpoints];
                pointsacc[i] += (Math.random() - .5) * (this.isAgitated ? 3 : 1);
                pointsacc[i] *= .7;
                10 < pointsacc[i] && (pointsacc[i] = 10);
                -10 > pointsacc[i] && (pointsacc[i] = -10);
                pointsacc[i] = (pos1 + pos2 + 8 * pointsacc[i]) / 10
            }
            for (var ref = this, isvirus = this.isVirus ? 0 : (this.id / 1E3 + timestamp / 1E4) % (2 * Math.PI), j = 0; j < numpoints; ++j) {
                var f = points[j].size,
                    e = points[(j - 1 + numpoints) % numpoints].size,
                    m = points[(j + 1) % numpoints].size;
                if (15 < this.size && null != qTree && 20 < this.size * viewZoom && 0 != this.id) {
                    var l = false,
                        n = points[j].x,
                        q = points[j].y;
                    qTree.retrieve2(n - 5, q - 5, 10, 10, function (a) {
                        if (a.ref != ref && 25 > (n - a.x) * (n - a.x) + (q - a.y) * (q - a.y)) {
                            l = true;
                        }
                    });
                    if (!l && points[j].x < leftPos || points[j].y < topPos || points[j].x > rightPos || points[j].y > bottomPos) {
                        l = true;
                    }
                    if (l) {
                        if (0 < pointsacc[j]) {
                            (pointsacc[j] = 0);
                        }
                        pointsacc[j] -= 1;
                    }
                }
                f += pointsacc[j];
                0 > f && (f = 0);
                f = this.isAgitated ? (19 * f + this.size) / 20 : (12 * f + this.size) / 13;
                points[j].size = (e + m + 8 * f) / 10;
                e = 2 * Math.PI / numpoints;
                m = this.points[j].size;
                this.isVirus && 0 == j % 2 && (m += 5);
                points[j].x = this.x + Math.cos(e * j + isvirus) * m;
                points[j].y = this.y + Math.sin(e * j + isvirus) * m
            }
        },
        updatePos: function () {
            if (0 == this.id) return 1;
            var a;
            a = (timestamp - this.updateTime) / 120;
            a = 0 > a ? 0 : 1 < a ? 1 : a;
            var b = 0 > a ? 0 : 1 < a ? 1 : a;
            this.getNameSize();
            if (this.destroyed && 1 <= b) {
                var c = Cells.indexOf(this);
                -1 != c && Cells.splice(c, 1)
            }
            this.x = a * (this.nx - this.ox) + this.ox;
            this.y = a * (this.ny - this.oy) + this.oy;
            this.size = b * (this.nSize - this.oSize) + this.oSize;
            return b;
        },
        shouldRender: function () {
            if (0 == this.id) {
                return true
            } else {
                return !(this.x + this.size + 40 < nodeX - canvasWidth / 2 / viewZoom || this.y + this.size + 40 < nodeY - canvasHeight / 2 / viewZoom || this.x - this.size - 40 > nodeX + canvasWidth / 2 / viewZoom || this.y - this.size - 40 > nodeY + canvasHeight / 2 / viewZoom);
            }
        },
        drawOneCell: function (ctx) {
            if (this.shouldRender()) {
                var b = (0 != this.id && !this.isVirus && !this.isAgitated && .4 > viewZoom);
                if (5 > this.getNumPoints()) b = true;
                if (this.wasSimpleDrawing && !b)
                    for (var c = 0; c < this.points.length; c++) this.points[c].size = this.size;
                this.wasSimpleDrawing = b;
                ctx.save();
                this.drawTime = timestamp;
                c = this.updatePos();
                this.destroyed && (ctx.globalAlpha *= 1 - c);
                ctx.lineWidth = 10;
                ctx.lineCap = "round";
                ctx.lineJoin = this.isVirus ? "miter" : "round";
                if (showColor) {
                    ctx.fillStyle = "#FFFFFF";
                    ctx.strokeStyle = "#AAAAAA";
                } else {
                    ctx.fillStyle = this.color;
                    ctx.strokeStyle = this.color;
                }
                if (b) {
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, this.size, 0, 2 * Math.PI, false);
                }
                else {
                    this.movePoints();
                    ctx.beginPath();
                    var d = this.getNumPoints();
                    ctx.moveTo(this.points[0].x, this.points[0].y);
                    for (c = 1; c <= d; ++c) {
                        var e = c % d;
                        ctx.lineTo(this.points[e].x, this.points[e].y)
                    }
                }
                ctx.closePath();
                var hasPrivateSkinName = !!this.skinName;
                var skinName = this.skinName || this.name.toLowerCase();
                var clanSkinName = '';
                var playerSkinName = skinName;
                if (skinName.indexOf('[') != -1) {
                    var clanStart = skinName.indexOf('[');
                    var clanEnd = skinName.indexOf(']');
                    clanSkinName = skinName.slice(clanStart + 1, clanEnd);
                    playerSkinName = skinName.slice(clanEnd + 1).trim();
                    skinName = skinFileMap[playerSkinName] ? playerSkinName : clanSkinName;
                    //console.log(skinName);
                }
                if (!hasPrivateSkinName && isPrivateSkinKey(skinName)) {
                    skinName = '';
                }

                if (!this.isAgitated && showSkin && ':teams' != gameMode) {
                    if (-1 != knownNameDict.indexOf(skinName)) {
                        if (!skins.hasOwnProperty(skinName)) {
                            skins[skinName] = new Image;
                            var skinFile = skinFileMap[skinName] || skinName;
                            skins[skinName].src = /^https?:\/\//i.test(skinFile) || /^\//.test(skinFile) ? skinFile : SKIN_URL + skinFile + '.png';
                        }
                        if (0 != skins[skinName].width && skins[skinName].complete) {
                            c = skins[skinName];
                        } else {
                            c = null;
                        }
                    } else {
                        c = null;
                    }
                } else {
                    c = null;
                }
                c = (e = c) ? -1 != ib.indexOf(skinName) : false;
                var hasNormalSkin = null != e && !c;
                if (!hasNormalSkin) {
                    b || ctx.stroke();
                    ctx.fill();
                } else {
                    ctx.fill();
                }
                if (hasNormalSkin) {
                    ctx.save();
                    ctx.clip();
                    ctx.drawImage(e, this.x - this.size, this.y - this.size, 2 * this.size, 2 * this.size);
                    ctx.restore();
                }
                if ((showColor || 15 < this.size) && !b) {
                    ctx.lineWidth = 10;
                    ctx.strokeStyle = '#000000';
                    ctx.globalAlpha *= .1;
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;
                if (null != e && c) {
                    ctx.drawImage(e, this.x - 2 * this.size, this.y - 2 * this.size, 4 * this.size, 4 * this.size);
                }
                c = -1 != playerCells.indexOf(this);
                var ncache;
                //draw name
                if (0 != this.id) {
                    var b = ~~this.y;
                    if ((showName || c) && this.name && this.nameCache && !shouldHideCellName(this.name, skinName)) {
                        ncache = this.nameCache;
                        ncache.setValue(this.name);
                        ncache.setSize(this.getNameSize());
                        var ratio = Math.ceil(10 * viewZoom) / 10;
                        ncache.setScale(ratio);
                        var rnchache = ncache.render(),
                            m = ~~(rnchache.width / ratio),
                            h = ~~(rnchache.height / ratio);
                        ctx.drawImage(rnchache, ~~this.x - ~~(m / 2), b - ~~(h / 2), m, h);
                        b += rnchache.height / 2 / ratio + 4
                    }

                    //draw mass
                    if (showMass && (c || 0 == playerCells.length && (!this.isVirus || this.isAgitated) && 20 < this.size)) {
                        if (null == this.sizeCache) {
                            this.sizeCache = new UText(this.getNameSize() / 2, "#FFFFFF", true, "#000000")
                        }
                        c = this.sizeCache;
                        c.setSize(this.getNameSize() / 2);
                        c.setValue(~~(this.size * this.size / 100));
                        ratio = Math.ceil(10 * viewZoom) / 10;
                        c.setScale(ratio);
                        e = c.render();
                        m = ~~(e.width / ratio);
                        h = ~~(e.height / ratio);
                        ctx.drawImage(e, ~~this.x - ~~(m / 2), b - ~~(h / 2), m, h);
                    }
                }
                ctx.restore()
            }
        }
    };
    UText.prototype = {
        _value: "",
        _color: "#000000",
        _stroke: false,
        _strokeColor: "#000000",
        _size: 16,
        _canvas: null,
        _ctx: null,
        _dirty: false,
        _scale: 1,
        setSize: function (a) {
            if (this._size != a) {
                this._size = a;
                this._dirty = true;
            }
        },
        setScale: function (a) {
            if (this._scale != a) {
                this._scale = a;
                this._dirty = true;
            }
        },
        setStrokeColor: function (a) {
            if (this._strokeColor != a) {
                this._strokeColor = a;
                this._dirty = true;
            }
        },
        setValue: function (a) {
            if (a != this._value) {
                this._value = a;
                this._dirty = true;
            }
        },
        render: function () {
            if (null == this._canvas) {
                this._canvas = document.createElement("canvas");
                this._ctx = this._canvas.getContext("2d");
            }
            if (this._dirty) {
                this._dirty = false;
                var canvas = this._canvas,
                    ctx = this._ctx,
                    value = this._value,
                    scale = this._scale,
                    fontsize = this._size,
                    font = fontsize + 'px Ubuntu';
                ctx.font = font;
                var h = ~~(.2 * fontsize);
                canvas.width = (ctx.measureText(value).width +
                    6) * scale;
                canvas.height = (fontsize + h) * scale;
                ctx.font = font;
                ctx.scale(scale, scale);
                ctx.globalAlpha = 1;
                ctx.lineWidth = 3;
                ctx.strokeStyle = this._strokeColor;
                ctx.fillStyle = this._color;
                this._stroke && ctx.strokeText(value, 3, fontsize - h / 2);
                ctx.fillText(value, 3, fontsize - h / 2)
            }
            return this._canvas
        },
        getWidth: function () {
            return (ctx.measureText(this._value).width +
            6);
        }
    };
    Date.now || (Date.now = function () {
        return (new Date).getTime()
    });
    var Quad = {
        init: function (args) {
            function Node(x, y, w, h, depth) {
                this.x = x;
                this.y = y;
                this.w = w;
                this.h = h;
                this.depth = depth;
                this.items = [];
                this.nodes = []
            }

            var c = args.maxChildren || 2,
                d = args.maxDepth || 4;
            Node.prototype = {
                x: 0,
                y: 0,
                w: 0,
                h: 0,
                depth: 0,
                items: null,
                nodes: null,
                exists: function (selector) {
                    for (var i = 0; i < this.items.length; ++i) {
                        var item = this.items[i];
                        if (item.x >= selector.x && item.y >= selector.y && item.x < selector.x + selector.w && item.y < selector.y + selector.h) return true
                    }
                    if (0 != this.nodes.length) {
                        var self = this;
                        return this.findOverlappingNodes(selector, function (dir) {
                            return self.nodes[dir].exists(selector)
                        })
                    }
                    return false;
                },
                retrieve: function (item, callback) {
                    for (var i = 0; i < this.items.length; ++i) callback(this.items[i]);
                    if (0 != this.nodes.length) {
                        var self = this;
                        this.findOverlappingNodes(item, function (dir) {
                            self.nodes[dir].retrieve(item, callback)
                        })
                    }
                },
                insert: function (a) {
                    if (0 != this.nodes.length) {
                        this.nodes[this.findInsertNode(a)].insert(a);
                    } else {
                        if (this.items.length >= c && this.depth < d) {
                            this.devide();
                            this.nodes[this.findInsertNode(a)].insert(a);
                        } else {
                            this.items.push(a);
                        }
                    }
                },
                findInsertNode: function (a) {
                    return a.x < this.x + this.w / 2 ? a.y < this.y + this.h / 2 ? 0 : 2 : a.y < this.y + this.h / 2 ? 1 : 3
                },
                findOverlappingNodes: function (a, b) {
                    return a.x < this.x + this.w / 2 && (a.y < this.y + this.h / 2 && b(0) || a.y >= this.y + this.h / 2 && b(2)) || a.x >= this.x + this.w / 2 && (a.y < this.y + this.h / 2 && b(1) || a.y >= this.y + this.h / 2 && b(3)) ? true : false
                },
                devide: function () {
                    var a = this.depth + 1,
                        c = this.w / 2,
                        d = this.h / 2;
                    this.nodes.push(new Node(this.x, this.y, c, d, a));
                    this.nodes.push(new Node(this.x + c, this.y, c, d, a));
                    this.nodes.push(new Node(this.x, this.y + d, c, d, a));
                    this.nodes.push(new Node(this.x + c, this.y + d, c, d, a));
                    a = this.items;
                    this.items = [];
                    for (c = 0; c < a.length; c++) this.insert(a[c])
                },
                clear: function () {
                    for (var a = 0; a < this.nodes.length; a++) this.nodes[a].clear();
                    this.items.length = 0;
                    this.nodes.length = 0
                }
            };
            var internalSelector = {
                x: 0,
                y: 0,
                w: 0,
                h: 0
            };
            return {
                root: new Node(args.minX, args.minY, args.maxX - args.minX, args.maxY - args.minY, 0),
                insert: function (a) {
                    this.root.insert(a)
                },
                retrieve: function (a, b) {
                    this.root.retrieve(a, b)
                },
                retrieve2: function (a, b, c, d, callback) {
                    internalSelector.x = a;
                    internalSelector.y = b;
                    internalSelector.w = c;
                    internalSelector.h = d;
                    this.root.retrieve(internalSelector, callback)
                },
                exists: function (a) {
                    return this.root.exists(a)
                },
                clear: function () {
                    this.root.clear()
                }
            }
        }
    };




    wjQuery(function () {
        function renderFavicon() {
            if (0 < playerCells.length) {
                redCell.color = playerCells[0].color;
                redCell.setName(playerCells[0].name);
            }
            ctx.clearRect(0, 0, 32, 32);
            ctx.save();
            ctx.translate(16, 16);
            ctx.scale(.4, .4);
            redCell.drawOneCell(ctx);
            ctx.restore();
            var favicon = document.getElementById("favicon"),
                oldfavicon = favicon.cloneNode(true);
            oldfavicon.setAttribute("href", favCanvas.toDataURL("image/png"));
            favicon.parentNode.replaceChild(oldfavicon, favicon)
        }

        var redCell = new Cell(0, 0, 0, 32, "#ED1C24", ""),
            favCanvas = document.createElement("canvas");
        favCanvas.width = 32;
        favCanvas.height = 32;
        var ctx = favCanvas.getContext("2d");
        renderFavicon();
        setInterval(drawChatBoard, 1E3);
    });
    wHandle.onload = gameLoop
//console.log(knownNameDict);
})(window, window.jQuery);
