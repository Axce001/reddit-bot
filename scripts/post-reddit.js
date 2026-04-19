const { chromium } = require('playwright');
const { execSync } = require('child_process');

const ACTION       = (process.env.ACTION || 'comment').toLowerCase();
const SUBREDDIT    = process.env.SUBREDDIT    || '';
const KEYWORD      = process.env.KEYWORD      || '';
const COMMENT_TEXT = process.env.COMMENT_TEXT || '';
const POST_TITLE   = process.env.POST_TITLE   || '';
const POST_BODY    = process.env.POST_BODY    || '';

const cookieSets = [];
for (let i = 1; i <= 10; i++) {
  const raw = i === 1 ? process.env.REDDIT_COOKIES : process.env[`REDDIT_COOKIES_${i}`];
  if (raw) cookieSets.push({ raw, idx: i });
}
if (!cookieSets.length) { console.log('ERROR: No REDDIT_COOKIES found'); process.exit(1); }

const BUILTIN_COMMENTS = [
  { keyword: 'anonymous chat app',      sub: 'androidapps',        text: 'Have you tried Whisprr? Built for anonymous chatting \u2014 no real name or photo needed. https://whisprrchat.com' },
  { keyword: 'omegle alternative',      sub: 'chat',               text: 'For an Omegle-style experience, Whisprr is worth trying. Fully anonymous, no personal info required. https://whisprrchat.com' },
  { keyword: 'talk to strangers',       sub: 'MakeNewFriendsHere', text: 'Whisprr lets you talk to strangers completely anonymously. https://whisprrchat.com' },
  { keyword: 'anonymous messaging',     sub: 'privacy',            text: 'Whisprr keeps your identity hidden while you have real conversations. No forced registration. https://whisprrchat.com' },
  { keyword: 'random chat app',         sub: 'chat',               text: 'Whisprr does random anonymous chat really well \u2014 no account setup, just open and chat. https://whisprrchat.com' },
  { keyword: 'meet new people online',  sub: 'MakeNewFriendsHere', text: 'Whisprr is great for meeting people anonymously. No identity required. https://whisprrchat.com' },
  { keyword: 'private chat app',        sub: 'privacy',            text: 'Whisprr is a privacy-first anonymous chat app \u2014 nothing tied to your real identity. https://whisprrchat.com' },
  { keyword: 'apps like omegle',        sub: 'chat',               text: 'Whisprr is a solid modern Omegle alternative \u2014 anonymous and no identity required. https://whisprrchat.com' },
  { keyword: 'anonymous social app',    sub: 'privacy',            text: 'Whisprr lets you meet people and chat without revealing who you are. https://whisprrchat.com' },
  { keyword: 'chat with strangers',     sub: 'androidapps',        text: 'Check out Whisprr for chatting with strangers anonymously. No personal info needed. https://whisprrchat.com' },
];

