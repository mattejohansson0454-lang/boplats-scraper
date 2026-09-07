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
    
    // Rätt URL till Vidingehems publika bostadssida
    await page.goto('https://minasidor.vidingehem.se/bostad', {
      waitUntil: 'networkidle2',
      timeout: 40000
    });

    // Vänta in att bostadskorten laddas in på sidan
    await new Promise(resolve => setTimeout(resolve, 4000));

    const apartments = await page.evaluate(() => {
      const results = [];
      // Letar efter block som innehåller information om lägenheter (t.ex. ROK, kr, adresser)
      const elements = document.querySelectorAll('article, div, section, li');
      
      elements.forEach((el, idx) => {
        const text = el.innerText;
        if (text && text.includes('ROK') && text.includes('kr')) {
          const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          results.push({
            id: `VOT-${idx}`,
            address: lines[0] || 'Adress saknas',
            details: lines.slice(1, 5).join(' | '),
            fullInfo: text.replace(/\s+/g, ' ').trim(),
            boplatsUrl: 'https://minasidor.vidingehem.se/bostad'
          });
        }
      });
      return results;
    });

    await browser.close();

    // Ta bort dubbletter baserat på adress
    const uniqueApartments = Array.from(new Set(apartments.map(a => a.address)))
      .map(addr => apartments.find(a => a.address === addr));

    fs.writeFileSync('apartments.json', JSON.stringify(uniqueApartments, null, 2));
    console.log('Sparade', uniqueApartments.length, 'lägenheter från Vidingehem.');
  } catch (error) {
    console.error('Fel vid skrapning:', error.message);
    process.exit(1);
  }
}

run();
