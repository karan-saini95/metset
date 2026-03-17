// send-v2
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

    // Parse subscription - handle double stringification
    let subscription = subData.result;
    if (typeof subscription === "string") subscription = JSON.parse(subscription);
    if (typeof subscription === "string") subscription = JSON.parse(subscription);

    // Parse medicines - handle double stringification
    let medicines = medsData.result;
    if (typeof medicines === "string") medicines = JSON.parse(medicines);
    if (typeof medicines === "string") medicines = JSON.parse(medicines);
    if (!Array.isArray(medicines)) medicines = JSON.parse(medicines);

    // Pacific Time (UTC-7 daylight saving, change to -8 in winter)
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

    res.status(200).json({ sent: due.length, time: hhmm, checked: medicines.length + " medicines" });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
