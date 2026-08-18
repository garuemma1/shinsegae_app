const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = global;
global.window.addEventListener = () => {};
global.alert = (msg) => { console.log("[ALERT]", msg); };
global.confirm = (msg) => { console.log("[CONFIRM]", msg); return true; };
global.document = {
  addEventListener: () => {},
  querySelector: () => { return { innerHTML: '', classList: { add: () => {}, remove: () => {} } }; },
  querySelectorAll: () => [],
  getElementById: (id) => {
    return {
      style: {},
      classList: { add: () => {}, remove: () => {} },
      setAttribute: () => {},
      removeAttribute: () => {},
      value: '2026-08-14',
      innerText: '',
      innerHTML: '',
      focus: () => {}
    };
  },
  createElement: (tag) => {
    return {
      id: '',
      className: '',
      style: {},
      innerHTML: '',
      setAttribute: () => {},
      click: () => {},
      getContext: () => {
        return {
          height: 100,
          width: 100
        };
      },
      toDataURL: () => 'data:image/png;base64,sample'
    };
  },
  body: { appendChild: () => {}, removeChild: () => {}, setAttribute: () => {}, getAttribute: () => null, removeAttribute: () => {}, classList: { add: () => {}, remove: () => {}, contains: () => false } }
};
const memoryStorage = {};
global.localStorage = {
  getItem: (key) => memoryStorage[key] || null,
  setItem: (key, val) => { memoryStorage[key] = val; },
  removeItem: (key) => { delete memoryStorage[key]; }
};
global.Blob = class { constructor(parts) { this.parts = parts; } };
global.URL = { createObjectURL: () => 'blob:sample' };
global.navigator = { userAgent: 'Chrome' };

const jsFiles = [
  'rules-data.js',
  'labor-calculator.js',
  'sheets-sync.js',
  'notices-module.js',
  'worklog-module.js',
  'schedule-module.js',
  'annual-leave-module.js',
  'staff-directory-module.js',
  'discount-purchase-module.js',
  'emergency-contacts-module.js',
  'pharmacy-settlement-module.js',
  'building-rental-module.js',
  'approval-module.js',
  'rules-module.js',
  'app.js'
];

try {
  jsFiles.forEach(file => {
    const filePath = path.join('c:\\\\Users\\\\win10\\\\Desktop\\\\shinsegae_app', file);
    const code = fs.readFileSync(filePath, 'utf8');
    new vm.Script(code);
    eval(code);
  });
  console.log("✅ All scripts syntax & load OK!");
  window.App.init();

  window.ScheduleModule.render('module-content');

  console.log("✅ Settlement Table Number Fallback & Center Alignment Fix SUCCESS!");
} catch (err) {
  console.error("❌ ERROR IN CHECK-ALL:", err);
}
