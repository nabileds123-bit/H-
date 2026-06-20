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

module.exports = {
    forUser: forUser,
    fromProgress: fromProgress,
    getProgress: getProgress,
    label: label,
    normalize: normalize
};
