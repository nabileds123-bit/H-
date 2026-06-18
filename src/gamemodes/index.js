module.exports = {
    Mode: require('./Mode'),
    FFA: require('./FFA'),
    Teams: require('./Teams'),
    Custom: require('./Custom'),
    Experimental: require('./Experimental'),
    X5: require('./X5'),
    Battle1vs1: require('./Battle1vs1'),
    Battle2vs2: require('./Battle2vs2')
};

try {
    module.exports.Tournament = require('./Tournament');
} catch (e) {
    module.exports.Tournament = null;
}

var list = [
    new module.exports.FFA(),
    new module.exports.Teams(),
    new module.exports.X5(),
    new module.exports.Battle1vs1(),
    new module.exports.Battle2vs2()
];

module.exports.list = list;
