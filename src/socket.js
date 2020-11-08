import geckos from '@geckos.io/client'
import * as Multi from "./game/MultiMarioManager"
import zlib from "zlib"
import { Sm64JsMsg, PingMsg } from "../proto/mario_pb"

const url = new URL(window.location.href)
const port = url.protocol == "https:" ? 443 : 9208

const channel = geckos({ port })

export const networkData = {
    playerInteractions: true,
    remotePlayers: {},
    myChannelID: -1,
    lastSentSkinData: {}
}

export const gameData = {}

const sendData = (bytes) => {
    if (bytes.length == undefined) bytes = Buffer.from(bytes)
    channel.raw.emit(bytes)
}

channel.onConnect((err) => {

    if (err) { console.log(err); return }

    channel.readyState = 1

    channel.onRaw((bytes) => {
        zlib.inflate(new Uint8Array(bytes), (err, buffer) => {
            if (err) {
                console.error(`decompression fail ${err}`)
                return
            }
            const sm64jsMsg = Sm64JsMsg.deserializeBinary(buffer)
            switch (sm64jsMsg.getMessageCase()) {
                case Sm64JsMsg.MessageCase.LIST_MSG:
                    if (!multiplayerReady()) return
                    const listMsg = sm64jsMsg.getListMsg()
                    const marioList = listMsg.getMarioList()
                    const messageCount = listMsg.getMessagecount()
                    Multi.recvMarioData(marioList, messageCount)
                    break
                case Sm64JsMsg.MessageCase.CONNECTED_MSG:
                    const connectedMsg = sm64jsMsg.getConnectedMsg()
                    const channelID = connectedMsg.getChannelid()
                    networkData.myChannelID = channelID
                    break
                case Sm64JsMsg.MessageCase.PING_MSG:
                    measureAndPrintLatency(sm64jsMsg.getPingMsg())
                    break
                case Sm64JsMsg.MessageCase.MESSAGE_NOT_SET:
                default:
                    throw new Error(`unhandled case in switch expression: ${sm64jsMsg.getMessageCase()}`)
            }
        })
    })

    channel.on('id', msg => { networkData.myChannelID = msg.id })

    channel.onDisconnect(() => { channel.readyState = 0; window.latency = null })
})

const measureAndPrintLatency = (ping_proto) => {
    const startTime = ping_proto.getTime()
    const endTime = performance.now()
    window.latency = parseInt(endTime - startTime)
}


const multiplayerReady = () => {
    return channel && channel.readyState == 1 && gameData.marioState && networkData.myChannelID != -1
}

const updateConnectedMsg = () => {
    const elem = document.getElementById("connectedMsg")
    const numPlayers = networkData.numOnline ? networkData.numOnline : "?"
    if (channel && channel.readyState == 1) {
        elem.innerHTML = "Connected To Server  -  " + (numPlayers).toString() + " Players Online"
        elem.style.color = "lawngreen"
    } else {
        elem.innerHTML = "Not connected to server - Refresh the page"
        elem.style.color = "red"
    }
}


export const post_main_loop_one_iteration = (frame) => {

    if (frame % 30 == 0) updateConnectedMsg()

    if (multiplayerReady()) {
        sendData(Multi.createMarioProtoMsg())

        if (frame % 150 == 0) {
            /// ping to measure latency
            const sm64jsMsg = new Sm64JsMsg()
            const pingmsg = new PingMsg()
            pingmsg.setTime(performance.now())
            sm64jsMsg.setPingMsg(pingmsg)
            sendData(sm64jsMsg.serializeBinary())
        }

    }

}
