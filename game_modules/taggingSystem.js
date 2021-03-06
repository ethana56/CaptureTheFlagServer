const GameError = require('./GameFailureReason')
module.exports = class tagSystem {
    constructor(gameBoundary) {
        this.lastError = null
        this.gameBoundary = gameBoundary
    }
    canTag(tagger, tagReceiver) {

        //if (this.gameBoundary.isOnCorrectSide(tagger, tagger.getTeam())) {
            //this.lastError = 'mustBeOnOtherSide'
            //return false
        //}

        if (tagger.getTeam() === tagReceiver.getTeam()) {
            this.lastError = 'cannotBeOnSameTeam'
            return false
        }

        if (tagger.tagged()) {
            this.lastError = GameError.playerTagged
            return false
        }

        if (tagReceiver.tagged()) {
            this.lastError = GameError.playerTagged
            return false
        }

        if (!tagReceiver.isCloseEnough(tagger)) {
            this.lastError = GameError.playersNotCloseEnough
            return false
        }
        return true
    }
}