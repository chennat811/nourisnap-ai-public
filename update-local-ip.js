const os = require('os');
const fs = require('fs');
const path = require('path');

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

function updateEnvLocal(ip) {
  const envPath = path.join(__dirname, '.env.local');
  let content = '';
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
    content = content.replace(/^LOCAL_DEV_IP=.*$/m, '');
    content = content.trim() + '\n';
  }
  content += `LOCAL_DEV_IP=${ip}\n`;
  fs.writeFileSync(envPath, content, 'utf8');
  console.log(`Updated .env.local with LOCAL_DEV_IP=${ip}`);
}

function updateEnv(ip) {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.warn('.env file not found, skipping update.');
    return;
  }
  let content = fs.readFileSync(envPath, 'utf8');
  // Replace any 192.*.*.* or 10.*.*.* or 127.*.*.* IPs in relevant lines
  const ipPattern = /\b(\d{1,3}\.){3}\d{1,3}\b/;
  const urlVars = [
    'API_BASE_URL',
    'SUPABASE_URL',
    'SUPABASE_FUNCTION_URL'
  ];
  content = content.split('\n').map(line => {
    for (const v of urlVars) {
      if (line.startsWith(v + '=')) {
        // Replace the IP in the URL
        return line.replace(ipPattern, ip);
      }
    }
    return line;
  }).join('\n');
  fs.writeFileSync(envPath, content, 'utf8');
  console.log(`Updated .env with IP ${ip} for relevant URL variables.`);
}

const ip = getLocalIp();
if (!ip) {
  console.error('Could not determine local IP address.');
  process.exit(1);
}
updateEnvLocal(ip);
updateEnv(ip);
