const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static('public'));

let currentVideoState = {
    url: '',
    videoId: '',
    isPlaying: false,
    currentTime: 0,
    lastUpdate: Date.now()
};

let connectedUsers = new Map();
let messageHistory = [];

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('user-join', (userData) => {
        connectedUsers.set(socket.id, userData);
        
        io.emit('system-message', {
            message: `${userData.username} joined! 💕`,
            timestamp: Date.now()
        });

        if (currentVideoState.videoId) {
            socket.emit('video-sync', currentVideoState);
        }

        messageHistory.forEach(msg => {
            socket.emit('new-message', msg);
        });

        io.emit('user-count', connectedUsers.size);
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

        const triggerWords = ['love', 'heart', 'lol', 'haha', 'cute', 'fire', 'wow'];
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
            isPlaying: false,
            currentTime: 0,
            lastUpdate: Date.now()
        };

        io.emit('video-loaded', {
            ...videoData,
            user: videoData.user
        });
    });

    socket.on('video-playpause', (data) => {
        currentVideoState.isPlaying = data.isPlaying;
        currentVideoState.currentTime = data.currentTime;
        currentVideoState.lastUpdate = Date.now();

        socket.broadcast.emit('video-playpause-sync', {
            isPlaying: data.isPlaying,
            currentTime: data.currentTime
        });
    });

    socket.on('sync-request', (data) => {
        if (data) {
            currentVideoState.currentTime = data.currentTime;
            currentVideoState.isPlaying = data.isPlaying;
            currentVideoState.lastUpdate = Date.now();
        }
        
        io.emit('video-sync', currentVideoState);
    });

    socket.on('give-award', (awardData) => {
        io.emit('award-given', awardData);
    });

    socket.on('gdrive-loaded', (data) => {
        socket.broadcast.emit('gdrive-loaded', data);
    });

    socket.on('voice-room-share', (data) => {
        socket.broadcast.emit('voice-room-invite', data);
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

    socket.on('disconnect', () => {
        const user = connectedUsers.get(socket.id);
        if (user) {
            io.emit('system-message', {
                message: `${user.username} left 😢`,
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
    console.log(`🚀 Server running on port ${PORT}`);
});
