const { isValidObjectId } = require("mongoose");
const { RequestError } = require("../helpers");

const isValidId = (req, res, next) => {
  const userId = req.params.userId || req.body.userId;

  try {
    const objectId = userId;
    if (!isValidObjectId(objectId)) {
      throw new Error("is not a valid ObjectId");
    }
    next();
  } catch (error) {
    next(RequestError(400, error.message));
  }
};

module.exports = isValidId;
