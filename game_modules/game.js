const geoLib = require('geolib');
const clone = require('clone');
const Events = require('events');
const GameFailureReason = require('./GameFailureReason');
const Boundry = require('./boundry')

const MAX_PLAYERS_PER_TEAM = 15;
const DISTANCE_BETWEEN_PLAYERS = 10000000;
module.exports = class Game extends Events.EventEmitter {
    constructor(name) {
        super();
        this._players = new Map();
        this._flags = new Map();
        this._teams = {};
        this.name = name;
        this.boundary = null;
        this.gameStates = {
            lobby : 0,
            placeFlags : 1,
            gameInProgress : 2,
            gameEnd : 3
        };
        this.gameState = this.gameStates.lobby;
    }

    getState() {
        return this.gameState
    }

    getPlayerInfo(id) {
        return createRepPlayer(this._players.get(id))
    }

    getPlayers() {
        let playerEntries = this._players.entries()
        let repPlayers = {}
        for (let player of playerEntries) {
            let playerProperties = player[1]
            let repPlayer = createRepPlayer(playerProperties)
            repPlayers[repPlayer.id] = repPlayer
        }
        return repPlayers
    }

    dropFlag(playerId) {
        let player = this._players.get(playerId)
        if (!player.hasFlag()) {
            return GameFailureReason.playerDoesNotHaveAFlag
        }
        let flag = player.flag
        let location = player.getLocation()
        flag.held = false
        player.flag = null
        this.emit('flagDropped', playerId, flag.id, location)
    }

    getFlags() {
        let flagEntries = this._flags.entries()
        let repFlags = {}
        for (flag in flagEntries) {
            let flagProperties = flag[1]
            let repFlag = createRepFlag(flagProperties)
            repFlags[repFlag.id] = repPlayer
        }
        return repFlags
    }

    checkIfAlreadyInGame(id) {
        return this._players.has(id)
    }

    checkIfPlayerNameTaken(name) {
        let playerNameTaken = false;
        if (this._players.size === 0) {
            return false
        }
        Object.keys(this._players.keys).forEach(key => {
            if (this._players.get(key).name === name) {
                playerNameTaken = true
            } 
        });
        return playerNameTaken !== false;

    }

    checkIfTeamExists(teamId) {
        return this._teams[teamId] !== undefined
        
    }

    createBoundary(boundaryLineCoords, direction){
        if (this.boundary !== null) {
            return GameFailureReason.boundaryAlreadyExists
        }
        this.boundary = new GameBoundary(new CircleBoundary(boundaryLineCoords, 4000), direction, {greater: this._teams[1], lesser: this._teams[2]})
        this.emit('boundaryCreated', createRepGameBoundary(this.boundary))
    }

    getBoundary() {
        if (this.boundary != undefined) {
            let bounds = this.boundary
            return createRepGameBoundary(bounds)
        }
        return null
    }
        

    addPlayer(id, playerName) {
        if (this.checkIfAlreadyInGame(id)) {
            return GameFailureReason.PlayerAlreadyInGame;
        }
        if (this._players.size === MAX_PLAYERS_PER_TEAM) {
            return GameFailureReason.TooManyPlayers;
        }
        if (this.checkIfPlayerNameTaken(playerName)) {
            return GameFailureReason.NameAlreadyTaken
        }

        let player = new Player(playerName, '' + id, new CircleBoundary(null, DISTANCE_BETWEEN_PLAYERS))
        if (this._players.size === 0) {
            player.leader = true
        }
        this._players.set(id, player);
        let repPlayer
        this.emit('playerAdded', player)
    }

    updateLocation(id, latitude, longitude) {
        let player = this._players.get(id)
        let location = {
            latitude : latitude,
            longitude : longitude
        };
        let lastLocation = player.getLocation()
        player.setLocation(location)
        if (this.boundary != null && !this.boundary.isInBounds(player) && player.flagHeld != null) {
            let flag = player.flagHeld
            player.flagHeld = null
            flag.setLocation(lastLocation)
            this.emit('flagDropped', id, flag.id, lastLocation)
            console.log('from update location flag')
            console.log(flag)
            console.log('last location')
            console.log(lastLocation)
        }
        this.emit('locationUpdate', id, location)
    }

    tagPlayer(playerToTagId, idOfTaggingPlayer) {
        if (this.gameState != this.gameStates.gameInProgress) {
            return GameFailureReason.incorrectGameState
        }
        let playerToTag = this._players.get(playerToTagId)
        let taggingPlayer = this._players.get(idOfTaggingPlayer)
        if (taggingPlayer.isCloseEnough(playerToTag)) {
            playerToTag.isTagged = true
            let flagHeldLocation = null
            if (playerToTag.flagHeld != null) {
                flagHeldLocation = this._players.get(playerToTagId).getLocation()
            }
            this.emit('playerTagged', playerToTagId, flagHeldLocation)
        } else {
            return GameFailureReason.playersNotCloseEnough
        }
    }

    addFlag(idOfAdder, location) {
        //checks
        let player = this._players.get(idOfAdder)
        if (this.gameState !== this.gameStates.placeFlags) {
            return GameFailureReason.incorrectGameState
        }
        if (!player.leader) {
            return GameFailureReason.playerDoesNotHavePermission
        }
        let flagId = this._flags.size + 1
        let flag = new Flag('' + flagId, new CircleBoundary(location, 40))
        /*if (!this.boundary.isOnCorrectSide(flag)) {
            console.log("not placing on the correct side")
            return GameFailureReason.playerNotInBounds
        }*/
        if (this.boundary === null || !this.boundary.isInBounds(flag)) {
            return GameFailureReason.playerNotInBounds
        }

        //logic
        this._flags.set('' + flagId, flag);
        let teamId;
        if (this._teams[1].containsPlayer(idOfAdder.toString())) {
            teamId = this._teams[1].id
            this._teams[teamId].flags.push(flagId.toString())
        } else {
            teamId = this._teams[2].id
            this._teams[teamId].flags.push(flagId.toString())
        }
        let flagToSend = createRepFlag(flag)
        console.log('about to pick of a flag from game') 
        this.emit('flagAdded', flagToSend, teamId)
        return flagId
    }

    pickUpFlag(flagId, playerId) {
        console.log('called pickupflag in game')
        if (this.gameState !== this.gameStates.gameInProgress) {
            return GameFailureReason.incorrectGameState
        }
        if (getTeamOf.call(this, 'flag', flagId) === getTeamOf.call(this, 'player', playerId)) {
            return GameFailureReason.cannotPickUpFlag
        }
        let flag = this._flags.get('' + flagId)
        let player = this._players.get(playerId)
        if (!flag.isCloseEnough(player)) {
            return GameFailureReason.cannotPickUpFlag
        }
        player.flagHeld = flag
        flag.held = true;
        this.emit('flagPickedUp', flagId, playerId)
    }

    getTeams() {
        return clone(this._teams)
    }

    removePlayer(id) {
        this._players.delete(id);
        this.emit('playerRemoved', String(id))
    }

    addToTeam(id, teamId) {
        this._teams['' + teamId].players.push('' + id);
        this.emit('playerJoinedTeam', String(id), teamId);
    }

    addTeam(teamName) {
        if (Object.keys(this._teams).length === 2) {
            return GameFailureReason.tooManyTeams
        }
        let teamId = (Object.keys(this._teams).length + 1);
        let teamToAdd = new Team(teamName, teamId);
        this._teams[teamId] = teamToAdd;
        this.emit('teamAdded', teamToAdd);
    }


    nextGameState() {
        if (this.gameState !== this.gameStates.gameEnd) {
            this.gameState++;
            this.emit('gameStateChanged', this.gameState);
        }
    }
};

