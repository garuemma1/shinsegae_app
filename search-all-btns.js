const fs = require('fs');
const path = require('path');

const dir = 'c:\\\\Users\\\\win10\\\\Desktop\\\\shinsegae_app';
const files = fs.readdirSync(dir);

files.forEach(f => {
  if (f.endsWith('.js') || f.endsWith('.html') || f.endsWith('.css')) {
    const content = fs.readFileSync(path.join(dir, f), 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (line.includes('btn-success') || line.includes('신규 직원') || line.includes('user-plus') || line.includes('openEmpModal') || line.includes('openNewEmpModal')) {
        console.log(`${f}:${idx+1}: ${line.trim()}`);
      }
    });
  }
});
