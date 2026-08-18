const fs = require('fs');
const path = require('path');

const dir = 'c:\\\\Users\\\\win10\\\\Desktop\\\\shinsegae_app';
const files = fs.readdirSync(dir);

files.forEach(f => {
  if (f.endsWith('.js')) {
    const content = fs.readFileSync(path.join(dir, f), 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (line.includes('주말/공휴일 시급') || line.includes('약정시급') || line.includes('약정 기본월급') || line.includes('savePharmacistRates')) {
        console.log(`${f}:${idx+1}: ${line.trim()}`);
      }
    });
  }
});
