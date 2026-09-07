const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function run() {
  try {
    const targetUrl = 'https://www.vaxjo.se/boplats/se/boplats-vaxjo.html';
    const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`;
    
    const { data } = await axios.get(proxyUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 30000
    });
    
    const $ = cheerio.load(data);
    const apartments = [];

    $('a').each((index, element) => {
      const text = $(element).text().trim();
      const href = $(element).attr('href');

      if (href && (href.includes('boplats') || text.includes('kvm') || text.includes('rum'))) {
        apartments.push({
          id: `BOP-${index}`,
          address: text || 'Adress saknas',
          rent: 'Se länk',
          boplatsUrl: href.startsWith('http') ? href : `https://www.vaxjo.se${href}`
        });
      }
    });

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
