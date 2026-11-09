const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Mi servidor funciona!');
});

app.get('/video', async (req, res) => {
  const prompt = req.query.prompt || 'woman walking in city';
  const url = `https://gen.pollinations.ai/video/${encodeURIComponent(prompt)}?model=wan-fast&duration=5`;
  
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.MI_KEY}` }
  });
  const buffer = Buffer.from(await r.arrayBuffer());
  res.set('Content-Type', 'video/mp4');
  res.send(buffer);
});

app.listen(10000);
