function Chat(sender, message, flags, color) {
    this.sender = sender;
    this.message = message;
    if (flags && typeof flags == 'object') {
        this.flags = typeof color == 'number' ? color : 0;
        this.color = flags;
    } else {
        this.flags = flags || 0;
        this.color = color || null;
    }
}

module.exports = Chat;

Chat.prototype.build = function () {
    var nick = this.sender.getName();
    if (this.sender.authUser && this.sender.authUser.username) {
        nick = this.sender.authUser.guildTag ? '[' + this.sender.authUser.guildTag + '] ' + this.sender.authUser.username : this.sender.authUser.username;
        if (this.sender.authUser.premiumChatBadge) {
            nick = '[' + this.sender.authUser.premiumChatBadge + '] ' + nick;
        }
    }
    if (!nick) {
        if (this.sender.cells.length > 0) {
            nick = 'An unnamed cell'
        } else {
            nick = 'Spectator'
        }
    }
    var buf = new ArrayBuffer(9+2*nick.length+2*this.message.length);
    var view = new DataView(buf);
    var color = this.color || {'r': 153, 'g': 153, 'b': 153};
    if (!this.color && this.sender.cells.length > 0) {
        color = this.sender.cells[0].getColor();
    }
    var flags = this.flags;
    if (this.sender.cells.length <= 0) {
        flags |= 16;
    }
    view.setUint8(0, 99);
    view.setUint8(1, flags); // flags for client; for future use
    // Send color
    view.setUint8(2, color.r);
    view.setUint8(3, color.g);
    view.setUint8(4, color.b);
    var offset = 5;
    // Send name
    for (var j = 0; j < nick.length; j++) {
        view.setUint16(offset, nick.charCodeAt(j), true);
        offset += 2;
    }
    view.setUint16(offset, 0, true);
    offset += 2;
    // send message
    for (var j = 0; j < this.message.length; j++) {
        view.setUint16(offset, this.message.charCodeAt(j), true);
        offset += 2;
    }
    view.setUint16(offset, 0, true);
    offset += 2;
    return buf;
};
