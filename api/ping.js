// ping-v1
module.exports = async function handler(req, res) {
  res.status(200).json({ alive: true, time: new Date().toISOString() });
};
