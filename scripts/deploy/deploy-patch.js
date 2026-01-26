const os = require('os');
const originalHostname = os.hostname;
os.hostname = () => 'vercel-deploy-patch';
console.log('Patched os.hostname() to return "vercel-deploy-patch"');
require('../node_modules/vercel/dist/index.js');
