const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => errors.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => errors.push(`[PAGE ERROR] ${err.message}`));
  await page.goto('https://truthful-enchantment-production-2411.up.railway.app/tabibak.html', { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log('URL:', page.url());
  console.log('Title:', await page.title());
  if (errors.length) {
    console.log('Console errors:');
    errors.forEach(e => console.log('  ' + e));
  } else {
    console.log('No console errors');
  }
  // Try clicking the meds tab
  const medsBtn = await page.$('.nav-btn[data-tab="meds"]');
  if (medsBtn) {
    console.log('Found meds button, clicking...');
    await medsBtn.click();
    await page.waitForTimeout(2000);
    const medsScreen = await page.$('#screen-meds');
    if (medsScreen) {
      const visible = await medsScreen.evaluate(el => el.classList.contains('active'));
      console.log('Meds screen visible:', visible);
    }
  } else {
    console.log('Meds button not found');
  }
  await browser.close();
})();
