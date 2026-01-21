const passport = require('passport')
const { Strategy } = require('passport-google-oauth2')
const bcrypt = require('bcryptjs')
const { nanoid } = require('nanoid')

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, BASE_URL_HEROKU, BASE_URL } =
  process.env

const { User } = require('../models/user')

let callbackURL
if (process.env.NODE_ENV === 'production') {
  callbackURL = `${BASE_URL_HEROKU}/api/google/callback`
} else {
  callbackURL = `${BASE_URL}/api/google/callback`
}

const googleParams = {
  clientID: GOOGLE_CLIENT_ID,
  clientSecret: GOOGLE_CLIENT_SECRET,
  callbackURL,
  passReqToCallback: true,
}

const googleCallback = async (
  req,
  accessToken,
  refreshToken,
  profile,
  done
) => {
  try {
    const date = new Date()
    const today = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`

    const { email, given_name, picture } = profile
    const user = await User.findOne({ email })

    if (user) {
      await User.findOneAndUpdate(
        { email },
        { referer: req.session.referer },
        { new: true }
      )
      return done(null, user)
    }

    const password = await bcrypt.hash(nanoid(), 10)

    const newUser = await User.create({
      email,
      passwordHash: password,
      name: given_name,
      userAvatar: picture,
      dateCreate: today,
      referer: req.session.referer,
    })

    return done(null, newUser)
  } catch (error) {
    done(error, false)
  }
}

const googleStrategy = new Strategy(googleParams, googleCallback)
passport.use('google', googleStrategy)

module.exports = passport

