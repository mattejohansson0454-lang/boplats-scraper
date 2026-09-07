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
    
    // Ökar tidsgränsen till 60 sekunder och laddar in sidan snabbare
    await page.goto('https://www.vaxjo.se/boplats/se/boplats-vaxjo.html', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    const apartments = await page.evaluate(() => {
      const unwanted = [
        'MENY', 'Om oss', 'Att söka lägenhet', 'För dig som student', 
        'För dig som senior', 'För dig som ungdom', 'Poängfritt', 
        'Var kan jag bo?', 'Boplats Växjö', 'Till innehållet', 'English',
        'Lediga lägenheter', 'Kontakta oss'
      ];
      
      return Array.from(document.querySelectorAll('a'))
        .map((a, index) => ({
          id: `BOP-${index}`,
          address: a.innerText.trim(),
          rent: 'Se länk',
          boplatsUrl: a.href
        }))
        .filter(item => item.address && !unwanted.includes(item.address) && item.address.length > 3);
    });

    await browser.close();

    const uniqueApartments = Array.from(new Set(apartments.map(a => a.boplatsUrl)))
      .map(url => apartments.find(a => a.boplatsUrl === url));

    fs.writeFileSync('apartments.json', JSON.stringify(uniqueApartments, null, 2));
    console.log('Sparade', uniqueApartments.length, 'objekt.');
  } catch (error) {
    console.error('Fel vid skrapning:', error.message);
    process.exit(1);
  }
}

run();
