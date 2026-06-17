require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { authenticateToken } = require('./auth');
const { startScheduler } = require('./scheduler');
const authRoutes = require('./routes/auth');
const medicationRoutes = require('./routes/medications');
const sessionRoutes = require('./routes/sessions');
const notificationRoutes = require('./routes/notifications');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// CORS — allow your frontend origin
app.use(cors({
  origin: FRONTEND_URL,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}));

app.use(express.json());

// Socket.io — real-time sync
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Join a room per user so we can broadcast to specific users
  socket.on('join', (username) => {
    socket.join(`user:${username}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Make io accessible in routes for broadcasting
app.set('io', io);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/notifications', authenticateToken, notificationRoutes);
app.use('/api/medications', authenticateToken, medicationRoutes);
app.use('/api/sessions', authenticateToken, sessionRoutes);

// Config routes to expose non-sensitive environment keys dynamically to client
app.get('/api/config/groq-key', (req, res) => {
  res.json({ key: process.env.GROQ_API_KEY || '' });
});

// Serve static frontend files
app.use(express.static(__dirname));

// Serve tabibak.html for root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'tabibak.html'));
});

server.listen(PORT, () => {
  console.log(`Tabibak server running on http://localhost:${PORT}`);
  startScheduler();
});
