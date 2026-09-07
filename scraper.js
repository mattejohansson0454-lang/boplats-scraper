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

    // Vänta på att listan laddas ordentligt
    await new Promise(resolve => setTimeout(resolve, 6000));

    let allApartments = [];

    // Loopa igenom alla sidor
    for (let i = 0; i < 7; i++) {
      console.log(`Skrapar sida ${i + 1}...`);
      
      const apartmentsOnPage = await page.evaluate(() => {
        const results = [];
        const cards = Array.from(document.querySelectorAll('div, mat-card, article, li')).filter(el => {
          const text = el.innerText || '';
          const lower = text.toLowerCase();
          return (lower.includes('rok') || lower.includes('rum')) && lower.includes('kr') && text.length < 400;
        });

        // Filtrera till de innersta elementen för att undvika dubbletter
        const leafCards = cards.filter(el => !cards.some(other => other !== el && el.contains(other)));

        leafCards.forEach(el => {
          const text = el.innerText.trim();
          const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          
          // Hitta bild i eller nära kortet
          const imgEl = el.querySelector('img') || el.closest('div, mat-card, article, li')?.querySelector('img');
          const imageUrl = imgEl ? (imgEl.src || imgEl.getAttribute('data-src')) : null;

          // Hitta specifik länk om den finns
          const linkEl = el.querySelector('a') || el.closest('a');
          const itemUrl = linkEl ? linkEl.href : window.location.href;

          if (lines.length > 0) {
            results.push({
              address: lines[0],
              description: lines.slice(1, 4).join(' | '),
              rawText: text,
              imageUrl: imageUrl,
              boplatsUrl: itemUrl
            });
          }
        });
        return results;
      });

      allApartments.push(...apartmentsOnPage);

      // Paginering: Nästa-knapp
      const clickedNext = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const nextBtn = buttons.find(b => {
          const label = (b.getAttribute('aria-label') || '').toLowerCase();
          const text = b.innerText.trim();
          const html = b.innerHTML;
          return label.includes('next') || label.includes('nästa') || text === '>' || text === '»' || html.includes('chevron_right');
        });

        if (nextBtn && !nextBtn.disabled && !nextBtn.getAttribute('aria-disabled')?.includes('true')) {
          nextBtn.click();
          return true;
        }
        return false;
      });

      if (!clickedNext) {
        console.log('Ingen nästa-knapp hittades eller så är sista sidan nådd.');
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 4000));
    }

    await browser.close();

    fs.writeFileSync('apartments.json', JSON.stringify(allApartments, null, 2));
    console.log('Sparade totalt', allApartments.length, 'objekt med bilder och länkar.');
  } catch (error) {
    console.error('Fel vid skrapning:', error.message);
    process.exit(1);
  }
}

run();
