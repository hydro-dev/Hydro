const fs=require('fs'),assert=require('assert/strict');
const {chromium}=require('playwright');
const root=process.env.HGNUOJ_TOC_REPORT_DIR||fs.mkdtempSync(require('path').join(require('os').tmpdir(),'hgnu-toc-')),base=process.env.HGNUOJ_TEST_URL||'http://127.0.0.1:8888',path='/discuss/669f290c911ca250f716994c';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:chromium.executablePath(),args:['--no-sandbox']});
 const results=[];
 try{
  for(const [mode,width,height]of [['desktop',1280,900],['mobile',390,844],['tablet',800,900]]){
   console.log('Checking',mode);
   const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:mode==='mobile'?2:1,isMobile:mode==='mobile',hasTouch:mode==='mobile',serviceWorkers:'block'});
   const page=await context.newPage(),errors=[],images=new Set();
   const devtools=await context.newCDPSession(page);await devtools.send('Network.enable');await devtools.send('Network.setBlockedURLs',{urls:['*qlogo.cn/*','*sentry.io/*']});
   page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/preview/'))images.add(r.url())});
   await page.goto(base+path,{waitUntil:'domcontentloaded'});
   const desktop=mode==='desktop',nav=page.locator(desktop?'.discussion-toc--desktop':'.discussion-toc--mobile');
   if(!desktop)await page.locator('.discussion-toc-toggle').click();
   await nav.waitFor({state:'visible'});await page.waitForTimeout(400);
   const headings=await page.locator('.topic__content h1,.topic__content h2,.topic__content h3,.topic__content h4,.topic__content h5,.topic__content h6').evaluateAll(nodes=>nodes.map(n=>({id:n.id,text:n.textContent.trim()})));
   assert.ok(headings.length>10);assert.equal(await nav.locator('.discussion-toc-link').count(),headings.length);
   const links=await nav.locator('.discussion-toc-link').evaluateAll(nodes=>nodes.map(n=>({hash:n.hash,text:n.textContent})));
   assert.deepEqual(links.map(l=>l.text),headings.map(h=>h.text));assert.deepEqual(links.map(l=>decodeURIComponent(l.hash.slice(1))),headings.map(h=>h.id));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal overflow');
   await page.screenshot({path:root+'/'+mode+'-initial.png'});
   const initialRequests=images.size,last=headings.at(-1);
   await nav.locator('.discussion-toc-link').last().click();
   await page.waitForTimeout(250);
   const position=()=>page.evaluate(id=>({top:document.getElementById(id).getBoundingClientRect().top,offset:(getComputedStyle(document.querySelector('.nav')).position==='fixed'?document.querySelector('.nav').getBoundingClientRect().height:0)+16}),last.id);
   const after=await position();assert.ok(Math.abs(after.top-after.offset)<4,JSON.stringify(after));
   assert.equal(decodeURIComponent(new URL(page.url()).hash.slice(1)),last.id);
   await page.waitForFunction(id=>document.querySelector('.discussion-toc--desktop [aria-current]')?.hash==='#'+encodeURIComponent(id),last.id);
   if(!desktop)assert.equal(await page.locator('.discussion-toc-mobile').evaluate(e=>e.open),false);
   if(desktop){const bounds=await nav.boundingBox();assert.ok(bounds.y>=45&&bounds.y<80,'Directory sticks below navbar');assert.ok(bounds.y+bounds.height<=height,'Directory stays in viewport');}
   await page.screenshot({path:root+'/'+mode+'-last-section.png'});
   await page.reload({waitUntil:'domcontentloaded'});await page.locator('.discussion-toc--desktop .discussion-toc-link').first().waitFor({state:'attached'});await page.waitForTimeout(350);
   const reloaded=await position();assert.ok(Math.abs(reloaded.top-reloaded.offset)<4,'Reload preserves heading position');
   if(!desktop)await page.locator('.discussion-toc-toggle').click();
   await nav.locator('.discussion-toc-link').nth(headings.length-2).click();await page.waitForTimeout(100);
   await page.goBack();await page.waitForTimeout(200);assert.equal(decodeURIComponent(new URL(page.url()).hash.slice(1)),last.id);
   const backed=await position();assert.ok(Math.abs(backed.top-backed.offset)<4,'Back restores section');
   if(!desktop)await page.locator('.discussion-toc-toggle').click();
   await nav.getByText('到正文底部',{exact:true}).click();await page.waitForTimeout(150);
   assert.ok(await page.locator('#discussion-end').evaluate(n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.top<=innerHeight}));
   if(!desktop)await page.locator('.discussion-toc-toggle').click();
   await nav.getByText('回到顶部',{exact:true}).click();await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>scrollY),0);
   if(!desktop){
    await page.locator('.discussion-toc-toggle').click();await page.keyboard.press('Escape');assert.equal(await page.locator('.discussion-toc-mobile').evaluate(e=>e.open),false);
    await page.locator('.discussion-toc-toggle').click();await page.mouse.click(width-20,100);assert.equal(await page.locator('.discussion-toc-mobile').evaluate(e=>e.open),false);
   }
   const requestsAfterJumps=images.size;assert.ok(requestsAfterJumps<40,'Direct jumps should not load every intervening image');
   // The old renderer's singly encoded Chinese fragments still work too.
   await page.goto(base+path+'#'+headings[0].id,{waitUntil:'domcontentloaded'});await page.waitForTimeout(1200);
   assert.ok(await page.evaluate(id=>Math.abs(document.getElementById(id).getBoundingClientRect().top-((getComputedStyle(document.querySelector('.nav')).position==='fixed'?document.querySelector('.nav').getBoundingClientRect().height:0)+16))<4,headings[0].id));
   // Exercise nested headings, duplicate IDs, plain-text labels and partial refresh without writing DB fixtures.
   await page.evaluate(()=>{
    document.querySelector('.topic__content').innerHTML='<h2 id="same">重复</h2><h3>&lt;img src=x onerror=alert(1)&gt;</h3><h2 id="same">重复</h2><p><strong>加粗不入目录</strong></p><pre><code>## 代码不入目录</code></pre>';
    window.jQuery(document).trigger('vjContentNew');
   });
   assert.equal(await page.locator('.discussion-toc--desktop .discussion-toc-link').count(),3);
   assert.equal(await page.locator('.discussion-toc img').count(),0);
   const ids=await page.locator('.topic__content h2,.topic__content h3').evaluateAll(nodes=>nodes.map(n=>n.id));assert.equal(new Set(ids).size,3);
   assert.equal(await page.locator('.discussion-toc--desktop .discussion-toc-link').nth(1).evaluate(e=>e.style.getPropertyValue('--toc-depth')),'1');
   await page.evaluate(()=>{window.jQuery(document).trigger('vjContentNew');window.jQuery(document).trigger('vjContentNew')});
   assert.equal(await page.locator('.discussion-toc').count(),2);
   await page.evaluate(()=>{document.querySelector('.topic__content').innerHTML='<h2>只有一个标题</h2>';window.jQuery(document).trigger('vjContentNew')});
   assert.equal(await page.locator('.discussion-toc').count(),0);assert.equal(await page.locator('.discussion-toc-mobile').count(),0);
   assert.equal(errors.length,0,JSON.stringify(errors));
   results.push({mode,headings:headings.length,initialPreviewRequests:initialRequests,previewRequestsAfterJumps:requestsAfterJumps,sticky:desktop,mobileClose:!desktop,hashReload:true,historyBack:true,legacyChineseFragment:true,topAndBottom:true,nestedAndDuplicateHeadings:true,refreshCleanup:true,errors});
   await context.close();
  }
 }finally{await browser.close()}
 fs.writeFileSync(root+'/browser-validation.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exit(1)});