function getTeamOf(type, id) {
    switch (type) {
        case 'player':
            if (this._teams[1].containsPlayer(id)) {
                return this._teams[1]
            }
            if (this._teams[2].containsPlayer(id)) {
                return this._teams[2]
            }
            break
        case 'flag':
            if (this._teams[1].containsFlag(id)) {
                return this._teams[1]
            }
            if (this._teams[2].containsFlag(id)) {
                return this._teams[2]
            }
            break
        default:
            break
    }
}

function createRepPlayer(player) {
    let flag = player.flagHeld
    let flagId = null
    if (flag != undefined) {
        flagId = flag.id
    }
    return {
        name : player.name,
        id : player.id,
        flagHeld : flagId,
        location : player.getLocation(),
        leader : player.leader,
        isTagged : player.isTagged
    }
}

function createRepFlag(flag) {
    return {
        name : flag.name,
        id : flag.id,
        location : flag.getLocation(),
        held : flag.held
    }
}

function createRepGameBoundary(boundary) {
    return {
        center: boundary.getCenter(),
        direction: boundary.getDirection(),
        teamSides: boundary.getSides(),
        direction: boundary.getDirection()
    }
}

function convertMapToObject(map) {
    let objToReturn = {};
    map.forEach(function(value, key) {
        objToReturn[key] = value;
    });
    return objToReturn;
}

