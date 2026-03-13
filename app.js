const express = require('express')
const session = require('express-session')
const logger = require('morgan')
const cors = require('cors')
const cookieParser = require('cookie-parser')
require('dotenv').config()

const authRouter = require('./routes/api/auth')
const googleRouter = require('./routes/api/google')
const videosRouter = require('./routes/api/videos')
const channelsRouter = require('./routes/api/channels')
const playlistsRouter = require('./routes/api/playlists')
const visitorRouter = require('./routes/api/visitor')
const commentsRouter = require('./routes/api/comments')
const myPlaylistRouter = require('./routes/api/my-playlist')

const { NODE_ENV } = process.env

const app = express()
const formatsLogger = app.get('env') === 'development' ? 'dev' : 'short'

app.use(logger(formatsLogger))

/** CORS **/
const allowedOrigins = [
  'http://localhost:3000',
  // 'https://your-frontend-domain.com',
]

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true) // Postman / server-to-server
    if (allowedOrigins.includes(origin)) return cb(null, true)
    return cb(new Error(`CORS not allowed for origin: ${origin}`), false)
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  credentials: true,
}

app.use(cors(corsOptions))

app.use(express.json())
app.use(cookieParser())

/** Routes **/
app.use('/api/auth', authRouter)
app.use('/api/videos', videosRouter)
app.use('/api/channels', channelsRouter)
app.use('/api/playlists', playlistsRouter)
app.use('/api/my-playlists', myPlaylistRouter)
app.use('/api/visitor', visitorRouter)
app.use('/api/comments', commentsRouter)

/** Google OAuth session (only for /api/google) **/
app.use(
  '/api/google',
  session({
    secret: process.env.SESSION_SECRET, // окремий секрет
    resave: false,
    saveUninitialized: false, // не створювати порожні сесії
    cookie: {
      httpOnly: true,
      secure: NODE_ENV === 'production',
      sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
    },
  })
)
app.use('/api/google', googleRouter)

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() })
})

app.use('/api', (req, res) => {
  const payload = {
    message: 'API route not found',
    method: req.method,
    path: req.originalUrl,
  }
  if (NODE_ENV !== 'production') payload.query = req.query
  res.status(404).json(payload)
})

app.use((err, req, res, next) => {
  console.error(err)
  const status = err.status || 500
  res.status(status).json({ message: err.message || 'Server error' })
})

module.exports = app
