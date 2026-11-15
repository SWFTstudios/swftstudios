import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const slugs = ["websites","apps","software","marketing","content","automations","analytics","photography","videography","social-media","live-streaming"];
const read = (p) => readFileSync(new URL("../../"+p, import.meta.url),"utf8");
test("homepage offers immediate booking, real work and a concise service route",()=>{
  const html=read("index.html");
  assert.ok(html.indexOf('id="work"') < html.indexOf('id="services"'));
  assert.ok(html.indexOf('id="services"') < html.indexOf('id="book"'));
  assert.match(html,/Book a free discovery call/);
  assert.doesNotMatch(html,/data-swft-flow|swft-start-title|data-mf-carousel/);
});
for(const slug of slugs){
  test("campaign "+slug+" has booking and attribution",()=>{
    const html=read("campaigns/"+slug+".html");
    assert.match(html,/name="robots" content="noindex,follow"/);
    assert.match(html,/name="description"/);
    assert.match(html,/data-funnel-cta="calendar"/);
    assert.match(html,/data-funnel-cta="inquiry"/);
    assert.match(html,/js\/funnel-attribution\.js/);
    assert.match(html,/cal\.com\/swftstudios\/swft-meeting/);
    assert.equal((html.match(/<section\b/g)||[]).length,(html.match(/<\/section>/g)||[]).length);
    assert.match(html,/\/services\.html/);
  });
}

test("booked notification bubble opens the existing this-could-be-you dialog",()=>{
  const homepage=read("index.html");
  const script=read("js/notify-badge.js");
  const nav=read("js/swft-nav.js");
  assert.match(homepage, /class="mf-notify" data-mf-notify/);
  assert.match(homepage, /<span class="mf-script">Get booked\.<\/span>/);
  assert.match(nav, /\[data-mf-notify\].*notify-badge\.js/);
  assert.match(script, /This could be you\./);
  assert.match(script, /aria-haspopup.*dialog/);
});
test("featured project names stay grouped during word animations",()=>{
  const homepage=read("index.html");
  const css=read("css/conversion-funnel.css");
  for (const name of ["Built By Me EZ","Blurred Lines Entertainment","Brooklyn Steel Co."]) {
    assert.ok(homepage.includes('<span class="fnl-project__name">'+name+'</span>'));
  }
  assert.match(css, /\.fnl-project h3 \.fnl-project__name/);
  assert.match(css, /\.fnl-project h3 \.fnl-project__arrow/);
  assert.doesNotMatch(css, /\.fnl-project h3 span \{/);
});
