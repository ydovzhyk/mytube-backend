const express = require("express");
const { authorize } = require("../../middlewares");

const router = express.Router();

// // Subscriptions (спочатку!)
// router.get("/me/subscriptions", authorize /*, getMySubscriptions */);
// router.post("/:id/subscribe", authorize /*, subscribeToChannel */);
// router.delete("/:id/subscribe", authorize /*, unsubscribeFromChannel */);

// // Public (handle теж до :id)
// router.get("/handle/:handle", /* getChannelByHandle */);

// // Channel videos (до :id)
// router.get("/:id/videos", /* getChannelVideos */);

// // Single channel (після всього)
// router.get("/:id", /* getChannel */);

// // Owner
// router.post("/", authorize /*, createChannel */);
// router.patch("/:id", authorize /*, updateChannel */);
// router.delete("/:id", authorize /*, deleteChannel */);

module.exports = router;

