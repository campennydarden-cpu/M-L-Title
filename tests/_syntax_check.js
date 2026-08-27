const fs = require('fs');
const path = require('path');
const htmlPath = path.join(__dirname, '..', 'genesis-app.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
new Function(m[1]);
console.log('Syntax OK');
