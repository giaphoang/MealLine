import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { backendDir } from './environment.mjs';

// Called only by the disposable integration fixture, with a session obtained
// through the real OTP verifier. Never inserts users into the live database.
export async function verifyBrowser({ base, cookie, client, outputDir }) {
  const require = createRequire(path.join(backendDir, 'package.json'));
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({
    headless: process.env.NOURISH_PDF_BROWSER_MODE === 'shell' ? 'shell' : true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: ['--no-sandbox', '--disable-background-networking'],
  });
  const failures = [];
  const apiFailures = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    const separator = cookie.indexOf('=');
    await page.setCookie({ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' });
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      const allowed = url.startsWith(base + '/') || /^(data:|blob:|about:)/.test(url);
      (allowed ? request.continue() : request.abort()).catch(() => {});
    });
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('response', (response) => {
      if (response.url().startsWith(base + '/feed/api/') && response.status() >= 500) apiFailures.push(`${response.status()} ${response.url()}`);
    });
    async function visit(route, text) {
      await page.goto(base + '/feed' + route, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction((expected) => {
        const content = document.querySelector('main')?.textContent ?? '';
        return content.toLowerCase().includes(expected.toLowerCase());
      }, { timeout: 30000 }, text);
      const content = await page.$eval('main', (element) => element.textContent);
      assert.ok(!/something went wrong|unexpected error|application error/i.test(content), `${route}: application error screen`);
      assert.deepEqual(failures, [], `${route}: browser exception`);
      console.log(`  Browser: ${route || '/'} rendered.`);
    }
    const workspaces = [
      ['/', 'Dashboard'], ['/categories', 'Categories'], ['/food-items', 'Food Items'],
      ['/intakes', 'Voice Intakes'], ['/household-baskets', 'Household Baskets'], ['/deliveries', 'Deliveries'],
      ['/clients', 'Clients'],
      ['/analytics', 'Analytics'], ['/reports', 'Reports'], ['/languages', 'Languages'], ['/translations', 'Translations'],
      ['/shopping-lists', 'Shopping Lists'], ['/shopping-lists/builder', 'Builder'],
      ['/document-translator', 'Document Translator'], ['/ai-configuration', 'AI Configuration'],
      ['/settings', 'Settings'], ['/admin', 'Admin'], ['/data-management', 'Data Management'],
      ['/service-log', 'Service Log'], ['/help', 'Help'],
    ];
    for (const [route, text] of workspaces) await visit(route, text);

    const clickButton = async (label) => {
      await page.locator(`::-p-aria(${label})`).click();
    };
    await visit('/clients','Clients');
    await page.waitForFunction(()=>document.querySelector('main')?.textContent.includes('Synthetic phone household'));
    const requestCount=await client.nourishIntake.count();
    await clickButton('Add client');await page.waitForSelector('#client-name');
    await page.type('#client-name','Browser synthetic household');await page.type('#client-phone','5155550199');await page.type('#client-size','2');
    assert.equal(await page.$eval('#client-language',select=>select.value),'unknown');
    const newClient=page.waitForResponse(response=>response.url().endsWith('/api/nourish/clients')&&response.request().method()==='POST');
    await clickButton('Save profile');assert.equal((await newClient).status(),201);
    await page.waitForFunction(()=>document.querySelector('main')?.textContent.includes('Browser synthetic household'));
    const household=(await client.nourishClient.findMany()).find(item=>item.profile.name==='Browser synthetic household');assert.ok(household);
    assert.equal(household.profile.language,null);assert.equal(household.phoneVerifiedAt,null);assert.equal(household.consent.enabled,false);
    assert.equal(await client.nourishIntake.count(),requestCount,'A staff household record is not a request.');
    await page.evaluate(()=>{
      const row=[...document.querySelectorAll('tr')].find(element=>element.textContent.includes('Browser synthetic household'));
      [...(row?.querySelectorAll('button')??[])].find(button=>button.textContent.includes('View household'))?.click();
    });
    await page.waitForFunction(()=>document.querySelector('[role="dialog"]')?.textContent.includes('Profile audit history'));
    assert.ok((await page.$eval('[role="dialog"]',element=>element.textContent)).includes('Phone not verified'));
    if(outputDir)await page.screenshot({path:path.join(outputDir,'client-household.png'),fullPage:true});
    await page.keyboard.press('Escape');await clickButton('Call drafts & history');await clickButton('View call & draft');
    await page.waitForFunction(()=>document.querySelector('[role="dialog"]')?.textContent.includes('retained for 30 days'));
    assert.ok(!(await page.$eval('[role="dialog"]',element=>element.textContent)).includes('synthetic-code'));
    await page.keyboard.press('Escape');await clickButton('Changes & missed deliveries');
    await page.waitForFunction(()=>document.querySelector('main')?.textContent.includes('version conflict'));
    await visit('/analytics?tab=clients','MealLine households');
    await page.waitForFunction(()=>document.querySelector('main')?.textContent.includes('Completed deliveries'));
    if(outputDir)await page.screenshot({path:path.join(outputDir,'mealline-client-analytics.png'),fullPage:true});
    await visit('/intakes', 'Voice Intakes');
    await clickButton('Add intake');
    await page.waitForSelector('#intake-case');
    await page.type('#intake-case', 'browser-fixture');
    await page.type('#intake-household', '2');
    await page.type('#intake-avoid', 'vegan');
    await page.select('#intake-language', 'es');
    const saved = page.waitForResponse((response) => response.url().endsWith('/api/nourish/intakes') && response.request().method() === 'POST');
    await clickButton('Save & match');
    assert.equal((await saved).status(), 201);
    await page.waitForFunction(() => document.querySelector('main')?.textContent.includes('browser-fixture'));
    const intake = await client.nourishIntake.findUnique({ where: { caseNumber: 'browser-fixture' } });
    assert.equal(intake.language, 'es');
    assert.equal(intake.householdSize, 2);
    assert.equal(await client.nourishBasket.count({ where: { intakeId: intake.id } }), 1);
    if (outputDir) await page.screenshot({ path: path.join(outputDir, 'intakes-desktop.png'), fullPage: true });

    await visit('/household-baskets', 'Household Baskets');
    await clickButton('Review');
    await page.waitForSelector('#basket-title');
    await page.waitForFunction(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return dialog && dialog.getAnimations().every((animation) => animation.playState !== 'running');
    });
    assert.ok(await page.$('a[href*="/api/nourish/baskets/"][href$="/pdf"]'));
    if (outputDir) await page.screenshot({ path: path.join(outputDir, 'basket-review.png'), fullPage: true });
    await page.keyboard.press('Escape');

    await visit('/deliveries', 'Deliveries');
    await page.locator('::-p-aria(Volunteer roster)').click();
    await page.waitForFunction(() => document.querySelector('main')?.textContent.includes('Synthetic Volunteer'));
    if (outputDir) await page.screenshot({ path: path.join(outputDir, 'volunteer-roster.png'), fullPage: true });

    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await visit('/intakes', 'Voice Intakes');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), 'Intakes should fit the mobile viewport');
    if (outputDir) await page.screenshot({ path: path.join(outputDir, 'intakes-mobile.png'), fullPage: true });
    assert.deepEqual(apiFailures, [], 'Browser API requests should not produce server errors');
    console.log('✓ Browser verification passed: 20 workspaces, real household creation/audit, call drafts, change review, separate MealLine analytics, staff intake, baskets, volunteers and mobile layout.');

    const originalMode = process.env.NODE_ENV;
    const originalFlag = process.env.NOURISH_DEV_LOGIN;
    const hasDeveloperButton = () => page.evaluate(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Sign in as developer')));
    async function loginScreen(enabled) {
      const checked = page.waitForResponse(response => response.url().endsWith('/api/auth/developer-login/status'));
      await page.goto(base + '/feed/login', { waitUntil: 'domcontentloaded' });
      assert.equal((await (await checked).json()).enabled, enabled);
      await page.waitForSelector('#magic-email');
      await page.waitForFunction(expected => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Sign in as developer')) === expected, {}, enabled);
    }
    try {
      await page.setViewport({ width: 1440, height: 1000 });
      await page.deleteCookie({ name: 'auth_token', domain: '127.0.0.1', path: '/' });
      process.env.NOURISH_DEV_LOGIN = 'false';
      await loginScreen(false);
      assert.equal(await hasDeveloperButton(), false);
      process.env.NOURISH_DEV_LOGIN = 'true';
      await loginScreen(true);
      await page.waitForFunction(() => {
        let element = document.querySelector('#magic-email');
        while (element) {
          if (Number(getComputedStyle(element).opacity) < 0.999) return false;
          element = element.parentElement;
        }
        return true;
      });
      if (outputDir) await page.screenshot({ path: path.join(outputDir, 'developer-login.png'), fullPage: true });
      const signedIn = page.waitForResponse(response => response.url().endsWith('/api/auth/developer-login') && response.request().method() === 'POST');
      await clickButton('Sign in as developer');
      assert.equal((await signedIn).status(), 200);
      await page.waitForFunction(() => document.querySelector('main')?.textContent.includes('Dashboard'));
      const permissions = await page.evaluate(async () => {
        const session = await (await fetch('/feed/api/auth/session')).json();
        const admin = await fetch('/feed/api/admin/users');
        return { role: session.user?.role, adminStatus: admin.status };
      });
      assert.deepEqual(permissions, { role: 'ADMINISTRATOR', adminStatus: 200 });
      if (outputDir) await page.screenshot({ path: path.join(outputDir, 'developer-dashboard.png'), fullPage: true });
      await page.evaluate(async () => { await fetch('/feed/api/auth/logout', { method: 'POST' }); });
      process.env.NODE_ENV = 'production';
      await loginScreen(false);
      const refused = await page.evaluate(async () => (await fetch('/feed/api/auth/developer-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status);
      assert.equal(refused, 404);
      console.log('✓ Developer browser flow passed: hidden by default, real button/session/admin access, logout, and hidden/refused in production.');
    } finally {
      process.env.NODE_ENV = originalMode;
      process.env.NOURISH_DEV_LOGIN = originalFlag;
    }
    assert.deepEqual(failures, [], 'Developer login should not produce browser exceptions');
    assert.deepEqual(apiFailures, [], 'Developer login should not produce server errors');
  } catch (error) {
    if (outputDir) {
      const pages = await browser.pages();
      await pages.at(-1)?.screenshot({ path: path.join(outputDir, 'browser-failure.png'), fullPage: true });
      await fs.writeFile(path.join(outputDir, 'browser-failures.json'), JSON.stringify({ failures, apiFailures, error: error.message }, null, 2));
    }
    throw error;
  } finally {
    await browser.close();
  }
}
