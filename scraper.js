const puppeteer = require('puppeteer');
const fs = require('fs');

async function run() {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    await page.goto('https://www.vaxjo.se/boplats/se/boplats-vaxjo.html', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    const apartments = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll('a').forEach((el, index) => {
        const text = el.innerText.trim();
        const href = el.href;
        if (href && (href.includes('boplats') || text.includes('kvm') || text.includes('rum'))) {
          items.push({
            id: `BOP-${index}`,
            address: text || 'Adress saknas',
            rent: 'Se länk',
            boplatsUrl: href
          });
        }
      });
      return items;
    });

    await browser.close();

    const uniqueApartments = Array.from(new Set(apartments.map(a => a.boplatsUrl)))
      .map(url => apartments.find(a => a.boplatsUrl === url));

    fs.writeFileSync('apartments.json', JSON.stringify(uniqueApartments, null, 2));
    console.log('Sparade', uniqueApartments.length, 'objekt via Puppeteer.');
  } catch (error) {
    console.error('Fel vid skrapning:', error.message);
    process.exit(1);
  }
}

run();
