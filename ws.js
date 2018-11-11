const WebSocket = require('ws');
const Events = require('events');
const Message = require('./WSRequestResponse/message');
const Game = require('./game_modules/game');
const geo = require('geolib');
const http = require('http');
const express = require('express');
const GameFailureReason = require('./game_modules/GameFailureReason');
const RRWS = require('./WSRequestResponse/').Server
const uuid = require('uuid/v4')
const bodyParser = require('body-parser')
const TwoWayMap = require('./biDirectional')

let app = express();
const PORT = process.env.PORT || 8000;
('LISTENING TO ' + PORT)
app.use(express.static(__dirname + "/"));
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json())
var server = http.createServer(app)
server.listen(PORT)
console.log("http server listening on %d", PORT)
function verifyClient(info, callback) {
    console.log(info)
}

let wss = new RRWS({server: server})

console.log("websocket server created")



let games = {};

wss.on('close', (connectionKey) => {

})

class User {
    constructor(name, game, id, connectionKey) {
        this.name = name
        this.game = game
        this.id = id
        this.player = null
        this.connectionKey = connectionKey
    }
}

//for auth only(will be in database)
let userKeyMap = new Map()
let userAccounts = {'Ethan' : 'Ethan123', 'Bob' : 'Bobby123', 'Sam' : 'Sam123', 'Fred' : 'Fred123'}


let users = new Map()
let clients = new Map();
let playerToUser = new TwoWayMap()

//flag, flagId
let flags = new TwoWayMap()

//team, teamId
let teams = new TwoWayMap()

wss.on('connection', function connection(connectionKey, headers) {
    console.log('New Connection');
    //let clientAdded = {id: number}
    let username = userKeyMap.get(headers['authkey'])
    let user = users.get(username)
    if (user == undefined) {
        let newUserId = uuid()
        let newUser = new User(username, undefined, newUserId, connectionKey)
        users.set(username, newUser)
        users.set(newUserId, newUser)
        user = users.get(username)
    } else {
        user.connectionKey = connectionKey
    }
    clients.set(connectionKey, user)
});

wss.on('close', function(number) {
   clients.get(number).connectionKey = undefined
   clients.delete(number)
})

const generalError = {
    gameDoesNotExist: 'gameDoesNotExist',
    notInAGame: 'notInAGame',
    playerBeingTaggedNotInAGame: 'playerBeingTaggedNotInAGame'
}

wss.onCommand('updateLocation', ['latitude', 'longitude'], function(req, resp) {
    let latitude = req.data.latitude;
    let longitude = req.data.longitude;
    let game = clients.get(req.id).game;
    let player = clients.get(req.id).player
    if (game === undefined) {
        resp.data.error = 'player not in game';
    }
    game.updateLocation(player, latitude, longitude);
})

wss.onCommand('tagPlayer', ['playerToTagId'], function(req, resp) {
    let user = clients.get(req.id)
    let userToTag = users.get(req.data.playerToTagId)
    let player = user.player
    let game = user.game
    let playerToTag = userToTag.player
    if (game !== userToTag.game) {
        resp.data.error = generalError.playerBeingTaggedNotInAGame
        resp.send()
        return
    }
    if (userToTag.game === undefined) {
        resp.data.error = generalError.playerBeingTaggedNotInAGame;
        resp.send();
        return;
    }
    if (game === undefined) {
        resp.data.error = generalError.notInAGame;
        resp.send()
        return;
    }
    let error = game.tagPlayer(playerToTag, player)
    if (error != undefined) {
        resp.data.error = error
    } else {
        resp.send()
    }
})

wss.onCommand('joinGame', ['key', 'playerName'], function(req, resp) {
    let gameKey = req.data.key;
    let playerName = req.data.playerName;
    if (!gameExists(gameKey)) {
        resp.data.error = generalError.gameDoesNotExist
        resp.send()
        return;
    }
    let game = games[gameKey]
    let player = game.createPlayer(playerName)
    let error = game.addPlayer(player)
    if (error == undefined) {
        clients.get(req.id).game = games[gameKey]
        clients.get(req.id).player = player
        playerToUser.set(player, clients.get(req.id))
        sendToAllInGame(game, createRepPlayer(player), 'playerAdded')
        setUpPlayerEvents(player, game)
        resp.send();
    } else {
        resp.data = {}
        resp.data.error = error;
        resp.send();
    }
})

