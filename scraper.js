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
      waitUntil: 'networkidle2',
      timeout: 90000
    });

    // Vänta 20 sekunder så att allt innehåll garanterat hinner laddas
    await new Promise(resolve => setTimeout(resolve, 20000));

    const apartments = await page.evaluate(() => {
      const results = [];
      const allElements = document.querySelectorAll('*');
      
      allElements.forEach((el, idx) => {
        const text = el.innerText ? el.innerText.trim() : '';
        const lowerText = text.toLowerCase();
        
        if (text && (lowerText.includes('rok') || lowerText.includes('rum')) && lowerText.includes('kr') && text.length < 500) {
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

    // Rensa bort dubbletter baserat på adress
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
