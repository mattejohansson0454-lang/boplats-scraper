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
    await page.setViewport({ width: 1280, height: 900 });
    
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    console.log('Navigerar till startsidan...');
    await page.goto('https://minasidor.vidingehem.se/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Klicka bort cookie-banner
    try {
      await page.waitForSelector('button', { timeout: 5000 });
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const accept = btns.find(b => b.innerText.includes('Tillåt alla') || b.innerText.includes('Acceptera'));
        if (accept) accept.click();
      });
    } catch (e) {
      console.log('Ingen cookie-knapp behövde klickas.');
    }

    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Klicka på Bostad i menyn
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a, button, span'));
      const bostadLink = links.find(el => el.innerText && el.innerText.trim() === 'Bostad');
      if (bostadLink) bostadLink.click();
    });

    // Vänta på att listan laddas
    await new Promise(resolve => setTimeout(resolve, 8000));

    // Loopa för att klicka på "Visa fler" eller bläddra tills alla objekt laddats
    let previousHeight = 0;
    let attempts = 0;
    while (attempts < 15) {
      // Försök klicka på "Visa fler"-knapp om den finns
      const clickedMore = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        const loadMoreBtn = buttons.find(b => {
          const t = b.innerText.toLowerCase();
          return t.includes('visa fler') || t.includes('ladda fler') || t.includes('visa 20 till');
        });
        if (loadMoreBtn && loadMoreBtn.offsetParent !== null) {
          loadMoreBtn.click();
          return true;
        }
        return false;
      });

      // Scrolla längst ner för att trigga eventuell lazy loading
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(resolve => setTimeout(resolve, 3000));

      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      if (currentHeight === previousHeight && !clickedMore) {
        break; // Inga fler objekt laddades
      }
      previousHeight = currentHeight;
      attempts++;
    }

    console.log('Hämtar alla inlästa lägenheter...');
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
              boplatsUrl: window.location.href
            });
          }
        }
      });
      return results;
    });

    await browser.close();

    // Rensa dubbletter
    const uniqueApartments = Array.from(new Set(apartments.map(a => a.address)))
      .map(addr => apartments.find(a => a.address === addr));

    fs.writeFileSync('apartments.json', JSON.stringify(uniqueApartments, null, 2));
    console.log('Sparade totalt', uniqueApartments.length, 'objekt.');
  } catch (error) {
    console.error('Fel vid skrapning:', error.message);
    process.exit(1);
  }
}

run();