wss.onCommand('joinTeam', ['teamId'], function(req, resp) {
    let teamToJoinId = req.data.teamId;
    let team = teams.getReverse(teamToJoinId)
    if (clients.get(req.id).game === undefined) {
        resp.data.error = 'not in a game';
        resp.send();
        return;
    }
    let game = clients.get(req.id).game;
    let player = clients.get(req.id).player
    let error = game.addToTeam(player, team)
    if (error !== undefined) {
        resp.error = error
        resp.send()
        return
    }
    resp.send()
})

wss.onCommand('enterGame', ['gameId', 'userId'], function(req, resp) {

})

wss.onCommand('nextGameState', null, function(req, resp) {
    let game = clients.get(req.id).game
    if (game === undefined) {
        resp.data.error = generalError.gameDoesNotExist
        resp.send()
        return
    }
    game.nextGameState()
})

function gameExists(key) {
    return games[key] != undefined;
}

wss.onCommand('createGame', ['key', 'gameName'], function(req, resp) {
    let gameKey = req.data.key;
    let gameName = req.data.gameName;
    let game = new Game(gameName);
    games[gameKey] = game;
    initEvents(game);
    resp.send();
})

wss.onCommand('createFlag', ['latitude', 'longitude'], function(req, resp) {
    let location = {latitude: req.data.latitude, longitude: req.data.longitude}
    let player = clients.get(req.id).player
    let game = clients.get(req.id).game
    if (clients.get(req.id).game === undefined) {
        resp.data = {}
        resp.data.error = generalError.notInAGame
        resp.send()
        return
    } 
    let flag = game.createFlag(location)
    let flagId = uuid()
    flags.set(flag, flagId)
    let placeFlagError = game.addFlag(flag, player)
    if (placeFlagError !== undefined) {
        resp.data = {}
        resp.data.error = placeFlagError
        flags.deleteWithKey(flag)
        resp.send()
    } else {
        resp.send()
    }
})

wss.onCommand('getPlayerInfo', null, function(req, resp) {
    if (clients.get(req.id).game === undefined) {
        resp.data.error = 'not in a game';
        resp.send();
        return;
    }
    let player = clients.get(req.id).player
    let playerInfo = createRepPlayer(player)
    resp.data.player = playerInfo;
    resp.send();
})

wss.onCommand('getFlags', null, function(req, resp) {
    if (clients.get(req.id).game === undefined) {
        resp.data.error = 'getFlags: player not in game';
        resp.send();
        return;
    }
    let flags = clients.get(req.id).game.getFlags();
    let flagsToSend = []
    for (flag in flags) {
        let repFlag = createRepFlag(flag)
        flagsToSend.push(repFlag)
    }
    resp.data = {}
    resp.data.flags = flagsToSend;
    resp.send();
})

wss.onCommand('pickUpFlag', ['flagId'], function(req, resp) {
    let game = clients.get(req.id).game
    let flag = flags.getReverse(req.data.flagId)
    let player = clients.get(req.id).player
    if (game === undefined) {
        resp.data.error = generalError.playerBeingTaggedNotInAGame
        resp.send()
        return
    }
    if (flag === undefined) {
        return
    }
    let error = game.pickUpFlag(flag, player)
    if (error != undefined) {
        resp.data.error = error
        resp.send()
    } else {
        resp.send()
    }
})

wss.onCommand('getTeams', null, function(req, resp){
    let game = clients.get(req.id).game
    if (game === undefined) {
        resp.data.error = 'getTeams: not in game';
        resp.send();
        return;
    }
    let teams = game.getTeams();
    let teamsToSend = []
    for (let team of teams) {
        teamsToSend.push(createRepTeam(team))
    }
    resp.data = {};
    resp.data.teams = teamsToSend;
    resp.send();
})

wss.onCommand('getCurrentGameState', null, function(req, resp) {
    if (clients.get(req.id).game === undefined) {
        resp.data.error = generalError.notInAGame
        resp.send()
        return
    }
    let game = clients.get(req.id).game
    let players = []
    let flags = []
    let teams = []
    game.getPlayers().forEach((player) => {
        players.push(createRepPlayer(player))
    })
    game.getFlags().forEach((flag) => {
        flags.push(createRepFlag(flag))
    })
    game.getTeams().forEach((team) => {
        teams.push(createRepTeam(team))
    })
    let boundary
    if (game.getBoundary() != undefined) {
        boundary = createRepGameBoundary(game.getBoundary())
    }
    
    let stateData = {
        players: players,
        flags: flags,
        teams: teams,
        boundary: boundary
    }
    resp.data.stateData = stateData
    resp.send()
})

