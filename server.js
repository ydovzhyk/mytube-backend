const mongoose = require('mongoose')
const app = require('./app')

mongoose.set('strictQuery', false)
require('dotenv').config()
require("./config/firebaseConfig");

const { DB_HOST, PORT = 4000 } = process.env

mongoose
  .connect(DB_HOST)
  .then(() => {
    console.log('✅ Database connection successful')

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Server listening on port ${PORT}`)
    })
  })
  .catch((error) => {
    console.log("❌ Database connection failed:", error.message)
    process.exit(1)
  })
