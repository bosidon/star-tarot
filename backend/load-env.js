// 手动加载 .env
const path = require("path");
const fs = require("fs");
const envPath = path.join(__dirname, "..", ".env");
try {
  const content = fs.readFileSync(envPath, "utf8");
  content.split(/[\r\n]+/).filter(Boolean).forEach(function(line) {
    const m = line.match(/^\s*([^=#]+?)\s*=\s*(.+?)\s*$/);
    if (m && !m[1].startsWith("#")) process.env[m[1]] = m[2];
  });
  console.log("DOTENV LOADED: " + envPath);
} catch(e) {
  console.log("DOTENV FAIL: " + e.message);
}
