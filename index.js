const WebSocket = require('ws').Server;
const {
    createWorker,
} = require("mediasoup");

const ws = new WebSocket({ port: 8888 });

console.log('服务起来了');

const streams = {
    stream1: null,
    stream2: null,
    stream3: null
}

const AUDIO_SSRC = 1111
const AUDIO_PT = 100
const VIDEO_SSRC = 2222
const VIDEO_PT = 101

const mediaCodecs = [
    {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2
    },
    {
        kind: 'video',
        mimeType: 'video/VP9',
        clockRate: 90000,
        parameters:
        {
            'x-google-start-bitrate': 1000
        },
        rtcpFeedback:
        [
            { type: 'nack' },
            { type: 'nack', parameter: 'pli' },
            { type: 'ccm', parameter: 'fir' },
            { type: 'goog-remb' },
            { type: 'transport-cc' }
        ]
    }
];

let mediaRouter, webrtcTransport, planTransport, producer, consumer;

async function init() {
    try {
        const worker = await createWorker();
        const router = mediaRouter = await worker.createRouter({
            mediaCodecs
        });

        const transport = planTransport = await router.createPlainTransport({
            listenIp: '10.0.0.195',
            comedia: true,
            rtcpMux: false,
        });

        const data = {
            id: transport.id,
            ip: transport.tuple.localIp,
            port: transport.tuple.localPort,
            rtcpPort: transport.rtcpTuple ? transport.rtcpTuple.localPort : undefined
        }

        producer = await transport.produce({
            kind: 'video',
            rtpParameters: {
                codecs: [{ mimeType: 'video/vp9', payloadType: VIDEO_PT, clockRate: 90000 }],
                encodings: [
                    { ssrc: VIDEO_SSRC }
                ]
            }
        });

        console.log(data);
    }
    catch (err) {
        console.error(err);
    }
}

init();

ws.on('connection', socket => {
    console.log('socket已连接');

    socket.on('message', msg => {
        msg = JSON.parse(msg);

        if (msg.type === 'initTransport') {
            console.log('remote:initTransport:', msg);
            _createTransport(socket);
        }

        if (msg.type === 'connect') {
            console.log('remote:connect:', msg);
            _connect(socket, msg.data);
        }

        if (msg.type === 'initConsumer') {
            console.log('remote:initConsumer:', msg);
            _createConsumer(socket, producer);
        }

        if (msg.type === 'finish') {
            console.log('remote:finish:', msg);
            _resumeConsumer(socket, consumer);
        }
    })

    socket.on('close', () => {
        webrtcTransport.close();
    });
});

async function _resumeConsumer(socket, consumer) {
    await consumer.resume();

    const data = {
        type: 'finish'
    };

    socket.send(JSON.stringify(data));
}

async function _createConsumer(socket, producer) {
    consumer = await webrtcTransport.consume({
        producerId: producer.id,
        rtpCapabilities: mediaRouter.rtpCapabilities,
        paused: true,
    });

    const data = {
        type: 'initConsumer',
        data: {
            producerId: producer.id,
            id: consumer.id,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            type: consumer.type,
            appData: producer.appData,
            producerPaused: consumer.producerPaused
        }
    };

    socket.send(JSON.stringify(data));

}

async function _connect(socket, data) {
    const { dtlsParameters } = data;

    await webrtcTransport.connect({ dtlsParameters });

    const data1 = {
        type: 'connect'
    };

    socket.send(JSON.stringify(data1));
}

async function _createTransport(socket) {
    const transport = webrtcTransport = await _createWebRtcTransport();

    // transport.on('routerclose', () => {
    //     console.log('routerclose');
    // });

    transport.observer.on('close', () => {
        console.log('触发了close事件');
    });

    let data = {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
        sctpParameters: transport.sctpParameters,
        routerRtpCapabilities: mediaRouter.rtpCapabilities
    };

    data = JSON.stringify({
        type: 'initTransport',
        data
    });

    socket.send(data);
}

function _createWebRtcTransport() {
    const defaultOption = {
        listenIps:
            [
                {
                    ip: process.env.MEDIASOUP_LISTEN_IP || '10.0.0.195',
                    announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || '10.0.0.195'
                }
            ],
        initialAvailableOutgoingBitrate: 1000000,
        minimumAvailableOutgoingBitrate: 600000,
        maxSctpMessageSize: 262144,
        // Additional options that are not part of WebRtcTransportOptions.
        maxIncomingBitrate: 1500000
    };

    const webRtcTransportOptions = {
        ...defaultOption,
        enableSctp: false,
        enableUdp: false,
        enableTcp: true,
    }

    return mediaRouter.createWebRtcTransport(webRtcTransportOptions);
}