const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files
app.use(express.static('public'));

// Store current video state
let currentVideoState = {
    url: '',
    videoId: '',
    videoType: 'youtube', // youtube, gdrive, vimeo
    isPlaying: false,
    currentTime: 0,
    lastUpdate: Date.now()
};

let connectedUsers = new Map();
let messageHistory = [];
let peerConnections = new Map(); // Store peer connection info

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('user-join', (userData) => {
        connectedUsers.set(socket.id, userData);
        
        io.emit('system-message', {
            message: `${userData.username} joined the virtual date! 💕`,
            timestamp: Date.now()
        });

        if (currentVideoState.videoId) {
            socket.emit('video-sync', currentVideoState);
        }

        messageHistory.forEach(msg => {
            socket.emit('new-message', msg);
        });

        io.emit('user-count', connectedUsers.size);
        
        // Notify all users about new peer for voice chat
        socket.broadcast.emit('peer-joined', { 
            peerId: socket.id,
            username: userData.username 
        });
        
        // Send list of existing peers to new user
        const existingPeers = Array.from(connectedUsers.entries())
            .filter(([id]) => id !== socket.id)
            .map(([id, user]) => ({ peerId: id, username: user.username }));
        
        socket.emit('existing-peers', existingPeers);
    });

    socket.on('send-message', (messageData) => {
        const message = {
            ...messageData,
            timestamp: Date.now(),
            id: socket.id
        };

        messageHistory.push(message);
        if (messageHistory.length > 50) {
            messageHistory = messageHistory.slice(-50);
        }

        io.emit('new-message', message);

        const triggerWords = ['ex', 'bc', 'wtf', 'heart', 'momo', 'aditya', 'xd'];
        const lowerMessage = messageData.content.toLowerCase();
        triggerWords.forEach(trigger => {
            if (lowerMessage.includes(trigger)) {
                io.emit('trigger-effect', { trigger, user: messageData.username });
            }
        });
    });

    socket.on('load-video', (videoData) => {
        currentVideoState = {
            url: videoData.url,
            videoId: videoData.videoId,
            videoType: videoData.videoType || 'youtube',
            isPlaying: false,
            currentTime: 0,
            lastUpdate: Date.now()
        };

        const user = connectedUsers.get(socket.id);
        io.emit('video-loaded', {
            ...videoData,
            user: user?.username || 'Someone'
        });
    });

    socket.on('video-playpause', (data) => {
        currentVideoState.isPlaying = data.isPlaying;
        currentVideoState.currentTime = data.currentTime;
        currentVideoState.lastUpdate = Date.now();

        const user = connectedUsers.get(socket.id);
        
        socket.broadcast.emit('video-playpause-sync', {
            isPlaying: data.isPlaying,
            currentTime: data.currentTime,
            user: user?.username || 'Someone'
        });
        
        io.emit('system-message', {
            message: `${user?.username || 'Someone'} ${data.isPlaying ? 'played ▶️' : 'paused ⏸️'} the video`,
            timestamp: Date.now()
        });
    });

    socket.on('video-progress', (data) => {
        currentVideoState.currentTime = data.currentTime;
        currentVideoState.lastUpdate = Date.now();
        
        socket.broadcast.emit('video-progress-sync', {
            currentTime: data.currentTime
        });
    });

    socket.on('sync-request', (data) => {
        const user = connectedUsers.get(socket.id);
        
        if (data) {
            currentVideoState.currentTime = data.currentTime;
            currentVideoState.isPlaying = data.isPlaying;
            currentVideoState.lastUpdate = Date.now();
        }
        
        io.emit('sync-requested', {
            user: user?.username || 'Someone'
        });
        
        io.emit('video-sync', currentVideoState);
    });

    socket.on('give-award', (awardData) => {
        const user = connectedUsers.get(socket.id);
        io.emit('award-given', {
            award: awardData,
            user: user?.username || 'Someone'
        });
    });

    socket.on('surprise-me', (data) => {
        const user = connectedUsers.get(socket.id);
        
        io.emit('surprise-popup', {
            message: data.message,
            user: user?.username || 'Someone'
        });
        
        io.emit('trigger-effect', { trigger: 'wholesome', user: user?.username });
    });

    socket.on('typing-start', () => {
        const user = connectedUsers.get(socket.id);
        if (user) {
            socket.broadcast.emit('user-typing', {
                username: user.username,
                isTyping: true
            });
        }
    });

    socket.on('typing-stop', () => {
        const user = connectedUsers.get(socket.id);
        if (user) {
            socket.broadcast.emit('user-typing', {
                username: user.username,
                isTyping: false
            });
        }
    });

    // WebRTC signaling for voice chat
    socket.on('webrtc-offer', (data) => {
        socket.to(data.target).emit('webrtc-offer', {
            offer: data.offer,
            sender: socket.id
        });
    });

    socket.on('webrtc-answer', (data) => {
        socket.to(data.target).emit('webrtc-answer', {
            answer: data.answer,
            sender: socket.id
        });
    });

    socket.on('webrtc-ice-candidate', (data) => {
        socket.to(data.target).emit('webrtc-ice-candidate', {
            candidate: data.candidate,
            sender: socket.id
        });
    });

    socket.on('voice-status', (data) => {
        const user = connectedUsers.get(socket.id);
        socket.broadcast.emit('peer-voice-status', {
            peerId: socket.id,
            isTalking: data.isTalking,
            username: user?.username
        });
    });

    socket.on('disconnect', () => {
        const user = connectedUsers.get(socket.id);
        if (user) {
            io.emit('system-message', {
                message: `${user.username} left the date 😢`,
                timestamp: Date.now()
            });
        }
        
        connectedUsers.delete(socket.id);
        io.emit('user-count', connectedUsers.size);
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Virtual Date Server running on port ${PORT}`);
    console.log(`💕 Your date platform is ready at http://localhost:${PORT}`);
});
