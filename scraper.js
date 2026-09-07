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

    // Försök ändra antal objekt per sida till 100 om möjligt
    try {
      const pageSizeSelect = await page.$('mat-select.mat-paginator-page-size-select');
      if (pageSizeSelect) {
        await pageSizeSelect.click();
        await new Promise(resolve => setTimeout(resolve, 1500));
        await page.evaluate(() => {
          const options = Array.from(document.querySelectorAll('mat-option'));
          const opt100 = options.find(o => o.innerText.includes('100') || o.innerText.includes('50'));
          if (opt100) opt100.click();
        });
        await new Promise(resolve => setTimeout(resolve, 4000));
        console.log('Ändrade sidstorlek till max.');
      }
    } catch (e) {
      console.log('Kunde inte ändra sidstorlek, kör standardväxling.');
    }

    let allApartments = [];

    // Loopa igenom sidorna (max 6 sidor för säkerhets skull)
    for (let i = 0; i < 6; i++) {
      console.log(`Skrapar sida ${i + 1}...`);
      
      const apartmentsOnPage = await page.evaluate(() => {
        const results = [];
        const elements = document.querySelectorAll('*');
        
        elements.forEach((el, idx) => {
          const text = el.innerText ? el.innerText.trim() : '';
          const lowerText = text.toLowerCase();
          
          if (text && (lowerText.includes('rok') || lowerText.includes('rum')) && lowerText.includes('kr') && text.length < 400) {
            const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            if (lines.length > 0) {
              results.push({
                address: lines[0],
                description: lines.slice(0, 4).join(' | '),
                boplatsUrl: window.location.href
              });
            }
          }
        });
        return results;
      });

      allApartments.push(...apartmentsOnPage);

      // Kolla om nästa-knappen finns och är klickbar
      const nextBtn = await page.$('button.mat-paginator-navigation-next');
      if (!nextBtn) {
        console.log('Ingen nästa-knapp hittades.');
        break;
      }

      const isDisabled = await page.evaluate(btn => {
        return btn.disabled || btn.classList.contains('mat-button-disabled') || btn.getAttribute('aria-disabled') === 'true';
      }, nextBtn);

      if (isDisabled) {
        console.log('Sista sidan nådd.');
        break;
      }

      // Använd Puppeteers riktiga klick
      await nextBtn.click();
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    await browser.close();

    // Rensa dubbletter baserat på adress
    const uniqueApartments = Array.from(new Set(allApartments.map(a => a.address)))
      .map(addr => allApartments.find(a => a.address === addr));

    fs.writeFileSync('apartments.json', JSON.stringify(uniqueApartments, null, 2));
    console.log('Sparade totalt', uniqueApartments.length, 'unika objekt från alla sidor.');
  } catch (error) {
    console.error('Fel vid skrapning:', error.message);
    process.exit(1);
  }
}

run();
