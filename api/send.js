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
    const medicines = JSON.parse(medsData.result);

    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    const dow = now.getDay();

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

    res.status(200).json({ sent: due.length, time: hhmm });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
