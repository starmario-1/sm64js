const { MarioMsg, MarioListMsg, Sm64JsMsg, ConnectedMsg } = require("./proto/mario_pb")
const http = require('http')
const util = require('util')
const zlib = require('zlib')
const deflate = util.promisify(zlib.deflate)
const port = 9208
const { iceServers } = require('@geckos.io/server')
const geckos = require('@geckos.io/server').default({
    portRange: {
        min: 10000,
        max: 12000
    },
    iceServers
})

const allChannels = {}
const stats = {}

let currentId = 0
const generateID = () => {
    if (++currentId > 1000000) currentId = 0
    return currentId
}

const broadcastData = (bytes) => {
    if (bytes.length == undefined) bytes = Buffer.from(bytes)
    geckos.raw.emit(bytes)
}

const processPlayerData = (channel_id, bytes) => {
    const decodedMario = MarioMsg.deserializeBinary(bytes)

    //ignoring validation for now
    if (allChannels[channel_id] == undefined) return

    /// server should always force the channel_id
    decodedMario.setChannelid(channel_id)

    /// Data is Valid
    allChannels[channel_id].decodedMario = decodedMario
    allChannels[channel_id].valid = 30
}

/// Every frame - 30 times per second
let marioListCounter = 0
setInterval(async () => {
    Object.values(allChannels).forEach(data => {
        if (data.valid > 0) data.valid--
        else if (data.decodedMario) data.channel.close()
    })

    const sm64jsMsg = new Sm64JsMsg()
    const mariolist = Object.values(allChannels).filter(data => data.decodedMario).map(data => data.decodedMario)
    const mariolistproto = new MarioListMsg()
    mariolistproto.setMarioList(mariolist)
    sm64jsMsg.setListMsg(mariolistproto)
    const bytes = sm64jsMsg.serializeBinary()
    const compressedMsg = await deflate(bytes)
    stats.marioListSize = compressedMsg.length
    broadcastData(compressedMsg)
    marioListCounter++

}, 33)

geckos.onConnection(async (channel) => {

    channel.my_id = generateID()
    allChannels[channel.my_id] = { valid: 0, channel }
    const sm64jsMsg = new Sm64JsMsg()
    const connectedMsg = new ConnectedMsg()
    connectedMsg.setChannelid(channel.my_id)
    sm64jsMsg.setConnectedMsg(connectedMsg)
    const bytes = sm64jsMsg.serializeBinary()
    const compressedMsg = await deflate(bytes)
    channel.raw.emit(compressedMsg, { reliable: true })

    channel.onRaw(bytes => {
        processPlayerData(channel.my_id, bytes)
    })

    channel.onDisconnect(() => {
        delete allChannels[channel.my_id]
    })
})


//// Express Static serving
const express = require('express')
const app = express()
const server = http.Server(app)
app.use(express.static(__dirname + '/dist'))

geckos.addServer(server)
server.listen(port, () => { console.log(' Listening to combined servers at ' + port) })