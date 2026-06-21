function UpdateLeaderboard(leaderboard, packetLB) {
    this.leaderboard = leaderboard;
    this.packetLB = packetLB;
}

module.exports = UpdateLeaderboard;

function getLeaderboardName(item) {
    if (!item) return "";
    if (typeof item.getDisplayName === "function") {
        return item.getDisplayName() || "";
    }
    if (typeof item.getName === "function") {
        return item.getName() || "";
    }
    return "";
}

UpdateLeaderboard.prototype.build = function() {
    // First, calculate the size
    var lb = this.leaderboard;
    var bufferSize = 5;
    var validElements = 0;
    
    switch (this.packetLB) {
        case 48: // Text list packet
            for (var i = 0; i < lb.length; i++) {
                if (typeof lb[i] == "undefined") {
                    continue;
                }

                var text = String(lb[i] || "");
                bufferSize += text.length * 2;
                bufferSize += 2;
                validElements++;
            }

            var buf = new ArrayBuffer(bufferSize);
            var view = new DataView(buf);

            view.setUint8(0, this.packetLB, true);
            view.setUint32(1, validElements, true);

            var offset = 5;
            for (var i = 0; i < lb.length; i++) {
                if (typeof lb[i] == "undefined") {
                    continue;
                }

                text = String(lb[i] || "");
                for (var j = 0; j < text.length; j++) {
                    view.setUint16(offset, text.charCodeAt(j), true);
                    offset += 2;
                }

                view.setUint16(offset, 0, true);
                offset += 2;
            }

            return buf;
        case 49: // FFA-type Packet (List)
        	// Get size of packet            
            for (var i = 0; i < lb.length; i++) {
            	
                if (typeof lb[i] == "undefined") {
                    continue;
                }

                var item = lb[i];
                var name = getLeaderboardName(item);
                bufferSize += 4; // Element ID
                bufferSize += name ? name.length * 2 : 0; // Name
                bufferSize += 2; // Name terminator

                validElements++;
            }       
            
            var buf = new ArrayBuffer(bufferSize);
            var view = new DataView(buf);
            
            // Set packet data
            view.setUint8(0, this.packetLB, true); // Packet ID
            view.setUint32(1, validElements, true); // Number of elements
            
            var offset = 5;
            for (var i = 0; i < lb.length; i++) {

                if (typeof lb[i] == "undefined") {
                    continue;
                }

                var item = lb[i];
                
                var nodeID = 0; // Get node id of player's 1st cell
                if (item.cells[0]) {
                    nodeID = item.cells[0].nodeId;
                }
                
                view.setUint32(offset, nodeID, true);
                offset += 4;

                // Set name
                var name = getLeaderboardName(item);
                if (name) {
                    for (var j = 0; j < name.length; j++) {
                        view.setUint16(offset, name.charCodeAt(j), true);
                        offset += 2;
                    }
                }

                view.setUint16(offset, 0, true);
                offset += 2;
            }
            return buf;
        case 50: // Teams-type Packet (Pie Chart)
            validElements = lb.length;
            bufferSize += (validElements * 4);
        	
            var buf = new ArrayBuffer(bufferSize);
            var view = new DataView(buf);
            
            view.setUint8(0, this.packetLB, true); // Packet ID
            view.setUint32(1, validElements, true); // Number of elements
            
            var offset = 5;
            for (var i = 0; i < validElements;i++) {
                view.setFloat32(offset, lb[i], true); // Number of elements
                offset += 4;
            }
            
            return buf;
        default:
            return new ArrayBuffer(0);
    }
    
}
