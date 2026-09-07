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
      
      // Scrolla för att trigga lazy loading av bilder
      await page.evaluate(async () => {
        window.scrollBy(0, 400);
        await new Promise(resolve => setTimeout(resolve, 800));
        window.scrollBy(0, -400);
      });
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const apartmentsOnPage = await page.evaluate(() => {
        const results = [];
        
        // Hitta de övergripande kortbehållarna för varje lägenhet
        const cardElements = Array.from(document.querySelectorAll('mat-card, article, div')).filter(el => {
          const text = el.innerText || '';
          const lower = text.toLowerCase();
          return (lower.includes('rum') || lower.includes('rok')) && lower.includes('kr') && text.length > 30 && text.length < 800;
        });

        // Filtrera till de innersta unika korten för att slippa dubbletter
        const leafCards = cardElements.filter(el => !cardElements.some(other => other !== el && el.contains(other)));

        leafCards.forEach(el => {
          const text = el.innerText.trim();
          const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

          // Hitta bild i kortet (stödjer både <img> och CSS bakgrundsbilder samt lazy-load)
          const imgEl = el.querySelector('img') || el.querySelector('[style*="background-image"]');
          let imageUrl = null;
          if (imgEl) {
            if (imgEl.tagName === 'IMG') {
              imageUrl = imgEl.src || imgEl.getAttribute('data-src') || imgEl.getAttribute('data-lazy-src') || imgEl.srcset;
              if (imageUrl && imageUrl.includes(',')) {
                imageUrl = imageUrl.split(',')[0].trim().split(' ')[0];
              }
            } else {
              const match = imgEl.style.backgroundImage.match(/url$$['"]?(.*?)['"]?$$/);
              if (match) imageUrl = match[1];
            }
          }

          // Hitta länk till objektet
          const linkEl = el.querySelector('a') || el.closest('a');
          const itemUrl = linkEl ? linkEl.href : window.location.href;

          // Ignorera UI-etiketter som "Storlek", "Kvm", "Kr/mån" etc. för att inte få fel på adressen
          const ignoredLabels = ['storlek', 'kvm', 'kr/mån', 'kr', 'rum och kök', 'rum & kök', 'rok', 'ledig fr.o.m.', 'snarast', 'sista anmälan:'];
          
          const validLines = lines.filter(l => {
            const lower = l.toLowerCase();
            return !ignoredLabels.includes(lower) && 
                   !/^\d{4}-\d{2}-\d{2}$/.test(l) &&
                   !/^\d+([.,]\d+)?\s*(kvm|kr)?$/i.test(l);
          });

          // Extrahera fält
          let address = validLines.find(l => /vägen|gatan|gränd|väg|gata/i.test(l)) || validLines[0] || 'Okänd adress';
          let area = validLines.find(l => l !== address && (l.toLowerCase().includes('växjö') || l.length < 25)) || '';

          let rooms = lines.find(l => /rum|rok/i.test(l)) || '';
          let sqm = lines.find(l => /kvm/i.test(l) || /^\d+([.,]\d+)?\s*kvm/i.test(l)) || '';
          let rent = lines.find(l => l.toLowerCase().includes('kr') && !l.toLowerCase().includes('kvm')) || '';
          let availableDate = lines.find(l => /^\d{4}-\d{2}-\d{2}$/.test(l)) || 'Snarast';

          if (text.length > 0) {
            results.push({
              address: address,
              area: area || 'Växjö',
              rooms: rooms,
              sqm: sqm,
              rent: rent,
              availableDate: availableDate,
              description: lines.join(' | '),
              rawText: text,
              imageUrl: imageUrl ? (imageUrl.startsWith('http') ? imageUrl : 'https://minasidor.vidingehem.se' + imageUrl) : null,
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
    console.log('Sparade totalt', allApartments.length, 'objekt med korrekta adresser, bilder och data.');
  } catch (error) {
    console.error('Fel vid skrapning:', error.message);
    process.exit(1);
  }
}

run();
