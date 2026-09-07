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
      
      // Scrolla lite för att trigga eventuell lazy loading av bilder innan skrapning
      await page.evaluate(async () => {
        window.scrollBy(0, 400);
        await new Promise(resolve => setTimeout(resolve, 800));
        window.scrollBy(0, -400);
      });
      await new Promise(resolve => setTimeout(resolve, 1500));
      
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
          
          const cardContainer = el.closest('mat-card, article, div, section') || el;
          
          // Robust bildhantering som fångar upp lazy-load och srcset
          const imgEl = cardContainer.querySelector('img');
          let imageUrl = null;
          if (imgEl) {
            imageUrl = imgEl.src || imgEl.getAttribute('data-src') || imgEl.getAttribute('data-lazy-src') || imgEl.srcset;
            if (imageUrl && imageUrl.includes(',')) {
              imageUrl = imageUrl.split(',')[0].trim().split(' ')[0];
            }
          }

          // Hitta specifik länk till objektet
          const linkEl = cardContainer.querySelector('a') || el.closest('a');
          const itemUrl = linkEl ? linkEl.href : window.location.href;

          // Separera fälten intelligent för att slippa röriga beskrivningar i appen
          let address = '';
          let area = '';
          let rooms = '';
          let sqm = '';
          let rent = '';
          let availableDate = '';

          lines.forEach(l => {
            const lower = l.toLowerCase();
            if (/vägen|gatan|gränd|väg|gata/i.test(l) && !address) {
              address = l;
            } else if ((lower.includes('rum') || lower.includes('rok')) && !rooms) {
              rooms = l;
            } else if ((lower.includes('kr') || /^\d{3,5}\s*(kr)?$/i.test(l)) && !rent && !lower.includes('kvm')) {
              rent = l;
            } else if ((/^\d{2,3}([.,]\d)?$/.test(l) || lower.includes('kvm')) && !sqm) {
              sqm = l.replace(/kvm/gi, '').trim();
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(l) && !availableDate) {
              availableDate = l;
            } else if (!area && (lower.includes('växjö') || (!address && l.length < 25 && !lower.includes('nu')))) {
              area = l;
            }
          });

          if (!address) {
            address = lines.find(l => l.length > 3 && !l.toLowerCase().includes('kr') && !l.toLowerCase().includes('rum')) || 'Okänd adress';
          }

          if (lines.length > 0) {
            results.push({
              address: address,
              area: area || 'Växjö',
              rooms: rooms || 'Okänd storlek',
              sqm: sqm ? sqm + ' kvm' : '',
              rent: rent ? (rent.includes('kr') ? rent : rent + ' kr/mån') : '',
              availableDate: availableDate || 'Snarast',
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
    console.log('Sparade totalt', allApartments.length, 'objekt med bilder och strukturerad data.');
  } catch (error) {
    console.error('Fel vid skrapning:', error.message);
    process.exit(1);
  }
}

run();
