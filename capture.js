const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

const PROJECT_JSON_PATH = path.join(__dirname, 'projects.json');
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

// Ensure screenshots folder exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR);
}

// Helper: HTTP GET request with User-Agent to check headers
function checkIframePermission(url) {
  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const options = {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 5000
    };

    const req = client.get(url, options, (res) => {
      const headers = res.headers;
      const xFrameOptions = (headers['x-frame-options'] || '').toLowerCase();
      const csp = (headers['content-security-policy'] || '').toLowerCase();

      let allowed = true;

      if (xFrameOptions.includes('deny') || xFrameOptions.includes('sameorigin')) {
        allowed = false;
      }
      if (csp.includes('frame-ancestors')) {
        // frame-ancestors 'self' or similar blocks frame loading
        allowed = false;
      }

      console.log(`[Header Check] ${url} | x-frame-options: "${xFrameOptions || 'none'}" | allowed: ${allowed}`);
      resolve(allowed);
    });

    req.on('error', (err) => {
      console.log(`[Header Check Error] ${url}: ${err.message}. Defaulting iframeAllowed to false.`);
      resolve(false);
    });

    req.on('timeout', () => {
      console.log(`[Header Check Timeout] ${url}. Defaulting iframeAllowed to false.`);
      req.destroy();
      resolve(false);
    });
  });
}

// Helper: Download file from URL
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    const file = fs.createWriteStream(destPath);
    
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download: Status ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    });

    req.on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

// Fallback: Fetch screenshots using Microlink free API
async function captureFallback(project, device, width, height, destFile) {
  // Microlink supports viewport widths & heights
  const apiUrl = `https://api.microlink.io/?url=${encodeURIComponent(project.domain)}&screenshot=true&embed=screenshot.url&viewport.width=${width}&viewport.height=${height}&viewport.isMobile=${device === 'mobile'}&viewport.hasTouch=${device === 'mobile'}`;
  
  console.log(`[API Screenshot] Fetching ${device} for ${project.name}...`);
  try {
    await downloadFile(apiUrl, destFile);
    console.log(`[API Screenshot Success] Saved ${destFile}`);
    return true;
  } catch (err) {
    console.log(`[API Screenshot Failed] ${project.name} ${device}: ${err.message}`);
    return false;
  }
}

async function run() {
  console.log('Reading projects.json...');
  const rawData = fs.readFileSync(PROJECT_JSON_PATH, 'utf8');
  const projects = JSON.parse(rawData);

  // Check if Puppeteer is installed and importable
  let puppeteer = null;
  try {
    puppeteer = require('puppeteer');
    console.log('Puppeteer detected. Will capture screenshots locally.');
  } catch (err) {
    console.log('Puppeteer not installed or failed to load. Will fall back to Microlink Screenshot API.');
  }

  let browser = null;
  if (puppeteer) {
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    } catch (err) {
      console.log(`Failed to launch local Chrome browser: ${err.message}. Falling back to API...`);
      puppeteer = null;
    }
  }

  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];
    console.log(`\n--------------------------------------------`);
    console.log(`Processing Project ${project.id}: ${project.name}`);
    console.log(`--------------------------------------------`);

    // 1. Check if iframe is allowed by response headers
    const iframeAllowed = await checkIframePermission(project.domain);
    project.iframeAllowed = iframeAllowed;

    // 2. Capture Screenshots for Desktop, Tablet, Mobile
    const devices = [
      { type: 'desktop', w: 1280, h: 800, file: `project_${project.id}_desktop.png` },
      { type: 'tablet', w: 1024, h: 768, file: `project_${project.id}_tablet.png` },
      { type: 'mobile', w: 375, h: 667, file: `project_${project.id}_mobile.png` }
    ];

    for (const dev of devices) {
      const destPath = path.join(SCREENSHOTS_DIR, dev.file);
      const relativePath = `screenshots/${dev.file}`;
      
      // Update config path
      if (dev.type === 'desktop') project.desktopScreenshot = relativePath;
      if (dev.type === 'tablet') project.tabletScreenshot = relativePath;
      if (dev.type === 'mobile') project.mobileScreenshot = relativePath;

      // Check cache (if screenshot exists, skip unless --force flag is passed)
      const forceRefresh = process.argv.includes('--force');
      if (fs.existsSync(destPath) && !forceRefresh) {
        console.log(`[Cache Hit] Screenshot for ${project.name} (${dev.type}) already exists at ${relativePath}`);
        continue;
      }

      let success = false;

      // Try local Puppeteer
      if (puppeteer && browser) {
        try {
          console.log(`[Puppeteer Capture] Loading ${project.domain} (${dev.type})...`);
          const page = await browser.newPage();
          await page.setViewport({ width: dev.w, height: dev.h, isMobile: dev.type === 'mobile', hasTouch: dev.type === 'mobile' });
          
          // Set user agent
          await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
          
          // Load page
          await page.goto(project.domain, { waitUntil: 'networkidle2', timeout: 30000 });
          
          // Wait additional 3 seconds for transitions/loads
          await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 3000)));

          // Capture
          await page.screenshot({ path: destPath, type: 'png' });
          console.log(`[Puppeteer Success] Saved ${relativePath}`);
          await page.close();
          success = true;
        } catch (err) {
          console.log(`[Puppeteer Error] Capture failed for ${project.name} (${dev.type}): ${err.message}. Trying API fallback...`);
        }
      }

      // Fallback if Puppeteer is not available or failed
      if (!success) {
        success = await captureFallback(project, dev.type, dev.w, dev.h, destPath);
      }
    }
  }

  if (browser) {
    await browser.close();
  }

  // Write updated projects.json
  console.log(`\nWriting updated project configurations back to projects.json...`);
  fs.writeFileSync(PROJECT_JSON_PATH, JSON.stringify(projects, null, 2), 'utf8');
  console.log('projects.json updated successfully!');
  console.log('Screenshot generation complete.');
}

run().catch(err => {
  console.error('Fatal execution error in capture.js:', err);
});
