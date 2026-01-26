const admin = require("firebase-admin");

if (!process.env.PRIVATE_KEY_ID || !process.env.PRIVATE_KEY) {
  throw new Error("Firebase env vars missing: PRIVATE_KEY_ID or PRIVATE_KEY");
}

const serviceAccount = {
  project_id: "mytube-dev",
  private_key_id: process.env.PRIVATE_KEY_ID,
  private_key: process.env.PRIVATE_KEY.replace(/\\n/g, "\n"),
  client_email: "firebase-adminsdk-fbsvc@mytube-dev.iam.gserviceaccount.com",
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "mytube-dev.firebasestorage.app",
  });
}

const bucket = admin.storage().bucket();

bucket
  .getMetadata()
  .then(() => {
    console.log("✅ Firebase Storage connected:", bucket.name);
  })
  .catch((err) => {
    console.error("❌ Firebase Storage connection failed:", err.message);
  });

module.exports = { admin, bucket };
