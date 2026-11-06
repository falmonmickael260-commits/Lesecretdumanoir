import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const origin = process.env.TEST_ORIGIN || 'http://localhost:5198';
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const out = join(process.cwd(), 'artifacts'); mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const contexts = []; const pages = []; const errors = [];
try {
  for (let i = 0; i < 4; i++) {
    const context = await browser.createBrowserContext(); contexts.push(context);
    const page = await context.newPage(); pages.push(page);
    await page.evaluateOnNewDocument(() => {
      const NativeSocket = window.WebSocket;
      window.WebSocket = class extends NativeSocket {
        constructor(...args) {
          super(...args);
          this.addEventListener('message', event => {
            try { const message = JSON.parse(event.data); if (message.state) window.__manoirTestState = message.state; } catch { /* ignore non-state messages */ }
          });
        }
      };
    });
    await page.setViewport(i === 3 ? { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 1 });
    page.on('pageerror', error => errors.push(`client ${i + 1}: ${error.message}`));
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.entry-panel');
    await page.type('.entry-panel input:nth-of-type(1)', `Explorateur ${i + 1}`).catch(async () => {
      await page.type('.entry-panel label:first-child input', `Explorateur ${i + 1}`);
    });
    await page.click(`.avatar-choices button:nth-child(${i + 1})`);
    if (i === 0) {
      await page.type('.entry-columns > div:first-child input', 'Les Veilleurs');
      await page.click('.entry-columns .primary');
      await page.waitForSelector('.room-code strong');
    } else {
      const code = await pages[0].$eval('.room-code strong', el => el.textContent?.trim() || '');
      await page.type('.entry-columns > div:last-child input', code);
      await page.click('.entry-columns .secondary');
      await page.waitForSelector('.room-code strong');
    }
  }
  await pages[0].waitForFunction(() => document.querySelectorAll('.lobby-player.filled').length === 4);
  for (const page of pages) await page.click('.lobby-actions .secondary');
  await pages[0].waitForFunction(() => [...document.querySelectorAll('.lobby-player small')].every(el => el.textContent?.includes('PRÊT')));
  await pages[0].click('.lobby-actions .primary');
  for (const page of pages) await page.waitForSelector('.game-view canvas', { timeout: 10000 });
  await new Promise(resolve => setTimeout(resolve, 2200));
  await pages[0].screenshot({ path: join(out, 'hall-desktop.png') });
  await pages[3].screenshot({ path: join(out, 'hall-mobile.png') });
  const position = page => page.evaluate(() => { const session = JSON.parse(localStorage.getItem('escape-project-session')); const player = window.__manoirTestState?.players.find(p => p.id === session.id); return player && { x: player.x, z: player.z }; });
  const beforeDesktop = await position(pages[0]);
  await pages[0].keyboard.down('d'); await new Promise(resolve => setTimeout(resolve, 800)); await pages[0].keyboard.up('d');
  const afterDesktop = await position(pages[0]);
  if (!beforeDesktop || !afterDesktop || afterDesktop.x - beforeDesktop.x < 0.3) throw new Error('Desktop keyboard movement failed.');
  const beforeMobile = await position(pages[3]);
  const stick = await pages[3].$('.joystick'); const box = await stick.boundingBox();
  if (!box) throw new Error('Mobile joystick not visible.');
  await pages[3].touchscreen.touchStart(box.x + box.width / 2, box.y + box.height / 2);
  await pages[3].touchscreen.touchMove(box.x + box.width / 2 + 31, box.y + box.height / 2);
  await new Promise(resolve => setTimeout(resolve, 800)); await pages[3].touchscreen.touchEnd();
  const afterMobile = await position(pages[3]);
  if (!beforeMobile || !afterMobile || afterMobile.x - beforeMobile.x < 0.3) throw new Error('Mobile joystick movement failed.');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Four clients rendered the hall; keyboard and touch movement passed. Screenshots: ${out}`);
} finally {
  await Promise.all(contexts.map(context => context.close().catch(() => {})));
  await browser.close();
}
