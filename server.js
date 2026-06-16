const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Store online users: { socketId: { username, socketId } }
const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log(`[CONNECT] Socket connected: ${socket.id}`);

  // ─── User Registration ───
  socket.on('register', (username) => {
    // Check if username already taken
    for (const [, user] of onlineUsers) {
      if (user.username === username) {
        socket.emit('register-error', 'Username sudah dipakai, coba yang lain.');
        return;
      }
    }

    onlineUsers.set(socket.id, { username, socketId: socket.id });
    console.log(`[REGISTER] ${username} (${socket.id})`);

    // Confirm registration
    socket.emit('registered', { username, socketId: socket.id });

    // Broadcast updated user list to everyone
    broadcastUserList();
  });

  // ─── Call Request ───
  socket.on('call-request', ({ to, callerName }) => {
    console.log(`[CALL] ${callerName} → ${to}`);
    const caller = onlineUsers.get(socket.id);
    if (!caller) return;

    io.to(to).emit('incoming-call', {
      from: socket.id,
      callerName: caller.username
    });
  });

  // ─── Call Accepted ───
  socket.on('call-accepted', ({ to }) => {
    console.log(`[ACCEPTED] Call accepted, notifying ${to}`);
    const callee = onlineUsers.get(socket.id);
    io.to(to).emit('call-accepted', {
      from: socket.id,
      calleeName: callee ? callee.username : 'Unknown'
    });
  });

  // ─── Call Rejected ───
  socket.on('call-rejected', ({ to }) => {
    console.log(`[REJECTED] Call rejected, notifying ${to}`);
    io.to(to).emit('call-rejected');
  });

  // ─── Call Ended ───
  socket.on('call-ended', ({ to }) => {
    console.log(`[ENDED] Call ended, notifying ${to}`);
    io.to(to).emit('call-ended');
  });

  // ─── WebRTC Signaling: SDP Offer ───
  socket.on('offer', ({ to, offer }) => {
    console.log(`[OFFER] ${socket.id} → ${to}`);
    io.to(to).emit('offer', { from: socket.id, offer });
  });

  // ─── WebRTC Signaling: SDP Answer ───
  socket.on('answer', ({ to, answer }) => {
    console.log(`[ANSWER] ${socket.id} → ${to}`);
    io.to(to).emit('answer', { from: socket.id, answer });
  });

  // ─── WebRTC Signaling: ICE Candidate ───
  socket.on('ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  // ─── Disconnect ───
  socket.on('disconnect', () => {
    const user = onlineUsers.get(socket.id);
    if (user) {
      console.log(`[DISCONNECT] ${user.username} (${socket.id})`);
      onlineUsers.delete(socket.id);
      // Notify all users that this person left (in case they were in a call)
      io.emit('user-disconnected', socket.id);
      broadcastUserList();
    }
  });
});

function broadcastUserList() {
  const users = [];
  for (const [, user] of onlineUsers) {
    users.push({ username: user.username, socketId: user.socketId });
  }
  io.emit('user-list', users);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 VoIP Server running at:`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://<your-ip>:${PORT}\n`);
  console.log(`Open 2 browser tabs to test voice/video calls!\n`);
});
