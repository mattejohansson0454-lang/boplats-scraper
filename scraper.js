const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function run() {
  try {
    const { data } = await axios.get('https://www.vaxjo.se/boplats/se/boplats-vaxjo.html');
    const $ = cheerio.load(data);
    const apartments = [];

    $('.apartment-item-class').each((index, element) => {
      const address = $(element).find('.address-class').text().trim();
      const rent = $(element).find('.rent-class').text().trim();
      const boplatsUrl = $(element).find('a').attr('href');

      apartments.push({
        id: `BOP-${index}`,
        address,
        rent,
        boplatsUrl: `https://www.vaxjo.se${boplatsUrl}`
      });
    });

    fs.writeFileSync('apartments.json', JSON.stringify(apartments, null, 2));
    console.log('Sparade', apartments.length, 'lägenheter.');
  } catch (error) {
    console.error('Fel vid skrapning:', error);
    process.exit(1);
  }
}

run();
