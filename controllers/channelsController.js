const { User } = require('../models/user')
const { Channel } = require('../models/channel')
const { RequestError } = require('../helpers')

// CREATE NEW CHANNEL
const createChannel = async (req, res, next) => {
  try {
    const { name } = req.body

    const exists = await Channel.findOne({ email })
    if (exists) throw RequestError(409, 'Email in use')

    const passwordHash = await bcrypt.hash(password, 10)
    const newUser = await User.create({ name, email, passwordHash, userAvatar })

    const { accessToken, refreshToken } = signTokens(newUser._id)
    setAuthCookies(res, { accessToken, refreshToken })

    return res.status(201).json({ user: toUserDto(newUser) })
  } catch (e) {
    next(e)
  }
}