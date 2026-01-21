const handleSaveErrors = (error, data, next) => {
  const { code, name } = error;

  if (code === 11000 && name === "MongoServerError") {
    error.status = 409; 
  } else if (error.name === "ValidationError") {
    error.status = 400;
  } else {
    error.status = 500; 
  }

  next(error); 
};

module.exports = handleSaveErrors;
