const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => {
res.send('<h1>Mi servidor funciona!</h1>');
});
app.listen(PORT, () => console.log('Corriendo'));
