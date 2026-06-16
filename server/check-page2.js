const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('response', response => {
    if (response.status() >= 400) {
      errors.push(`[${response.status()}] ${response.url()}`);
    }
  });
  await page.goto('https://truthful-enchantment-production-2411.up.railway.app/tabibak.html', { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForTimeout(2000);
  console.log('HTTP errors:');
  if (errors.length) {
    errors.forEach(e => console.log('  ' + e));
  } else {
    console.log('  None');
  }
  // Check meds screen content
  const medsBtn = await page.$('.nav-btn[data-tab="meds"]');
  if (medsBtn) {
    await medsBtn.click();
    await page.waitForTimeout(2000);
    const html = await page.$eval('#medsListContainer', el => el.innerHTML);
    console.log('Meds container HTML (first 300 chars):', html.substring(0, 300));
    const emptyMsg = await page.$('.meds-empty');
    if (emptyMsg) {
      const text = await emptyMsg.evaluate(el => el.textContent);
      console.log('Empty message:', text.trim());
    }
    const cards = await page.$$('.med-card');
    console.log('Med cards found:', cards.length);
  }
  await browser.close();
})();
