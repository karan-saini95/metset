const { Redis } = require("@upstash/redis");
const webpush = require("web-push");

const redis = Redis.fromEnv();

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

module.exports = async function handler(req, res) {
  const subRaw = await redis.get("push_subscription");
  const medsRaw = await redis.get("medicines");
  if (!subRaw || !medsRaw) return res.status(200).json({ skipped: "no data" });

  const subscription = typeof subRaw === "string" ? JSON.parse(subRaw) : subRaw;
  const medicines = typeof medsRaw === "string" ? JSON.parse(medsRaw) : medsRaw;

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
