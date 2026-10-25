// Assemble index.html (fichier unique) à partir des parties de src/,
// y incorpore le logo, puis vérifie la syntaxe JavaScript avec Node.
// Usage : node outils/assembler.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => fs.readFileSync(path.join(R, 'src', f), 'utf8');
const logo = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(R, 'icons/logo-loges.jpg')).toString('base64');
const embleme = 'data:image/png;base64,' + fs.readFileSync(path.join(R, 'icons/embleme-96.png')).toString('base64');

const parties = fs.readdirSync(path.join(R, 'src')).sort();
const js = parties.filter((f) => f.endsWith('.js')).map((f) => `/* ---- ${f} ---- */\n` + src(f)).join('\n');
const tmp = path.join(R, '.verif-syntaxe.js');
fs.writeFileSync(tmp, js);
execFileSync(process.execPath, ['--check', tmp], { stdio: 'inherit' });
fs.unlinkSync(tmp);

let html = src('01-tete.html') + src('02-corps.html') + '<script>\n"use strict";\n' + js + '\n</script>\n</body>\n</html>\n';
html = html.replaceAll('__LOGO__', logo).replaceAll('__EMBLEME__', embleme);
fs.writeFileSync(path.join(R, 'index.html'), html);
console.log(`index.html assemblé : ${(html.length / 1024).toFixed(0)} Ko, ${html.split('\n').length} lignes — syntaxe JavaScript vérifiée.`);
