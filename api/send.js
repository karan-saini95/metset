// send-v3 multi-device
module.exports = async function handler(req, res) {
  try {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;

    // Get all keys to find subscriptions
    const keysRes = await fetch(`${url}/keys/push_subscription*`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const keysData = await keysRes.json();
    const subKeys = keysData.result || [];

    // Get medicines
    const medsRes = await fetch(`${url}/get/medicines`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const medsData = await medsRes.json();
    if (!medsData.result) return res.status(200).json({ skipped: "no medicines" });

    let medicines = medsData.result;
    if (typeof medicines === "string") medicines = JSON.parse(medicines);
    if (typeof medicines === "string") medicines = JSON.parse(medicines);
    if (!Array.isArray(medicines)) medicines = JSON.parse(medicines);

    // Pacific Time (UTC-7 daylight saving)
    const now = new Date();
    const ptOffset = -7 * 60 * 60 * 1000;
    const ptTime = new Date(now.getTime() + ptOffset);
    const hhmm = `${String(ptTime.getUTCHours()).padStart(2,"0")}:${String(ptTime.getUTCMinutes()).padStart(2,"0")}`;
    const dow = ptTime.getUTCDay();

    const due = medicines.filter(med => {
      const scheduledToday =
        med.frequency === "daily" ||
        (med.frequency === "weekly" && med.weekDay === dow) ||
        (med.frequency === "biweekly" && med.weekDay === dow);
      return scheduledToday && med.times.includes(hhmm);
    });

    if (due.length === 0) return res.status(200).json({ sent: 0, time: hhmm });

    const webpush = require("web-push");
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    let sent = 0;
    for (const subKey of subKeys) {
      try {
        const subRes = await fetch(`${url}/get/${subKey}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const subData = await subRes.json();
        if (!subData.result) continue;

        let subscription = subData.result;
        if (typeof subscription === "string") subscription = JSON.parse(subscription);
        if (typeof subscription === "string") subscription = JSON.parse(subscription);

        for (const med of due) {
          await webpush.sendNotification(
            subscription,
            JSON.stringify({
              title: `💊 Time for ${med.name}`,
              body: `${med.dose} — tap to open MediTrack`,
            })
          );
          sent++;
        }
      } catch(e) {
        // If a subscription is invalid (device uninstalled etc), skip it
        console.log(`Failed for ${subKey}:`, e.message);
      }
    }

    res.status(200).json({ sent, time: hhmm, devices: subKeys.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
