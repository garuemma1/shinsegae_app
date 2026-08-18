const fs = require('fs');
const path = require('path');

const dir = 'c:\\\\Users\\\\win10\\\\Desktop\\\\shinsegae_app';
const files = fs.readdirSync(dir);

files.forEach(f => {
  if (f.endsWith('.js') || f.endsWith('.html')) {
    const content = fs.readFileSync(path.join(dir, f), 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (line.includes('openLeave') || line.includes('submitLeave') || line.includes('leave-modal') || line.includes('연차') || line.includes('AnnualLeaveModule')) {
        console.log(`${f}:${idx+1}: ${line.trim()}`);
      }
    });
  }
});
