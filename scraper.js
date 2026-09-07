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
    
    // Sätt stor viewport så inget döljs av mobilanpassade menyer
    await page.setViewport({ width: 1280, height: 800 });

    await page.goto('https://minasidor.vidingehem.se/bostad', {
      waitUntil: 'networkidle2',
      timeout: 90000
    });

    // Vänta på att eventuell cookie-banner dyker upp och klicka bort den om den finns
    try {
      await page.waitForSelector('button, a', { timeout: 5000 });
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        const acceptBtn = buttons.find(b => {
          const t = b.innerText.toLowerCase();
          return t.includes('godkänn') || t.includes('acceptera') || t.includes('tillåt');
        });
        if (acceptBtn) acceptBtn.click();
      });
    } catch (e) {
      console.log('Ingen cookie-knapp hittades eller så behövdes inte klick.');
    }

    // Vänta ytterligare 15 sekunder för att bostäderna ska laddas in
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Skriv ut lite sidinfo till loggen för felsökning
    const pageText = await page.evaluate(() => document.body.innerText);
    console.log('Sidans längd i tecken:', pageText.length);
    console.log('Första 500 tecknen på sidan:', pageText.substring(0, 500));

    const apartments = await page.evaluate(() => {
      const results = [];
      // Sök efter vanliga element som bygger upp bostadskort
      const cards = document.querySelectorAll('article, .object-card, .vacancy-item, div, li');
      
      cards.forEach((el, idx) => {
        const text = el.innerText ? el.innerText.trim() : '';
        const lowerText = text.toLowerCase();
        
        if (text && (lowerText.includes('rok') || lowerText.includes('rum')) && lowerText.includes('kr') && text.length < 600) {
          const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          if (lines.length > 0) {
            results.push({
              id: `APT-${idx}`,
              address: lines[0],
              description: lines.slice(0, 4).join(' | '),
              boplatsUrl: 'https://minasidor.vidingehem.se/bostad'
            });
          }
        }
      });
      return results;
    });

    await browser.close();

    const uniqueApartments = Array.from(new Set(apartments.map(a => a.address)))
      .map(addr => apartments.find(a => a.address === addr));

    fs.writeFileSync('apartments.json', JSON.stringify(uniqueApartments, null, 2));
    console.log('Sparade', uniqueApartments.length, 'objekt.');
  } catch (error) {
    console.error('Fel vid skrapning:', error.message);
    process.exit(1);
  }
}

run();
