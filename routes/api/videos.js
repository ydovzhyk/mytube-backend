const express = require("express");
const { ctrlWrapper } = require("../../helpers");
const ctrl = require("../../controllers/videosContoller");
const { authorize } = require("../../middlewares");
const { uploadVideo } = require("../../middlewares/uploadVideo");

const router = express.Router();

router.get("/", ctrlWrapper(ctrl.getVideosController));

router.post(
  "/upload",
  authorize,
  uploadVideo.fields([
    { name: "video", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  ctrlWrapper(ctrl.uploadVideoController)
);

module.exports = router;