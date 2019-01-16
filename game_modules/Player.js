const Events = require('events')

let exporter = {}

exporter.createPlayer = (name, boundary, location = null) => {
    let player = {
        eventEmitter : new Events.EventEmitter(),
        name : name,
        location : location,
        boundary : boundary,
        tagged : false,
        team : null,
        itemsHeld : new Set(),
        pickUpComponent : {
            tagged : false,
            team : null,
            maxHeld : 1,
            boundary : boundary
        },
        tagComponent : {
            tagged : false,
        }
    }
    return player
}

module.exports = exporter





/*module.exports = class Player extends Events.EventEmitter {
    constructor(name, boundary) {
        super()
        this.name = name;
        this._flagsHeld = new Set()
        this.isTagged = false;
        this._acceptableDistance = boundary
        this._reachDistance
        this.team = null
    }

    getLocation() {
        return this._acceptableDistance.getCenter()
    }

    getTeam() {
        return this.team
    }

    isCloseEnough(entity) {
        return this._acceptableDistance.isInBounds(entity)
    }

    setLocation(location) {
        this._acceptableDistance.setCenter(location)
        this.emit('locationChanged', this._acceptableDistance.getCenter())
    }

    hasFlags() {
        return this._flagsHeld.size > 0
    }

    flags() {
        return new Array(this._flagsHeld)
    }

    __setTeam(team) {
        this.team = team
    }

    __removeTeam() {
        if (this.team == null) {
            return false
        }
        this.team = null
        return true
    }

    pickUpFlag(flag) {
        if (flag.canBePickedUpBy(this)) {
            this._flagsHeld.add(flag)
            flag.setHeld()
            this.emit('pickedUpFlag', flag)
            return true
        }
        return false
    }

    dropFlags(flags) {
        let droppedFlags = []
        flags.forEach((flag) => {
            let deleted = this._flagsHeld.delete(flag)
            if (deleted) {
                droppedFlags.push(flag)
            }
        })
        droppedFlags.forEach((flag) => {
            flag.setDropped(this.getLocation())
        })
        if (droppedFlags.length > 0) {
            this.emit('droppedFlags', droppedFlags)
        }
        return droppedFlags
    }

    dropFlagsAtLocation(flagsAndLocations) {
        let droppedFlags = []
        flagsAndLocations.forEach((flag) => {
            let deleted = this._flagsHeld.delete(flag)
            if (deleted) {
                droppedFlags.push(flag)
                flag.setDropped(this.getLocation())
            }
        })
        if (droppedFlags.length > 0) {
            this.emit('droppedFlags', droppedFlags)
        }
        return droppedFlags
    }

    dropAllFlags() {
        let droppedFlags = new Array(this._flagsHeld)
        droppedFlags.forEach((flag) => {
            flag.setDropped(this.getLocation())
        })
        this._flagsHeld.clear()
        if (droppedFlags.length > 0) {
            this.emit('droppedFlags', droppedFlags)
        }
        return droppedFlags
    }

    

    tag(player) {
        if (player.canBeTaggedBy(this)) {
            player.setTagged()
            this.emit('tagged', player)
            return true
        }
        return false
    }

    taggedBy(player) {
        if (this.canBeTaggedBy(player)) {
            this.isTagged = true
            this.emit('hasBeenTagged')
            player.invokeDroppedCallback()
            return true
        }
        return false
    }

    invokeDroppedCallback() {
        if (this.droppedCallback != null) {
            this.droppedCallback()
        }
    }

    setTagged() {
        this.isTagged = true
        this.emit('hasBeenTagged')
    }

    canBeTaggedBy(player) {
        return this.isCloseEnough(player)
    }

    untag() {
        this.isTagged = false
        this.emit('untagged')
    }

    hasFlag() {
        return this._flagsHeld.size > 0
    }
    
}*/