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

    // Loopa igenom sidorna (ca 6 sidor totalt)
    for (let i = 0; i < 7; i++) {
      console.log(`Skrapar sida ${i + 1}...`);
      
      const apartmentsOnPage = await page.evaluate(() => {
        const results = [];
        // Hitta alla potentiella behållare för lägenhetskort
        const candidates = Array.from(document.querySelectorAll('div, mat-card, article, li')).filter(el => {
          const text = el.innerText || '';
          const lower = text.toLowerCase();
          return (lower.includes('rok') || lower.includes('rum')) && lower.includes('kr') && text.length < 300;
        });

        // Filtrera ut så vi bara tar de innersta elementen (förhindrar att föräldraelement också matchas)
        const leafCandidates = candidates.filter(el => {
          return !candidates.some(other => other !== el && el.contains(other));
        });

        leafCandidates.forEach(el => {
          const text = el.innerText.trim();
          const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          if (lines.length > 0) {
            results.push({
              address: lines[0],
              description: lines.slice(0, 4).join(' | '),
              boplatsUrl: window.location.href
            });
          }
        });
        return results;
      });

      allApartments.push(...apartmentsOnPage);

      // Hitta och klicka på nästa-knappen i pagineringen
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

    // Rensa eventuella dubbletter baserat på adress + beskrivning
    const uniqueApartments = Array.from(
      new Map(allApartments.map(item => [`${item.address}-${item.description}`, item])).values()
    );

    fs.writeFileSync('apartments.json', JSON.stringify(uniqueApartments, null, 2));
    console.log('Sparade totalt', uniqueApartments.length, 'unika objekt från alla sidor.');
  } catch (error) {
    console.error('Fel vid skrapning:', error.message);
    process.exit(1);
  }
}

run();
