// save-v3 multi-device
const webpush = require("web-push");

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { subscription, medicines, deviceId } = req.body;
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;

    // Store subscription under device-specific key
    const subKey = `push_subscription_${deviceId || "default"}`;
    await fetch(`${url}/set/${subKey}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(JSON.stringify(subscription))
    });

    // Medicines are shared — same schedule for all devices
    await fetch(`${url}/set/medicines`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(JSON.stringify(medicines))
    });

    res.status(200).json({ ok: true, deviceId: deviceId || "default" });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
