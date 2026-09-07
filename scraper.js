const puppeteer = require('puppeteer');
const fs = require('fs');

async function run() {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ]
    });
    
    const page = await browser.newPage();
    
    // Dölj att det är en bot bättre
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    console.log('Navigerar till Vidingehem...');
    await page.goto('https://minasidor.vidingehem.se/bostad', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Skriv ut den faktiska URL:en vi landade på (för att se om vi skickades till inlogg)
    console.log('Faktisk URL efter laddning:', page.url());

    // Vänta 15 sekunder
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Hämta all text på sidan för att se vad som lästs in
    const pageContent = await page.evaluate(() => document.body.innerText);
    console.log('Sidans längd (tecken):', pageContent.length);
    console.log('Utdrag från sidan:', pageContent.substring(0, 400));

    const apartments = await page.evaluate(() => {
      const results = [];
      const elements = document.querySelectorAll('*');
      
      elements.forEach((el, idx) => {
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
