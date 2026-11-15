#!/usr/bin/env node
/** Build predictive search index from public service, offer, scenario and portfolio data. */
import {readFileSync,writeFileSync} from "node:fs";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const read=(file)=>JSON.parse(readFileSync(join(root,file),"utf8"));
function buildIndex(services,pricing,work,builder){
 const index=[
 {id:"page-home",kind:"Page",title:"SWFT Studios",url:"/",description:"Websites, video, automation and marketing in NYC and North Jersey",keywords:"home agency studio"},
 {id:"page-builder",kind:"Tool",title:"Build your service package",url:"/build.html",description:"Choose a package, customize extras and see the price",keywords:"builder customize configure services addons add ons bowl quote"},
 {id:"page-pricing",kind:"Page",title:"Service pricing",url:"/pricing.html",description:"Published packages and starting prices",keywords:"prices cost rates budget"},
 {id:"page-work",kind:"Page",title:"SWFT portfolio",url:"/work.html",description:"Real client projects and case studies",keywords:"examples clients projects proof"},
 {id:"page-call",kind:"Call",title:"Book a free discovery call",url:"https://cal.com/swftstudios/swft-meeting",description:"Get help deciding what to build",keywords:"call discovery consult appointment calendar"},
 {id:"page-contact",kind:"Page",title:"Send a project inquiry",url:"/contact.html",description:"Describe your project and receive next steps",keywords:"contact email quote"},
 {id:"page-guide",kind:"Guide",title:"Free SWFT Growth Guide",url:"/growth-guide.html",description:"Find where customers get stuck",keywords:"free audit diagnose funnel growth"}
 ];
 services.services.forEach(s=>index.push({id:"service-"+s.slug,kind:"Service",title:s.name,url:"/"+s.slug+".html",description:s.description,keywords:[s.menuLine,s.group,s.h1.replace(/<[^>]+>/g,"")].join(" ")}));
 const offerServiceId={};
 pricing.categories.forEach(c=>(c.services||[]).forEach(s=>(s.offers||[]).forEach(o=>{offerServiceId[o.id]=s.id;index.push({id:"offer-"+o.id,kind:"Package",title:o.name,url:o.bookUrl||"/pricing.html#"+o.id,description:[o.description,o.priceLabel].join(" "),keywords:[s.name,o.kind, ...(o.includes||[]).slice(0,3)].join(" ").slice(0,350)}); })));
 builder.services.forEach(s=>s.scenarios.forEach(g=>index.push({id:"build-"+s.id+"-"+g.id,kind:"Build a package",title:g.name,url:"/build.html?service="+encodeURIComponent(s.id)+"&goal="+encodeURIComponent(g.id),description:g.description,keywords:s.name+" "+s.line+" "+g.name})));
 work.filter(p=>p.public!==false).forEach(p=>index.push({id:"work-"+p.slug,kind:"Case study",title:p.name,url:"/case-study/"+p.slug+".html",description:p.highlight||p.hubDetails||p.description||"",keywords:[p.categoryLabel,p.tag,p.goal,p.outcomeType].join(" ").slice(0,380)}));
 return index;
}
const out=buildIndex(read("data/services.json"),read("data/pricing.json"),read("data/portfolio-projects.json"),read("data/builder-paths.json"));
writeFileSync(join(root,"data/site-search.json"),JSON.stringify({entries:out},null,2)+"\n");
console.log("Indexed "+out.length+" public SWFT results");