wss.onCommand('setBoundary', ['latitude', 'longitude', 'direction'], function(req, resp) {
    let game = clients.get(req.id).game
    let latitude = req.data.latitude
    let longitude = req.data.longitude
    let direction = req.data.direction
    let error = game.createBoundary({latitude: latitude, longitude: longitude}, direction)
    if (error != undefined) {
        resp.data.error = error
        resp.send()
        return
    }
    resp.send()
})

wss.onCommand('getGameState', null, function(req, resp) {
    if (clients.get(req.id).game === undefined) {
        resp.data.error = 'getGameState: not in a game'
        resp.send();
        return;
    }
    let gameState = clients.get(req.id).game.getState();
    resp.data = {}
    resp.data.gameState = gameState;
    resp.send()
})

wss.onCommand('getPlayers', null, function(req, resp) {
    let game = clients.get(req.id).game
    if (game === undefined) {
        resp.data.error = 'getPlayers: player not in game';
        resp.send();
        return;
    }
    let players = []
    for (player of game.getPlayers()) {
        players.push(createRepPlayer(player))
    }
    resp.data.players = players;
    resp.send();
})

wss.onCommand('createTeam', ['teamName'], function(req, resp) {
    let teamName = req.data.teamName;
    let game = clients.get(req.id).game
    if (game === undefined) {
        resp.data.error = 'createTeam: not in game';
        resp.send();
        return;
    }
    let team = game.createTeam(teamName)
    let error = game.addTeam(team);
    if (error != undefined) {
        resp.data.error = error
    } else {
        let teamId = String(game.getTeams().length)
        teams.set(team, teamId)
        setUpTeamEvents(team, game)
        sendToAllInGame(game, createRepTeam(team), 'teamAdded')
    }
    resp.send();
})

//these will be on an authentication server eventually
app.post('/authenticate', (req, res) => {
    let data = req.body
    //console.log(data)
    let username = data.username
    let password = data.password

    if (userAccounts[username] === password) {
        if (userKeyMap[username] == undefined) {
            let authKey = uuid()
            userKeyMap.set(authKey, username)
            res.send({key: authKey})
        } else {
            res.send({key: userKeyMap[username]})
        }
    } else {
        res.send()
    }
})

app.post('/createAccount', (req, res) => {
    let data = req.body
    let username = data.username
    let password = data.password
    

    userAccounts[username] = password
    res.send({accountCreated: "yeah"})
})

//game data command
function setUpTeamEvents(team, game) {
    team.on('playerAdded', (player) => {
        sendToAllInGame(game, {id: playerToUser.getForward(player).id, team: teams.getForward(team)}, 'playerJoinedTeam')
    })

    team.on('flagAdded', (flag) => {
        sendToAllInGame(game, {teamId: teams.getForward(team), flag: createRepFlag(flag)}, 'flagAdded')
    })
}

function setUpPlayerEvents(player, game) {
    player.on('locationChanged', (location) => {
        sendToAllInGame(game, {playerId: playerToUser.getForward(player).id, newLocation: location}, 'locationUpdate')
    })

    player.on('tagged', (taggingPlayer) => {
        let data = {
            playerId: playerToUser.getForward(player).id, 
            taggingPlayerId: playerToUser.getForward(taggingPlayer).id
        }
        sendToAllInGame(game, data, 'playerTagged')
    })

    player.on('flagDropped', (flag) => {
        let data = {
            playerId: playerToUser.getForward(player).id,
            flagId: flags.getForward(flag),
            location: flag.getLocation()
        }
        sendToAllInGame(game, data, 'flagDropped')
    })

    player.on('pickedUpFlag', (flag) => {
        let data = {
            playerId: playerToUser.getForward(player).id,
            flagId: flags.getForward(flag)
        }
        sendToAllInGame(game, data, 'flagPickedUp')
    })
}

function setUpFlagEvents(flag, game) {

}

