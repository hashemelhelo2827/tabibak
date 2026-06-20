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
const notifDebugRoutes = require('./routes/notif-debug');
const mentorRoutes = require('./routes/mentors');

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

// Serialize BigInt from libSQL/SQLite across all routes
BigInt.prototype.toJSON = function() { return Number(this); };

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
app.use('/api/notif-debug', authenticateToken, notifDebugRoutes);
app.use('/api/mentors', authenticateToken, mentorRoutes);

// Config routes to expose non-sensitive environment keys dynamically to client
app.get('/api/config/groq-key', (req, res) => {
  res.json({
    keys: [process.env.GROQ_API_KEY, process.env.GROQ_API_KEY_FALLBACK, process.env.GROQ_API_KEY_THIRD, process.env.GROQ_API_KEY_FOURTH].filter(Boolean),
    medicalKeys: [process.env.GROQ_API_KEY_MEDICAL, process.env.GROQ_API_KEY_MEDICAL_FALLBACK, process.env.GROQ_API_KEY_THIRD, process.env.GROQ_API_KEY_FOURTH].filter(Boolean)
  });
});

app.get('/api/config/google-client-id', (req, res) => {
  res.json({ clientId: process.env.GOOGLE_CLIENT_ID || '' });
});

// Serve static frontend files
app.use(express.static(__dirname, {
  setHeaders(res, path) {
    if (path.endsWith('.html')) {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
}));

// Serve tabibak.html for root path (with no-cache to force fresh client code)
app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'tabibak.html'));
});

const schedulerFcmApp = startScheduler();
app.set('fcmApp', schedulerFcmApp);

server.listen(PORT, () => {
  console.log(`Tabibak server running on http://localhost:${PORT}`);
});
