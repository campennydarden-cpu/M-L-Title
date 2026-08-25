const fs = require('fs');
const html = fs.readFileSync('/home/claude/title-escrow-project/genesis-app.html', 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
new Function(m[1]);
console.log('Syntax OK');
