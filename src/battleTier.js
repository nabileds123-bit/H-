var RANKS = [
    { key: 'UNRANKED', label: 'Unranked', min: 0 },
    { key: 'I', label: 'I', min: 10 },
    { key: 'II', label: 'II', min: 30 },
    { key: 'III', label: 'III', min: 60 },
    { key: 'IV', label: 'IV', min: 90 },
    { key: 'V', label: 'V', min: 250 },
    { key: 'VI', label: 'VI', min: 500 },
    { key: 'VII', label: 'VII', min: 800 },
    { key: 'VII_STAR_2', label: 'VII *2', min: 1500 },
    { key: 'VII_STAR_3', label: 'VII *3', min: 2500 },
    { key: 'VII_STAR_4', label: 'VII *4', min: 4000 },
    { key: 'VII_STAR_5', label: 'VII *5', min: 6000 }
];

function toNumber(value) {
    value = parseInt(value, 10);
    return isNaN(value) || value < 0 ? 0 : value;
}

function getTierFromProgress(progress) {
    progress = toNumber(progress);

    var tier = RANKS[0];
    for (var i = 0; i < RANKS.length; i++) {
        if (progress >= RANKS[i].min) {
            tier = RANKS[i];
        } else {
            break;
        }
    }

    return {
        key: tier.key,
        label: tier.label,
        min: tier.min
    };
}

function normalizeTierName(tier) {
    tier = String(tier || '').trim().toUpperCase();
    tier = tier.replace(/\s+/g, '_').replace(/-/g, '_');

    if (tier === 'UNRANK' || tier === 'UNRANKED') return 'UNRANKED';
    if (tier === 'STAR2' || tier === 'S2' || tier === '*2' || tier === 'VII_STAR2' || tier === 'VII_*2') return 'VII_STAR_2';
    if (tier === 'STAR3' || tier === 'S3' || tier === '*3' || tier === 'VII_STAR3' || tier === 'VII_*3') return 'VII_STAR_3';
    if (tier === 'STAR4' || tier === 'S4' || tier === '*4' || tier === 'VII_STAR4' || tier === 'VII_*4') return 'VII_STAR_4';
    if (tier === 'STAR5' || tier === 'S5' || tier === '*5' || tier === 'VII_STAR5' || tier === 'VII_*5') return 'VII_STAR_5';

    for (var i = 0; i < RANKS.length; i++) {
        if (RANKS[i].key === tier) return RANKS[i].key;
    }

    return 'UNRANKED';
}

function getProgress(userOrProgress) {
    if (userOrProgress && typeof userOrProgress === 'object') {
        if (userOrProgress.rankedProgress != null) return toNumber(userOrProgress.rankedProgress);
        if (userOrProgress.rankedWins != null) return toNumber(userOrProgress.rankedWins);
        return 0;
    }

    return toNumber(userOrProgress);
}

function forUser(user) {
    return getTierFromProgress(getProgress(user)).key;
}

function label(tier) {
    tier = normalizeTierName(tier);
    for (var i = 0; i < RANKS.length; i++) {
        if (RANKS[i].key === tier) return RANKS[i].label;
    }
    return 'Unranked';
}

function getNextTierInfo(progress) {
    progress = getProgress(progress);
    var current = getTierFromProgress(progress);
    var index = 0;

    for (var i = 0; i < RANKS.length; i++) {
        if (RANKS[i].key === current.key) {
            index = i;
            break;
        }
    }

    var next = RANKS[index + 1] || null;
    return {
        progress: progress,
        tier: current.key,
        tierLabel: current.label,
        nextTier: next ? next.key : '',
        nextTierLabel: next ? next.label : '',
        nextAt: next ? next.min : 0,
        remaining: next ? Math.max(0, next.min - progress) : 0,
        isMaxRank: !next
    };
}

module.exports = {
    forUser: forUser,
    getNextTierInfo: getNextTierInfo,
    getProgress: getProgress,
    getTierFromProgress: getTierFromProgress,
    label: label,
    normalize: normalizeTierName,
    normalizeTierName: normalizeTierName,
    progressInfo: getNextTierInfo,
    toNumber: toNumber
};