class Player {
    constructor(name, id, boundary) {
        this.name = name;
        this.flagHeld = null;
        this.id = id;
        this.isTagged = false;
        this.leader = true;
        this._acceptableDistance = boundary
    }

    getLocation() {
        return this._acceptableDistance.getCenter()
    }

    isCloseEnough(entity) {
        return this._acceptableDistance.isInBounds(entity)
    }

    setLocation(location) {
        this._acceptableDistance.setCenter(location)
    }

    hasFlag() {
        return this.flagHeld != null
    }
}

class Flag  {
    constructor(id, boundary) {
        this.id = id;
        this.acceptableDistance = boundary;
        this.held = false;
    }
    
    getLocation() {
        return this.acceptableDistance.getCenter()
    }

    isCloseEnough(entity) {
        return this.acceptableDistance.isInBounds(entity)
    }

    setLocation(location) {
        this.acceptableDistance.setCenter(location)
    }
}

class CircleBoundary {
    constructor(centerPoint, radius) {
        this._centerPoint = centerPoint
        this._radius = radius
        this.boundaryType = 'circle'
    }

    getCenter() {
        return this._centerPoint
    }

    isInBounds(entity) {
        if (entity.getLocation() != null) {
            let distanceFromCenter = geoLib.getDistance(this._centerPoint, entity.getLocation())
            return distanceFromCenter <= this._radius
        }
        return false
    }

    setCenter(location) {
        this._centerPoint = location
    }
}


class GameBoundary {
    //teamSides = [lesser: team, greater: team]
    constructor(boundary, separaterDirection, teamSides) {
        this._boundary = boundary
        this._center = boundary.getCenter()
        this._separaterDirection = separaterDirection
        this._teamSides  = teamSides
    }

    isInBounds(entity) {
        return this._boundary.isInBounds(entity)
    }

    isOnCorrectSide(entity) {
        //figure out what side entity is on
        if (this._separaterDirection === 'veritcal') {
            if (entity.location.longitude < this._center.longitude) {
                return this.teamsSides.lesser.containsEntity(entity)
            }
            if (entity.location.longitude > this._center.longitude) {
                return this.teamsSides.greater.constainsEntity(entity)
            }
        } else if (this._separaterDirection === 'horizontal') {
            if (entity.location.latitude < this._center.latitude) {
                return this.teamSides.lesser.containsEntity(entity)
            }
            if (entity.location.latitude > this._center.latitude) {
                return this.teamSides.greater.constainsEntity(entity)
            }
        }
    }

    getCenter() {
        return this._center
    }

    getDirection() {
        return this._separatorDirection
    }

    getSides() {
        return this._teamSides
    }
}

class Team {
    constructor(name, id) {
        this.id = id;
        this.name = name;
        this.players = new Array();
        this.flags = new Array();
    }
    containsPlayer(playerId) {
        let contains = false
        this.players.forEach(function(item) {
            if (item == playerId) {
                contains = true
                return
            }
        })
        return contains
    }
    containsFlag(flagId) {
        let contains = false
        this.flags.forEach(function(item) {
            if (item == flagId) {
                contains = true
                return
            }
        })
        return contains
    }
}
