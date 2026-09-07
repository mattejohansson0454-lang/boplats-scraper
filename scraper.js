const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function run() {
  try {
    const { data } = await axios.get('https://www.vaxjo.se/boplats/se/boplats-vaxjo.html');
    const $ = cheerio.load(data);
    const apartments = [];

    // Letar efter länkar eller objekt på sidan
    $('a').each((index, element) => {
      const text = $(element).text().trim();
      const href = $(element).attr('href');

      // Filtrera ut länkar som ser ut att handla om boenden/lägenheter
      if (href && (href.includes('boplats') || text.includes('kvm') || text.includes('rum'))) {
        apartments.push({
          id: `BOP-${index}`,
          address: text || 'Adress saknas',
          rent: 'Se länk',
          boplatsUrl: href.startsWith('http') ? href : `https://www.vaxjo.se${href}`
        });
      }
    });

    // Ta bort dubbletter
    const uniqueApartments = Array.from(new Set(apartments.map(a => a.boplatsUrl)))
      .map(url => apartments.find(a => a.boplatsUrl === url));

    fs.writeFileSync('apartments.json', JSON.stringify(uniqueApartments, null, 2));
    console.log('Sparade', uniqueApartments.length, 'objekt.');
  } catch (error) {
    console.error('Fel vid skrapning:', error);
    process.exit(1);
  }
}

run();
