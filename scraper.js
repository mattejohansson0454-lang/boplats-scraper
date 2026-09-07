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
    
    await page.goto('https://minasidor.vidingehem.se/bostad', {
      waitUntil: 'networkidle0',
      timeout: 60000
    });

    // Extra väntetid för att låta JavaScript ladda in bostadskorten
    await new Promise(resolve => setTimeout(resolve, 7000));

    const apartments = await page.evaluate(() => {
      const results = [];
      // Hämta alla element som kan tänkas vara bostadskort eller länkar
      const cards = document.querySelectorAll('article, div, a, li');
      
      cards.forEach((el, idx) => {
        const text = el.innerText;
        // Letar efter bostadstermer som "ROK" eller "rum" samt hyra
        if (text && (text.includes('ROK') || text.includes('rum')) && text.length < 300) {
          const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          if (lines.length > 0) {
            results.push({
              id: `VOT-${idx}`,
              address: lines[0],
              details: lines.slice(1, 4).join(' | '),
              boplatsUrl: el.href || 'https://minasidor.vidingehem.se/bostad'
            });
          }
        }
      });
      return results;
    });

    await browser.close();

    // Rensa bort dubbletter baserat på adress
    const uniqueApartments = Array.from(new Set(apartments.map(a => a.address)))
      .map(addr => apartments.find(a => a.address === addr));

    fs.writeFileSync('apartments.json', JSON.stringify(uniqueApartments, null, 2));
    console.log('Sparade', uniqueApartments.length, 'lägenheter.');
  } catch (error) {
    console.error('Fel vid skrapning:', error.message);
    process.exit(1);
  }
}

run();
