module.exports = {
    Mode: require('./Mode'),
    FFA: require('./FFA'),
    Teams: require('./Teams'),
    Custom: require('./Custom'),
    Experimental: require('./Experimental'),
    Tournament: require('./Tournament'),
    X5: require('./X5'),
};

var list = [
    new module.exports.FFA(),
    new module.exports.Teams(),
    new module.exports.X5()
];

module.exports.list = list;