const BUILTIN_POSTS = [
  { subreddit: 'androidapps', title: 'Whisprr \u2013 Anonymous Chat App (No Login Required)', body: 'Been using **Whisprr** for anonymous chatting and wanted to share it.\n\n**What it does:** Chat with people completely anonymously \u2014 no real name, no photo, no personal info.\n\n**Why I like it:**\n- 100% anonymous by design\n- Clean, minimal UI\n- No spam or forced registration\n\nhttps://whisprrchat.com' },
  { subreddit: 'privacy',     title: 'Anonymous chat app that actually respects privacy \u2013 Whisprr', body: 'Found an app called **Whisprr** that takes anonymity seriously.\n\nNo real name. No profile photo. No linking conversations to your identity.\n\nhttps://whisprrchat.com' },
  { subreddit: 'chat',        title: 'Good anonymous chat app? Try Whisprr', body: 'If you want to chat without revealing who you are, **Whisprr** is the cleanest option.\n\nFully anonymous, no signup friction.\n\nhttps://whisprrchat.com' },
  { subreddit: 'MakeNewFriendsHere', title: 'Anonymous Chat App for Meeting New People \u2013 Whisprr', body: 'For anyone who wants to meet new people but stay anonymous \u2014 **Whisprr** is a solid option.\n\nhttps://whisprrchat.com' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function startXvfb() {
  try {
    execSync('pkill Xvfb || true', { stdio: 'ignore' });
    execSync('Xvfb :99 -screen 0 1280x800x24 -ac &', { stdio: 'ignore', shell: true });
    execSync('sleep 2');
    process.env.DISPLAY = ':99';
    console.log('Xvfb started');
  } catch (e) { console.log('Xvfb warning:', e.message); }
}

function normSameSite(v) {
  if (!v) return 'Lax';
  const l = v.toLowerCase();
  if (l === 'strict') return 'Strict';
  if (l === 'none' || l === 'no_restriction') return 'None';
  return 'Lax';
}

async function main() {
  if (process.platform === 'linux') startXvfb();
  const isCI     = !!process.env.CI;
  const execPath = isCI ? '/usr/bin/google-chrome-stable' : undefined;

  const browser = await chromium.launch({
    ...(execPath ? { executablePath: execPath } : {}),
    headless: isCI,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  const page = await ctx.newPage();

  // ── Cookie login ──
  let loggedIn = false;
  for (const account of [...cookieSets].sort(() => Math.random() - 0.5)) {
    console.log(`Trying account ${account.idx}...`);
    try {
      const cookies = JSON.parse(account.raw).map(c => ({
        name:     c.name,
        value:    c.value,
        domain:   c.domain.startsWith('.') ? c.domain : ('.' + c.domain.replace(/^www\./, '')),
        path:     c.path || '/',
        expires:  typeof c.expires === 'number' ? c.expires : (c.expirationDate || -1),
        httpOnly: !!c.httpOnly,
        secure:   !!c.secure,
        sameSite: normSameSite(c.sameSite),
      }));
      await page.goto('https://old.reddit.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await ctx.addCookies(cookies);
      console.log(`Injected ${cookies.length} cookies`);
      await page.goto('https://old.reddit.com/', { waitUntil: 'networkidle', timeout: 30000 });
      await sleep(3000);
      const diag = await page.evaluate(() => {
        const u = document.querySelector('#header-bottom-right .user a');
        return { username: u ? u.textContent.trim() : null, loggedOut: !!document.querySelector('.logged-out') };
      });
      console.log('Login diag:', JSON.stringify(diag));
      if (diag.username && !diag.loggedOut) { loggedIn = true; console.log('Logged in as:', diag.username); break; }
      console.log(`Account ${account.idx}: cookies expired`);
      await ctx.clearCookies();
    } catch (e) { console.log(`Account ${account.idx} error:`, e.message); await ctx.clearCookies(); }
  }
  if (!loggedIn) { console.log('ERROR: All accounts failed. Re-export REDDIT_COOKIES.'); await browser.close(); process.exit(1); }

  let success = false;
  try {
    if      (ACTION === 'comment') success = await doComment(page, ctx);
    else if (ACTION === 'upvote')  success = await doUpvote(page);
    else if (ACTION === 'post')    success = await doPost(page);
    else console.log('Unknown ACTION:', ACTION);
  } catch (e) { console.log('Action error:', e.message); console.log(e.stack); }

  await browser.close();
  if (!success) { console.log('Action FAILED'); process.exit(1); }
  console.log('Action completed successfully!');
}

async function doComment(page, ctx) {
  const i   = (new Date().getHours() + new Date().getDate() * 3) % BUILTIN_COMMENTS.length;
  const fb  = BUILTIN_COMMENTS[i];
  const txt = COMMENT_TEXT || fb.text;
  const kw  = KEYWORD      || fb.keyword;
  const sub = SUBREDDIT    || fb.sub;
  console.log(`Comment: keyword="${kw}" sub=r/${sub}`);

  await page.goto(`https://old.reddit.com/r/${sub}/search?q=${encodeURIComponent(kw)}&sort=new&restrict_sr=on&limit=10`, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(3000);
  let links = await page.evaluate(() => Array.from(document.querySelectorAll('.thing .title a.title')).map(a => a.href).filter(h => h.includes('/comments/')).slice(0, 5));
  if (!links.length) {
    await page.goto(`https://old.reddit.com/r/${sub}/new/`, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(3000);
    links = await page.evaluate(() => Array.from(document.querySelectorAll('.thing .title a.title')).map(a => a.href).filter(h => h.includes('/comments/')).slice(0, 5));
  }
  if (!links.length) { console.log('No posts found'); return false; }
  console.log(`Found ${links.length} posts`);

  for (const link of links.slice(0, 3)) {
    try {
      await page.goto(link, { waitUntil: 'networkidle', timeout: 30000 });
      await sleep(3000);
      const ta = await page.$('form.usertext textarea[name="text"]');
      if (!ta) { console.log('No comment form at:', link); continue; }
      await ta.click(); await sleep(300);
      await page.keyboard.type(txt, { delay: 20 });
      await sleep(800);
      const btn = await page.$('form.usertext button.save, form.usertext input.save');
      if (!btn) { console.log('No save button'); continue; }
      await btn.click(); await sleep(5000);
      const err = await page.$('.error.message');
      if (err) { console.log('Error:', await err.textContent()); continue; }
      console.log('Commented on:', link);
      return true;
    } catch (e) { console.log('Attempt failed:', e.message); }
  }
  return false;
}

async function doUpvote(page) {
  const fb  = BUILTIN_COMMENTS[Math.floor(Math.random() * BUILTIN_COMMENTS.length)];
  const sub = SUBREDDIT || fb.sub;
  const kw  = KEYWORD   || fb.keyword;
  console.log(`Upvoting r/${sub} keyword="${kw}"`);
  await page.goto(`https://old.reddit.com/r/${sub}/search?q=${encodeURIComponent(kw)}&sort=new&restrict_sr=on`, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(3000);
  let btns = await page.$$('.thing:not(.likes) .arrow.up');
  if (!btns.length) {
    await page.goto(`https://old.reddit.com/r/${sub}/new/`, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(3000);
    btns = await page.$$('.thing:not(.likes) .arrow.up');
  }
  let count = 0;
  for (const btn of btns.slice(0, 8)) { try { await btn.click(); await sleep(1000 + Math.random() * 800); count++; } catch {} }
  console.log(`Upvoted ${count} posts`);
  return count > 0;
}

async function doPost(page) {
  const i     = (new Date().getDate() + new Date().getMonth()) % BUILTIN_POSTS.length;
  const fb    = BUILTIN_POSTS[i];
  const sub   = SUBREDDIT  || fb.subreddit;
  const title = POST_TITLE || fb.title;
  const body  = POST_BODY  || fb.body;
  console.log(`Post to r/${sub}: "${title}"`);
  await page.goto(`https://old.reddit.com/r/${sub}/submit?selftext=true`, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(3000);
  if (page.url().includes('/login')) { console.log('Redirected to login'); return false; }
  const titleEl = await page.$('#title');
  if (!titleEl) { console.log('Title input not found'); return false; }
  await titleEl.fill(title); await sleep(400);
  const ta = await page.$('#text');
  if (ta) { await ta.fill(body); await sleep(400); }
  const submit = await page.$('button[value="Submit"]');
  if (!submit) { console.log('Submit button not found'); return false; }
  await submit.click(); await sleep(5000);
  const finalUrl = page.url();
  console.log('Post result URL:', finalUrl);
  return finalUrl.includes('/comments/') || !finalUrl.includes('/submit');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
