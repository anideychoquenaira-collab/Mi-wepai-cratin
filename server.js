const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mi Wepai Cratin</title>
<style>
  body { font-family: Arial; background: #0f0f1a; color: white; text-align: center; padding: 20px; margin: 0; }
  h1 { font-size: 28px; }
  textarea { width: 90%; max-width: 500px; height: 80px; padding: 12px; border-radius: 12px; border: none; font-size: 16px; }
  button { background: #a855f7; color: white; border: none; padding: 15px 30px; font-size: 18px; border-radius: 12px; margin-top: 15px; cursor: pointer; font-weight: bold; width: 90%; max-width: 500px; }
  button:disabled { background: #555; }
  #status { margin-top: 20px; font-size: 16px; color: #facc15; }
  video { width: 90%; max-width: 500px; margin-top: 20px; border-radius: 12px; display: none; }
  .ejemplo { background: #1e1e2e; padding: 10px; border-radius: 10px; margin: 10px auto; max-width: 500px; font-size: 14px; cursor: pointer; }
</style>
</head>
<body>
  <h1>🎬 Mi Wepai Cratin</h1>
  <p>Genera videos GRATIS con Wan</p>
  <textarea id="prompt" placeholder="Escribe tu idea... Ej: A cute orange cat dancing happily, colorful room, cartoon style"></textarea>
  <br>
  <button id="btn" onclick="generar()">✨ Generar Video Gratis</button>
  <div id="status"></div>
  <video id="video" controls playsinline></video>
  <p style="margin-top:30px;">Prueba con estos:</p>
  <div class="ejemplo" onclick="document.getElementById('prompt').value='A cute orange cat dancing happily, colorful room, cartoon style'">🐱 Gato bailando</div>
  <div class="ejemplo" onclick="document.getElementById('prompt').value='Minecraft creeper dancing, funny, colorful'">⛏️ Creeper de Minecraft bailando</div>
  <div class="ejemplo" onclick="document.getElementById('prompt').value='A superhero girl with purple hair flying over a city, cinematic'">🦸‍♀️ Superhero Nova volando</div>
<script>
async function generar() {
  const prompt = document.getElementById('prompt').value;
  const btn = document.getElementById('btn');
  const status = document.getElementById('status');
  const video = document.getElementById('video');
  if(!prompt) { alert('Escribe algo primero'); return; }
  btn.disabled = true;
  btn.innerText = '⏳ Generando... espera 1 min';
  status.innerText = 'Generando tu video con Wan (gratis)... no cierres la pagina';
  video.style.display = 'none';
  try {
    const res = await fetch('/generate', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ prompt })
    });
    const data = await res.json();
    if(data.videoUrl) {
      status.innerText = '✅ ¡Listo! Aqui esta tu video';
      video.src = data.videoUrl;
      video.style.display = 'block';
      video.play();
    } else {
      status.innerText = '❌ Error: ' + (data.error || 'Intenta de nuevo');
    }
  } catch(e) {
    status.innerText = '❌ Error de conexion, intenta de nuevo';
  }
  btn.disabled = false;
  btn.innerText = '✨ Generar Video Gratis';
}
</script>
</body>
</html>
  `);
});

// ESTA ES LA PARTE QUE GENERA EN TU APP - CORREGIDA
app.post('/generate', async (req, res) => {
  const { prompt } = req.body;
  const apiKey = process.env.POLLINATIONS_API_KEY;

  if (!apiKey) {
    return res.json({ error: 'Falta POLLINATIONS_API_KEY en Render > Environment' });
  }
  if (!prompt) {
    return res.json({ error: 'Escribe un prompt' });
  }

  // Wan usa el endpoint de imagen/video con GET, no POST
  // Construimos la URL directa con tu key
  const encoded = encodeURIComponent(prompt);
  const videoUrl = 'https://gen.pollinations.ai/image/' + encoded + '?model=wan&width=512&height=512&duration=5&key=' + apiKey;

  console.log('Generando con Wan:', prompt);
  return res.json({ videoUrl: videoUrl });
});

app.listen(PORT, () => {
  console.log('Servidor corriendo en puerto ' + PORT);
});
