const express = require('express');
const path    = require('node:path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.get('/favicon.ico', (_req, res) => res.redirect(301, '/icon.svg'));
app.use(express.static(path.join(__dirname, 'src')));

app.listen(PORT, () => {
  console.log(`Fitment Calculator → http://localhost:${PORT}`);
});
