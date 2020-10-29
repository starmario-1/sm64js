import geckos from '@geckos.io/client'
import * as Multi from "./game/MultiMarioManager"

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

    channel.onRaw((message) => {
        const bytes = new Uint8Array(message)
        if (multiplayerReady()) Multi.recvMarioData(bytes)
    })

    channel.on('id', msg => { networkData.myChannelID = msg.id })

    channel.onDisconnect(() => { channel.readyState = 0 })
})

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

    if (multiplayerReady() && frame % 1 == 0) {
        sendData(Multi.createMarioProtoMsg())
    }

}

