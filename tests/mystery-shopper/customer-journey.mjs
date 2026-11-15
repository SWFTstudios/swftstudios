import fs from "node:fs/promises";
import { chromium } from "playwright";
const root=(process.env.SWFT_TEST_URL||"https://swftstudios.com").replace(/\/$/,"");
const submit=process.env.SWFT_TEST_SEND_INQUIRY==="1";
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:"reduce",timezoneId:"America/New_York"});
const page=await context.newPage();
page.setDefaultTimeout(15000);
const steps=[],errors=[];
const out="artifacts/mystery-shopper";
await fs.mkdir(out,{recursive:true});
const compact=s=>String(s||"").replace(/\s+/g," ").trim().slice(0,2000);
page.on("pageerror",e=>errors.push(compact(e.message)));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function snap(name,p=page){try{await p.screenshot({path:out+"/"+name+".png",timeout:15000});}catch(e){console.log("SCREENSHOT_ERROR",name,compact(e.message));}}
async function step(name,action){
  console.log("START "+name);
  try{const details=await action();steps.push({name,status:"PASS",details});console.log("PASS "+name+" "+JSON.stringify(details));}
  catch(e){steps.push({name,status:"FAIL",error:compact(e.stack||e.message)});console.log("FAIL "+name+" "+compact(e.stack||e.message));await snap("fail-"+steps.length);}
}
await step("Homepage first impression",async()=>{
  const response=await page.goto(root+"/",{waitUntil:"domcontentloaded",timeout:60000});
  await page.locator("#hero-title").waitFor({timeout:25000});
  await pause(1200);await snap("01-home");
  const title=compact(await page.locator("#hero-title").innerText());
  const actions=await page.locator(".fnl-primary-actions a").allTextContents();
  if(!title.toLowerCase().includes("booked"))throw Error("Expected current hero not found: "+title);
  return {status:response.status(),title,actions};
});
await step("Predictive search",async()=>{
  await page.locator(".sn-nav [data-swft-search-open]").click();
  await page.locator("#swft-search-input").waitFor();
  await page.locator("#swft-search-input").fill("landing page");
  await pause(800);await snap("02-search");
  const suggestions=await page.locator("#swft-search-results a").allTextContents();
  if(!suggestions.length)throw Error("No results for landing page");
  await page.keyboard.press("Escape");
  return {suggestions:suggestions.slice(0,5).map(compact)};
});
await step("Configure website and add-ons",async()=>{
  await page.goto(root+"/build.html",{waitUntil:"domcontentloaded",timeout:60000});
  await page.locator('[data-service="websites"]').waitFor({timeout:25000});
  await page.locator('[data-service="websites"]').click();
  await page.locator('[data-scenario="landing"]').click();
  await page.locator('[data-tier="website-only"]').click();
  await page.locator("#swb-next").click();
  await page.locator('[data-extra="extra-pages"]').click();
  const receipt=compact(await page.locator("#swb-summary").innerText());
  await snap("03-builder");
  const receiptAccurate=receipt.includes("Additional website page")&&receipt.includes("$575");
  await page.locator("#swb-add-cart").click();
  await page.waitForURL(u=>u.pathname==="/cart"||u.pathname==="/cart.html",{timeout:25000});
  const cart=compact(await page.locator("body").innerText());
  await snap("04-cart");
  if(!cart.includes("Additional website page")||!cart.includes("Website Only"))throw Error("Cart missing selected items: "+cart);
  if(!receiptAccurate)throw Error("Builder receipt omits selected extra, while cart displays it: "+receipt+" / CART "+cart.slice(0,500));
  return {receipt,cart:cart.slice(0,800),paid:false};
});
await step("Inquiry form as first-time customer",async()=>{
  await page.goto(root+"/contact.html?service=websites&utm_source=swft_qa",{waitUntil:"domcontentloaded",timeout:60000});
  await page.locator("#contact-form").waitFor({timeout:25000});
  const selected=await page.locator('#contact-service input[name="service_needed"]:checked').count();
  await page.locator("#contact-name").fill("SWFT QA Test Customer");
  await page.locator("#contact-email").fill("hello@swftstudios.com");
  await page.locator("#contact-business").fill("[SWFT TEST] Local Fitness Studio");
  await page.locator("#contact-challenge").fill("[SWFT TEST - IGNORE] Fictional personal trainer needs a lead-gen landing page and consultation booking flow. This is an automated QA test, not a genuine sales lead.");
  await snap("05-contact-ready");
  if(!selected)throw Error("service=websites did not preselect Website");
  if(!submit)return {selected,submitted:false,reason:"Preview-only guard; no live lead created."};
  await page.locator("#contact-submit").click();
  await page.locator("#contact-status.is-success").waitFor({timeout:30000});
  await snap("06-inquiry-success");
  return {selected,submitted:true,confirmation:compact(await page.locator("#contact-status").innerText())};
});
await step("Discovery calendar reachable",async()=>{
  const p=await context.newPage();
  p.setDefaultTimeout(18000);
  try{
    const response=await p.goto("https://cal.com/swftstudios/swft-meeting",{waitUntil:"domcontentloaded",timeout:65000});
    await pause(6000);
    const headings=await p.locator("h1,h2,h3").allTextContents();
    const buttons=(await p.locator("button").allTextContents()).filter(Boolean).slice(0,45);
    const text=compact(await p.locator("body").innerText());
    await snap("07-calendar",p);
    if(!/swft|meeting|select|calendar|booking|30 min/i.test(text))throw Error("Booking calendar did not load: "+text);
    const slots=p.locator("button").filter({hasText:/8:30pm|9:00pm|9:30pm/i});
    let form={selectedSlot:false};
    if(await slots.count()){
      await slots.first().click();
      await pause(900);
      await snap("08-calendar-selected",p);
      form={selectedSlot:true,url:p.url(),body:compact(await p.locator("body").innerText()).slice(0,1100),inputs:await p.locator("input").evaluateAll(nodes=>nodes.map(n=>({name:n.name,type:n.type,placeholder:n.placeholder})).slice(0,20)),buttons:(await p.locator("button").allTextContents()).map(compact).slice(-20)};
    }
    return {status:response.status(),headings:headings.map(compact),buttons:buttons.map(compact),body:text.slice(0,1000),form,bookingConfirmed:false};
  }finally{await p.close();}
});
await fs.writeFile(out+"/result.json",JSON.stringify({root,submit,steps,errors},null,2));
await browser.close();
console.log("AUDIT_REPORT "+JSON.stringify({steps,errors}));
if(steps.some(s=>s.status==="FAIL"))process.exitCode=1;
