const webpush = require("web-push");

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

async function kvSet(key, value) {
  const res = await fetch(`${process.env.KV_REST_API_URL}/set/${key}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    body: JSON.stringify({ value: JSON.stringify(value) })
  });
  return res.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { subscription, medicines } = req.body;
  await kvSet("push_subscription", subscription);
  await kvSet("medicines", medicines);
  res.status(200).json({ ok: true });
};
