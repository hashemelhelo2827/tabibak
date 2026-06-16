const path = require('path');
(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  await page.goto('file://' + path.join(__dirname, 'deployment-report.html'), { waitUntil: 'networkidle0' });
  await page.pdf({ path: path.join(__dirname, '..', 'Tabibak-Deployment-Report.pdf'), format: 'A4', printBackground: true, margin: { top: '2cm', bottom: '2cm', left: '2cm', right: '2cm' } });
  await browser.close();
  console.log('PDF generated');
})();
