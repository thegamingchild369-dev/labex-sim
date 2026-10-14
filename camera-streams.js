import { setPlayerFaceStream } from "./remote-players.js";

const rtcConfiguration = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

export class CameraStreams {
    constructor(multiplayer, remotePlayers, localAvatar) {
        this.multiplayer = multiplayer;
        this.remotePlayers = remotePlayers;
        this.localAvatar = localAvatar;
        this.players = {};
        this.localPlayerId = null;
        this.isAdmin = false;
        this.localStream = null;
        this.peers = new Map();
        this.peerRoles = new Map();
        this.pendingCandidates = new Map();
        this.rtcUnavailableReported = false;
    }

    setLocalStream(stream) {
        if (stream && !this.multiplayer.setCameraEnabled(true)) {
            throw new Error("Connect to the multiplayer server before sharing your camera.");
        }

        this.localStream = stream;
        setPlayerFaceStream(this.localAvatar, stream);
        if (!stream) {
            this.multiplayer.setCameraEnabled(false);
            for (const id of this.peers.keys()) {
                this.closePeer(id);
            }
        }
    }

    update(players, localPlayerId, isAdmin) {
        this.players = players;
        this.localPlayerId = localPlayerId;
        this.isAdmin = isAdmin;

        const roomPlayerIds = new Set(Object.keys(players));
        for (const id of this.peers.keys()) {
            if (!roomPlayerIds.has(id)) {
                this.closePeer(id);
            }
        }

        if (typeof RTCPeerConnection !== "function") {
            if (!this.rtcUnavailableReported) {
                console.error("This browser cannot display the live admin camera.");
                this.rtcUnavailableReported = true;
            }
            return;
        }

        const activeAdminIds = new Set();
        for (const [id, player] of Object.entries(players)) {
            if (id === localPlayerId || player?.isAdmin !== true ||
                player.cameraEnabled !== true) {
                continue;
            }

            activeAdminIds.add(id);
            if (!this.peers.has(id)) {
                this.startViewerPeer(id);
            }
        }

        for (const id of this.peers.keys()) {
            const role = this.peerRoles.get(id);
            const isValidViewerPeer = role === "viewer" && activeAdminIds.has(id);
            const isValidPublisherPeer = role === "publisher" && Boolean(this.localStream);
            if (!isValidViewerPeer && !isValidPublisherPeer) {
                this.closePeer(id);
            }
        }
    }

    async handleSignal(message) {
        const id = message?.from;
        const signal = message?.signal;
        const sender = this.players[id];
        if (typeof id !== "string" || !signal || typeof signal !== "object" || !sender) {
            return;
        }

        if (signal.type === "offer" && signal.description && this.localStream && this.isAdmin) {
            if (this.peers.has(id)) {
                this.closePeer(id);
            }
            const peer = this.createPeer(id, "publisher");
            await peer.setRemoteDescription(signal.description);
            for (const track of this.localStream.getVideoTracks()) {
                peer.addTrack(track, this.localStream);
            }
            await this.flushCandidates(id, peer);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            this.multiplayer.sendCameraSignal(id, {
                type: "answer",
                description: peer.localDescription
            });
            return;
        }

        const peer = this.peers.get(id);
        if (signal.type === "answer" && signal.description &&
            sender.isAdmin === true && sender.cameraEnabled === true &&
            this.peerRoles.get(id) === "viewer" && peer) {
            await peer.setRemoteDescription(signal.description);
            await this.flushCandidates(id, peer);
        } else if (signal.type === "candidate" && signal.candidate) {
            if (peer?.remoteDescription) {
                await peer.addIceCandidate(signal.candidate);
            } else if (peer || this.localStream) {
                const candidates = this.pendingCandidates.get(id) || [];
                candidates.push(signal.candidate);
                this.pendingCandidates.set(id, candidates);
            }
        }
    }

    startViewerPeer(id) {
        const peer = this.createPeer(id, "viewer");
        peer.addTransceiver("video", { direction: "recvonly" });
        peer.createOffer()
            .then(offer => peer.setLocalDescription(offer))
            .then(() => {
                this.multiplayer.sendCameraSignal(id, {
                    type: "offer",
                    description: peer.localDescription
                });
            })
            .catch(error => {
                console.error(`Could not start the admin camera connection for ${id}:`, error);
                this.closePeer(id);
            });
    }

    createPeer(id, role) {
        const peer = new RTCPeerConnection(rtcConfiguration);
        this.peers.set(id, peer);
        this.peerRoles.set(id, role);
        peer.onicecandidate = event => {
            if (event.candidate) {
                this.multiplayer.sendCameraSignal(id, {
                    type: "candidate",
                    candidate: event.candidate
                });
            }
        };
        peer.ontrack = event => {
            if (this.peers.get(id) === peer) {
                const stream = event.streams[0] || new MediaStream([event.track]);
                this.remotePlayers.setCameraStream(id, stream);
            }
        };
        peer.onconnectionstatechange = () => {
            if (peer.connectionState === "failed") {
                console.error(`Admin camera connection failed for player ${id}.`);
                this.closePeer(id);
            }
        };
        return peer;
    }

    async flushCandidates(id, peer) {
        const candidates = this.pendingCandidates.get(id) || [];
        this.pendingCandidates.delete(id);
        for (const candidate of candidates) {
            await peer.addIceCandidate(candidate);
        }
    }

    closePeer(id) {
        const peer = this.peers.get(id);
        if (peer) {
            peer.close();
            this.peers.delete(id);
        }
        this.peerRoles.delete(id);
        this.pendingCandidates.delete(id);
        this.remotePlayers.setCameraStream(id, null);
    }
}
