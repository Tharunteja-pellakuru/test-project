const puppeteer = require('puppeteer');
const path = require('path');

async function run() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const fileUrl = 'file://' + path.resolve(__dirname, 'cards.html');
  await page.goto(fileUrl, { waitUntil: 'networkidle2' });

  // Scroll to 1800
  await page.evaluate(() => {
    window.scrollTo(0, 1800);
  });
  await new Promise(resolve => setTimeout(resolve, 800));

  const info = await page.evaluate(() => {
    const container = document.querySelector('.stack-container');
    const containerRect = container.getBoundingClientRect();
    const cards = document.querySelectorAll('.card');
    const cardRects = Array.from(cards).map((card, idx) => {
      const rect = card.getBoundingClientRect();
      return {
        className: card.className,
        rectTop: rect.top,
        rectBottom: rect.bottom,
        offsetTop: card.offsetTop,
        offsetHeight: card.offsetHeight
      };
    });
    return {
      containerRect,
      cardRects
    };
  });

  console.log('Container info:', info);
  await browser.close();
}
run().catch(err => console.error(err));
