const path = require('path');
const mkdirp = require('mkdirp')
var DatGateway = require('dat-gateway')
// var ram = require('random-access-memory')
// var Dat = require('dat-node')
var DatArchive = require('node-dat-archive')
const uuidv4 = require('uuid/v4');
const fs = require('fs');
const {DatSessionDataExtMsg} = require('@beaker/dat-session-data-ext-msg')
const express = require('express');
const expressWebSocket = require('express-ws');
const websocketStream = require('websocket-stream/stream');
const app = express();
// extend express app with app.ws()
expressWebSocket(app, null, {
    // ws options here
    perMessageDeflate: false,
});
var cors = require('cors')
var bodyParser = require('body-parser');
app.use(cors())
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

console.log("cwd: " + process.cwd())
console.log("__dirname: " + __dirname)

const datGatewayName = 'dat-gateway';
const max = 20;
const period = 60 * 1000 // every minute
const port = 3000
const ttl = 43200 * 60 * 1000 // 30 days
const dat = {temp:false}
const redirect = true

var datSessionDataExtMsg = new DatSessionDataExtMsg()

let peerList = [];

var dir = path.join(__dirname, datGatewayName)
console.log("redirect: " + redirect)
mkdirp.sync(dir) // make sure it exists
const gateway = new DatGateway({ dir, dat, max, period, ttl, redirect })
gateway
    .load()
    .then(() => {
        return gateway.listen(port)
    })
    .then(function () {
        console.log('[dat-gateway] Now listening on port ' + port)
        datSessionDataExtMsg.on('session-data', onSessionDataMsg)
    })
    .catch(console.error)

gateway.on('error', (error) => {
    console.log("error in gateway: " + error)
})

app.ws('/peerList', function(ws, req) {
    // convert ws instance to stream
    const stream = websocketStream(ws, {
        // websocket-stream options here
        binary: false,
    });


    gateway.on('join', (dat) => {
        let connections = dat.network.connections.length
        let key = dat.options.key
        console.log(key + " has " + connections + " peers.")
        if (typeof dat.archive !== 'undefined') {
            peerList = dat.archive.metadata.peers.map(internalPeerObj => createWebAPIPeerObj(dat.archive, internalPeerObj))
            console.log("peerList" + JSON.stringify(peerList))
            try {
                if (peerList.length > 0) {
                    stream.write("peerList:" + JSON.stringify(peerList))
                }
                // ws.send("peerList:" + JSON.stringify(peerList))
                // fs.createReadStream(JSON.stringify(peerList)).pipe(stream);
                // peerList.pipe(stream);
            } catch(err) {
                console.log("err:" + err)
            }
        }
    })

    ws.on('error', (err) => console.log('error: ' + err));

    // fs.createReadStream(peerList).pipe(stream);
    // ws.on('message', function(msg) {
    //     console.log(msg);
    // });
    // console.log('socket', req.testing);
});

app.post('/create', async function (request, response) {
    console.log("Creating a datArchive")
    var title = request.body.title;
    var description = request.body.description;
    var type = request.body.type;
    var author = request.body.author;
    var uuid = uuidv4();
    // var localPath = dir + '/';
    var localPath = dir + '/' + uuid;
    var datOptions = {latest: true}
    var netOptions = null;
    let data = {localPath, datOptions, netOptions, title, description, type, author}
    console.log("create " + JSON.stringify(data))
    var archive = await DatArchive.create(data)
    let url = archive.url
    data.url = url
    const newDir = url.replace('dat://','')
    const newPath = dir + '/' + newDir;
    fs.rename(localPath, newPath, (err) => {
        if (err) throw err;
        console.log('Rename complete!');
    });
    console.log("data with url: " + JSON.stringify(data))
    response.send(JSON.stringify(data))
});

app.post('/getInfo', async function (request, response) {
    console.log("getInfo for a DatArchive")
    var url = request.body.url;
    var opts = request.body.opts;
    var datName = url.replace('dat://','')
    console.log("getInfo for  " + url)
    // var info = await DatArchive.getInfo(url)
    var localPath = dir + '/' + datName
    var archive = await DatArchive.load({
        localPath:  localPath
    })
    var info = await archive.getInfo(url)
    console.log("getInfo: " + JSON.stringify(info))
    response.send(JSON.stringify(info))
});

app.post('/mkdir', async function (request, response) {
    console.log("getInfo for a DatArchive")
    var filename = request.body.filename;
    var url = request.body.url;
    var datName = url.replace('dat://','')
    var filePath = dir + '/' + datName + '/' + filename + '/';
    var localPath = dir + '/' + datName
    // let data = {localPath, title, description, type, author}
    console.log("mkdir for  " + filename)
    // var archive = new DatArchive(url)
    var archive = await DatArchive.load({
        localPath:  localPath
    })
    var info = await archive.mkdir(filename)
    console.log("data with url: " + JSON.stringify(info))
    response.send(JSON.stringify(info))
});

app.post('/writeFile', async function (request, response) {
    console.log("writeFile for a DatArchive")
    var filename = request.body.filename;
    var url = request.body.url;
    var datName = url.replace('dat://','')
    var filePath = dir + '/' + datName + '/' + filename + '/';
    var localPath = dir + '/' + datName
    // let data = {localPath, title, description, type, author}
    console.log("writeFile for  " + filename)
    // var archive = new DatArchive(url)
    var archive = await DatArchive.load({
        localPath:  localPath
    })
    var info = await archive.writeFile(filename)
    console.log("data : " + JSON.stringify(info))
    response.send(JSON.stringify(info))
});

app.listen(3001);

function getSessionData (archive) {
    return decodeSessionData(datSessionDataExtMsg.getLocalSessionData(archive))
}
exports.getSessionData = getSessionData

function onSessionDataMsg (archive, internalPeerObj, sessionData) {
    archive._datPeersEvents.emit('session-data', {
        peerId: getPeerId(internalPeerObj),
        sessionData: decodeSessionData(sessionData)
    })
}

function getPeerId (internalPeerObj) {
    var feedStream = internalPeerObj.stream
    var protocolStream = feedStream.stream
    return protocolStream.remoteId ? protocolStream.remoteId.toString('hex') : null
}

function getPeerSessionData (archive, peerId) {
    return decodeSessionData(datSessionDataExtMsg.getSessionData(archive, peerId))
}

function createWebAPIPeerObj (archive, internalPeerObj) {
    var id = getPeerId(internalPeerObj)
    var sessionData = getPeerSessionData(archive, id)
    return {id, sessionData}
}

function decodeSessionData (sessionData) {
    if (!sessionData || sessionData.length === 0) return null
    try {
        return JSON.parse(sessionData.toString('utf8'))
    } catch (e) {
        console.error('Failed to parse local session data', e, sessionData)
        return null
    }
}

// Dat(ram, function (err, dat) {
//     if (err) throw err
//
//     var network = dat.joinNetwork()
//     network.once('connection', function () {
//         console.log('Connected')
//     })
//     dat.network.on('connection', function () {
//         console.log('connected to', network.connections.length, 'peers')
//     })
//
//     var archive = dat.archive;
//
// })
