const webpush = require("web-push");

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

async function kvGet(key) {
  const res = await fetch(`${process.env.KV_REST_API_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
  });
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : null;
}

module.exports = async function handler(req, res) {
  const subscription = await kvGet("push_subscription");
  const medicines = await kvGet("medicines");
  if (!subscription || !medicines) return res.status(200).json({ skipped: "no data" });

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

  for (const med of due) {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: `💊 Time for ${med.name}`,
        body: `${med.dose} — tap to open MediTrack`,
      })
    );
  }

  res.status(200).json({ sent: due.length });
};
