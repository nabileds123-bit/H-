function getProgress(value) {
    if (value && typeof value === 'object') {
        value = value.progress != null ? value.progress : value.points;
    }

    value = parseFloat(value);
    return isNaN(value) ? 0 : Math.max(0, value);
}

function fromProgress(progress) {
    progress = getProgress(progress);

    if (progress < 10) return 'UNRANKED';
    if (progress < 30) return 'I';
    if (progress < 60) return 'II';
    if (progress < 90) return 'III';
    if (progress < 250) return 'IV';
    if (progress < 500) return 'V';
    if (progress < 800) return 'VI';
    if (progress < 1500) return 'VII';
    if (progress < 3000) return 'STAR2';
    if (progress < 5000) return 'STAR3';
    if (progress < 8000) return 'STAR4';
    return 'STAR5';
}

var RANKS = [
    { tier: 'UNRANKED', min: 0 },
    { tier: 'I', min: 10 },
    { tier: 'II', min: 30 },
    { tier: 'III', min: 60 },
    { tier: 'IV', min: 90 },
    { tier: 'V', min: 250 },
    { tier: 'VI', min: 500 },
    { tier: 'VII', min: 800 },
    { tier: 'STAR2', min: 1500 },
    { tier: 'STAR3', min: 3000 },
    { tier: 'STAR4', min: 5000 },
    { tier: 'STAR5', min: 8000 }
];

function normalize(value) {
    value = String(value || '').trim().toUpperCase();
    if (value === 'UNRANKED' || value === 'UNRANK') return 'UNRANKED';
    if (value === '★2' || value === '*2' || value === 'S2' || value === 'STAR2') return 'STAR2';
    if (value === '★3' || value === '*3' || value === 'S3' || value === 'STAR3') return 'STAR3';
    if (value === '★4' || value === '*4' || value === 'S4' || value === 'STAR4') return 'STAR4';
    if (value === '★5' || value === '*5' || value === 'S5' || value === 'STAR5') return 'STAR5';
    return /^(I|II|III|IV|V|VI|VII)$/.test(value) ? value : 'UNRANKED';
}

function forUser(user) {
    if (user && (user.progress != null || user.points != null)) {
        return fromProgress(getProgress(user));
    }

    return normalize(user && user.battleTier);
}

function label(value) {
    value = normalize(value);
    if (value === 'STAR2') return '★2';
    if (value === 'STAR3') return '★3';
    if (value === 'STAR4') return '★4';
    if (value === 'STAR5') return '★5';
    return value === 'UNRANKED' ? 'Unranked' : value;
}

function progressInfo(value) {
    var progress = getProgress(value);
    var tier = fromProgress(progress);
    var index = 0;

    for (var i = 0; i < RANKS.length; i++) {
        if (RANKS[i].tier === tier) {
            index = i;
            break;
        }
    }

    var next = RANKS[index + 1] || null;
    return {
        progress: progress,
        tier: tier,
        tierLabel: label(tier),
        nextTier: next ? next.tier : '',
        nextTierLabel: next ? label(next.tier) : '',
        nextAt: next ? next.min : 0,
        remaining: next ? Math.max(0, next.min - progress) : 0,
        isMaxRank: !next
    };
}

module.exports = {
    forUser: forUser,
    fromProgress: fromProgress,
    getProgress: getProgress,
    label: label,
    normalize: normalize,
    progressInfo: progressInfo
};
