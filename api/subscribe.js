const { Redis } = require("@upstash/redis");
const webpush = require("web-push");

const redis = Redis.fromEnv();

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { subscription, medicines } = req.body;
  await redis.set("push_subscription", JSON.stringify(subscription));
  await redis.set("medicines", JSON.stringify(medicines));
  res.status(200).json({ ok: true });
};