function initEvents(game) {
    game.on('locationUpdate', function(player) {
        /*let players = game.getPlayers();
        let data = {
            playerId : '' + playerToUser.getForward(player).id, 
            newLocation: location
        };
        for (player of players) {
            let sendKey = playerToUser(player).connectionKey
            wss.send('locationUpdate', data, sendKey);
         }*/
    })

    game.on('playerTagged', function(playerTagged, taggingPlayer) {
        /*let players = game.getPlayers();
        let data = {
            playerId: '' + playerToUser(playerTagged).id,
            taggingPlayerId: '' + playerToUser(taggingPlayer).id
        }
        for (player of players) {
            let sendKey = playerToUser.getForward(player).connectionKey
            wss.send('playerTagged', data, sendKey)
        }*/
    })

    game.on('playerAdded', function(playerAdded) {
        /*console.log('playerAdded playerToUser')
        console.log(playerToUser)
        let players = game.getPlayers();
        for (player of players) {
            let sendKey = playerToUser.getForward(player).connectionKey
            wss.send('playerAdded', createRepPlayer(playerAdded), sendKey)
        }*/
    })

    game.on('teamAdded', function(team) {
        /*let players = game.getPlayers();
        for (player of players) {
            let sendKey = playerToUser.getForward(player).connectionKey
            let teamId = teams.getForward(team)
            wss.send('teamAdded', teamId, sendKey);
        }*/
    })
    
    game.on('playerRemoved', function(player) {
        let players = game.getPlayers();
        for (player of players) {
            let sendKey = playerToUser.getForward(player)
            let id = playerToUser.id
            wss.send('playerRemoved', id, sendKey);
        }
    })

    game.on('flagAdded', function(flag, team) {
        /*let players = game.getPlayers();
        let flagAndTeam = {
            flagTd: createRepFlag(flag),
            teamId: teams.getForward(team)
        }
        for (player of players) {
            let sendKey = playerToUser.getForward(player).connectionKey
            wss.send('flagAdded', flagAndTeam, sendKey);
        }*/
    })

    game.on('playerJoinedTeam', function(player, team) {
        /*let teamAndPlayer = {
            id : playerId,
            teamId : teams.getForward(team)
        }
        for (player of game.getPlayers()) {
            let sendKey = playerToUser.getForward(player).connectionKey
            wss.send('playerJoinedTeam', teamAndPlayer, sendKey);
        }*/
    })

    game.on('gameStateChanged', function(gameState) {
        for (player of game.getPlayers()) {
            let sendKey = playerToUser.getForward(player).connectionKey
            wss.send('gameStateChanged', gameState, sendKey)
        }
    })

    game.on('flagPickedUp', function(flag, player) {
        /*let players = game.getPlayers()
        let flagIdAndPlayerId = {
            flagId: flags.getForward(flag),
            playerId: playerToUser.getForward(player).id
        }
        for (key in players) {
            let sendKey = playerToUser.getForward(player).connectionKey
            wss.send('flagPickedUp', flagIdAndPlayerId, sendKey)
        }*/
    })

    game.on('boundaryCreated', function(boundary) {
        let dataToSend = {
            boundary: createRepGameBoundary(boundary)
        }
        sendToAllInGame(game, dataToSend, 'boundaryCreated')
    })

    game.on('flagDropped', function(flag, player) {
        /*let dataToSend = {
            playerId: playerToUser.getForward(player).id,
            flagId: flags.getForward(flag),
            location: flag.getLocation()
        }
        for (player in game.getPlayers()) {
            let sendKey = playerToUse.get(player).connectionKey
            wss.send('flagDropped', dataToSend, sendKey)
        }*/
    })
}

function createRepPlayer(player) {
    let flag = player.flagHeld
    let flagId = null
    if (flag != undefined) {
        flagId = flag.id
    }
    return {
        name : player.name,
        id : playerToUser.getForward(player).id,
        flagHeld : flagId,
        location : player.getLocation(),
        leader : player.leader,
        isTagged : player.isTagged
    }
}

function createRepFlag(flag) {
    return {
        name : flag.name,
        id : flags.getForward(flag),
        location : flag.getLocation(),
        held : flag.held
    }
}

function createRepGameBoundary(boundary) {
    let teamSides = boundary.getSides()
    let sides = {
        greater: String(teams.getForward(teamSides.greater)),
        lesser: String(teams.getForward(teamSides.lesser))
    }
    console.log('from createRepBoundary')
    console.log(teams)
    console.log()
    console.log()
    console.log(boundary.getSides())
    return {
        center: boundary.getCenter(),
        direction: boundary.getDirection(),
        teamSides: sides,
        direction: boundary.getDirection()
    }
}

function createRepTeam(team) {
    let playerIds = []
    team.getPlayers().forEach((player) => {
        playerIds.push(playerToUser.getForward(player).id)
    })
    return {
        players: playerIds,
        flags: team.getFlags(),
        name: team.name,
        id: teams.getForward(team),
        ojectId: teams.getForward(team)
    }
}

function sendToAllInGame(game, data, command) {
    game.getPlayers().forEach((player) => {
        let sendKey = playerToUser.getForward(player).connectionKey
        wss.send(command, data, sendKey)
    })
}
