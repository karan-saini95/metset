// send-v1
module.exports = async function handler(req, res) {
  try {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;

    const [subRes, medsRes] = await Promise.all([
      fetch(`${url}/get/push_subscription`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${url}/get/medicines`, { headers: { Authorization: `Bearer ${token}` } })
    ]);

    const subData = await subRes.json();
    const medsData = await medsRes.json();

    if (!subData.result || !medsData.result) {
      return res.status(200).json({ skipped: "no data" });
    }

    const subscription = JSON.parse(subData.result);
    const medicines = typeof medsData.result === "string" ? JSON.parse(medsData.result) : medsData.result;
const medsArray = Array.isArray(medicines) ? medicines : JSON.parse(medicines);
const now = new Date();
// Pacific Time (UTC-8 standard, UTC-7 daylight saving)
const ptOffset = -7 * 60 * 60 * 1000; // UTC-7 (daylight saving, adjust to -8 in winter)
const ptTime = new Date(now.getTime() + ptOffset);
const hhmm = `${String(ptTime.getUTCHours()).padStart(2,"0")}:${String(ptTime.getUTCMinutes()).padStart(2,"0")}`;
const dow = ptTime.getUTCDay();
   const due = medsArray.filter(med => {
  const scheduledToday =
    med.frequency === "daily" ||
    (med.frequency === "weekly" && med.weekDay === dow) ||
    (med.frequency === "biweekly" && med.weekDay === dow);
  return scheduledToday && med.times.includes(hhmm);
});
    const webpush = require("web-push");
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    for (const med of due) {
      await webpush.sendNotification(
        subscription,
        JSON.stringify({
          title: `💊 Time for ${med.name}`,
          body: `${med.dose} — tap to open MediTrack`,
        })
      );
    }

    res.status(200).json({ sent: due.length, time: hhmm });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
