(function () {
    'use strict';

    function getToken() {
        try {
            return localStorage.getItem('authToken') || '';
        } catch (e) {
            return '';
        }
    }

    function postJson(url, payload) {
        payload = payload || {};
        payload.token = payload.token || getToken();

        return fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        }).then(function (res) {
            return res.json().catch(function () {
                return {};
            }).then(function (data) {
                if (!res.ok || data.ok === false) {
                    throw new Error(data.error || data.message || ('Request failed: ' + res.status));
                }
                return data;
            });
        });
    }

    function refreshNotifications() {
        if (window.jQuery && typeof window.jQuery === 'function') {
            window.jQuery.getJSON('/api/notifications', { token: getToken() });
        }
    }

    window.InviteSystem = {
        respond: function (type, id, accepted) {
            var url = type === 'battle' ? '/api/battle/invite/respond' : '/api/friends/respond';
            return postJson(url, {
                id: id,
                targetId: id,
                accepted: !!accepted
            }).then(function (data) {
                refreshNotifications();
                return data;
            });
        },
        battleInvite: function (targetUserId, mode) {
            return postJson('/api/battle/invite', {
                targetUserId: targetUserId,
                mode: mode || window.currentGameMode || ':battle:1v1',
                battleId: mode || window.currentGameMode || ':battle:1v1'
            });
        }
    };

    window.cInvite = function (id, accepted) {
        var type = String(id || '').indexOf('bi_') === 0 ? 'battle' : 'friend';
        return window.InviteSystem.respond(type, id, accepted);
    };

    window.bInvA = function (targetUserId, mode) {
        return window.InviteSystem.battleInvite(targetUserId, mode);
    };
}());
