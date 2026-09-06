/* ============ LUMÉA SHARED SYSTEM ============
   Injects nav / menu / footer / bag / modal / cursor / curtain,
   wires smooth scroll, transitions, and motion primitives.
   Pages use window.LUMEA as their API. */
(function(){
'use strict';
const $=(s,c=document)=>c.querySelector(s);
const $$=(s,c=document)=>Array.from(c.querySelectorAll(s));
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch=matchMedia('(pointer: coarse)').matches;
const hasGsap=!!(window.gsap&&window.ScrollTrigger);
if(hasGsap)gsap.registerPlugin(ScrollTrigger);
if(reduced||!hasGsap)document.documentElement.classList.add('reduced');

const IMG='https://z-cdn-media.chatglm.cn/files/77a311be-4f67-46ca-a254-50b451ad457c.png?auth_key=1888669986-ad4da6606a1048d396241fd726e2f2e4-0-2c1b5bb477633ead98b1d09055e4e0e2';
const PRODUCTS={
  aerin:{id:'aerin',name:'AERIN',sub:'The Wireless Sculpt',price:68,tag:'bonded',cw:'porcelain',cws:['porcelain','rose','noir'],crop:'c-full',desc:'Bonded seams, zero wiring. A quiet architecture that lifts by cut, not by cage.'},
  aerinlong:{id:'aerinlong',name:'AERIN LONG',sub:'The Wireless Longline',price:84,tag:'bonded',cw:'noir',cws:['noir','porcelain'],crop:'c-mid',desc:'The Aerin line, extended — a longline band that spreads support across the ribs instead of concentrating it.'},
  noe:{id:'noe',name:'NOÉ',sub:'The Lace Balconette',price:74,tag:'lace',cw:'rose',cws:['rose','porcelain','noir'],crop:'c-side',desc:'Calais lace laid over a soft scaffold. Sheer where it can be, held where it must be.'},
  lune:{id:'lune',name:'LUNE',sub:'The Seamless Second-Skin',price:72,tag:'knit',cw:'noir',cws:['noir','porcelain'],crop:'c-mid',desc:'A nude-feel knit that disappears under everything, including expectations.'},
  vela:{id:'vela',name:'VELA',sub:'The Silk Triangle',price:79,tag:'silk',cw:'champagne',cws:['champagne','rose'],crop:'c-band',desc:'22-momme mulberry silk, bias-cut. Barely a bra. Entirely one.'},
  lunebody:{id:'lunebody',name:'LUNE BODY',sub:'The Second-Skin Body',price:98,tag:'knit',cw:'porcelain',cws:['porcelain','noir'],crop:'c-side',desc:'One piece, zero adjustments. The second-skin extended to the hips, with a silent closure.'}
};
const CW={
  porcelain:{label:'Porcelain',cls:'cw-porcelain'},
  rose:{label:'Rosewater',cls:'cw-rose'},
  noir:{label:'Noir',cls:'cw-noir'},
  champagne:{label:'Champagne',cls:'cw-champagne'}
};
const SWATCH={porcelain:'#E8DCC9',rose:'#C08A73',noir:'#24201B',champagne:'#D8C09A'};

/* ---------- chrome injection ---------- */
const PAGE=document.body.dataset.page||'';
const DARK=document.body.dataset.theme==='dark';

document.body.insertAdjacentHTML('afterbegin',`
<a class="skip-link" href="#main">Skip to content</a>
<div class="grain" aria-hidden="true"></div>
<div id="cursor" aria-hidden="true"><div class="c-ring"><span id="cursor-label"></span></div></div>
<div id="pt" aria-hidden="true"><span class="pt-mark">LUMÉA</span></div>
<header id="nav">
  <a class="brand" href="index.html" aria-label="LUMÉA home">LUMÉA</a>
  <nav class="nav-links" aria-label="Primary">
    <a href="collection.html" data-page="collection">Collection</a>
    <a href="anatomy.html" data-page="anatomy">Anatomy</a>
    <a href="atelier.html" data-page="atelier">Atelier</a>
    <a href="fit.html" data-page="fit">Fit Room</a>
    <a href="voices.html" data-page="voices">Voices</a>
  </nav>
  <div class="nav-right">
    <button id="bag-btn" class="nav-bag" aria-label="Open bag">
      <i data-lucide="shopping-bag"></i><span id="bag-count" class="bag-badge">0</span>
    </button>
    <button id="burger" class="burger" aria-label="Menu" aria-expanded="false"><span></span><span></span></button>
  </div>
</header>
<div id="menu" aria-hidden="true">
  <nav class="m-inner" aria-label="Main menu">
    <a class="m-link" href="index.html"><span class="m-num">01</span><span class="m-word">Home</span></a>
    <a class="m-link" href="collection.html"><span class="m-num">02</span><span class="m-word">Collection</span></a>
    <a class="m-link" href="anatomy.html"><span class="m-num">03</span><span class="m-word">Anatomy</span></a>
    <a class="m-link" href="atelier.html"><span class="m-num">04</span><span class="m-word">The Atelier</span></a>
    <a class="m-link" href="fit.html"><span class="m-num">05</span><span class="m-word">The Fit Room</span></a>
    <a class="m-link" href="voices.html"><span class="m-num">06</span><span class="m-word">Worn By You</span></a>
  </nav>
  <p class="m-foot">FW ’25 — THE SKIN SERIES · <a href="mailto:atelier@lumea.example">ATELIER@LUMEA.EXAMPLE</a></p>
</div>`);

document.body.insertAdjacentHTML('beforeend',`
<div id="bag-backdrop"></div>
<aside id="bag" aria-label="Shopping bag" aria-hidden="true">
  <header class="bag-head">
    <p>YOUR BAG <span id="bag-title-count"></span></p>
    <button id="bag-close" aria-label="Close bag"><i data-lucide="x"></i></button>
  </header>
  <div id="bag-items"></div>
  <div id="bag-empty">
    <i data-lucide="shopping-bag"></i>
    <p>Your bag is empty.<br>The rail, however, is full.</p>
    <button class="btn" id="bag-explore"><span>EXPLORE THE COLLECTION</span></button>
  </div>
  <div id="bag-foot" style="display:none">
    <div class="bag-sub"><span>SUBTOTAL</span><span id="bag-subtotal">$0</span></div>
    <p class="bag-note">Shipping calculated at checkout · 60-day fit guarantee included.</p>
    <button class="btn btn-primary btn-wide" id="checkout"><span>CHECKOUT</span><i data-lucide="arrow-right"></i></button>
  </div>
</aside>
<div id="modal" role="dialog" aria-modal="true" aria-label="Dialog">
  <div class="modal-card"><button id="modal-close" aria-label="Close dialog"><i data-lucide="x"></i></button><div id="modal-body"></div></div>
</div>
<div id="toasts" aria-live="polite"></div>
<footer>
  <div class="marquee" aria-hidden="true">
    <div class="mq-track">
      <div class="mq-set"><span>60-DAY FIT GUARANTEE</span><i></i><span>CARBON-NEUTRAL SHIPPING</span><i></i><span>REPAIRS FOR LIFE</span><i></i><span>SMALL-BATCH, ALWAYS</span><i></i><span>BONDED, NEVER WIRED</span><i></i></div>
      <div class="mq-set"><span>60-DAY FIT GUARANTEE</span><i></i><span>CARBON-NEUTRAL SHIPPING</span><i></i><span>REPAIRS FOR LIFE</span><i></i><span>SMALL-BATCH, ALWAYS</span><i></i><span>BONDED, NEVER WIRED</span><i></i></div>
    </div>
  </div>
  <div class="foot-main">
    <div class="foot-top">
      <p class="foot-blurb">Second-skin intimates, cut in small ateliers. Worn, forgotten, loved.</p>
      <nav class="foot-links" aria-label="Footer">
        <a href="index.html">Home</a><a href="collection.html">Collection</a>
        <a href="anatomy.html">Anatomy</a><a href="atelier.html">Atelier</a>
        <a href="fit.html">Fit Room</a><a href="voices.html">Voices</a>
        <a href="#main" class="to-top">Top</a>
      </nav>
    </div>
    <div class="foot-mark-wrap" aria-hidden="true"><span class="foot-mark">LUMÉA</span></div>
    <div class="foot-bottom"><p>© <span id="yr">2025</span> LUMÉA ATELIER</p><p>A DESIGN PROTOTYPE — CRAFTED WITH SILK &amp; CODE</p></div>
  </div>
</footer>`);

const nav=$('#nav');
if(DARK)nav.classList.add('on-dark');
 $$('.nav-links a').forEach(a=>{if(a.dataset.page===PAGE)a.classList.add('active');});
 $('#yr').textContent=new Date().getFullYear();
function icons(){window.lucide&&lucide.createIcons();}

/* ---------- smooth scroll ---------- */
let lenis=null;
if(!reduced&&hasGsap&&window.Lenis){
  lenis=new Lenis({duration:1.05});
  lenis.on('scroll',ScrollTrigger.update);
  gsap.ticker.add(t=>lenis.raf(t*1000));
  gsap.ticker.lagSmoothing(0);
}
function scrollToEl(t){
  const el=typeof t==='string'?$(t):t;if(!el)return;
  if(lenis)lenis.scrollTo(el,{duration:1.2});
  else el.scrollIntoView({behavior:'smooth'});
}
function lockScroll(on){
  document.documentElement.style.overflow=on?'hidden':'';
  if(lenis){on?lenis.stop():lenis.start();}
}

/* ---------- page-transition curtain ---------- */
const pt=$('#pt');
function go(href){
  if(!hasGsap||reduced){location.href=href;return;}
  closeMenu();closeBag();closeModal();
  gsap.to('.pt-mark',{opacity:1,duration:.25});
  gsap.to(pt,{yPercent:0,duration:.55,ease:'expo.inOut',onComplete:()=>{location.href=href;}});
}
if(hasGsap&&!reduced){
  gsap.set(pt,{yPercent:0});
  gsap.timeline()
    .fromTo('.pt-mark',{opacity:0},{opacity:1,duration:.3},0)
    .to('.pt-mark',{opacity:0,duration:.25},.5)
    .to(pt,{yPercent:101,duration:.75,ease:'expo.inOut'},.35)
    .from('main',{y:26,opacity:0,duration:.9,ease:'power3.out'},.5);
  window.addEventListener('pageshow',e=>{if(e.persisted)gsap.set(pt,{yPercent:101});});
}
document.addEventListener('click',e=>{
  const a=e.target.closest('a[href]');if(!a)return;
  const href=a.getAttribute('href');
  if(!href||!href.endsWith('.html')||a.target==='_blank'||e.metaKey||e.ctrlKey||e.shiftKey)return;
  e.preventDefault();go(href);
});
/* in-page anchors */
document.addEventListener('click',e=>{
  const a=e.target.closest('a[href^="#"]');if(!a||a.hasAttribute('data-modal'))return;
  const href=a.getAttribute('href');if(!href||href==='#')return;
  const el=$(href);if(!el)return;
  e.preventDefault();scrollToEl(el);
});

/* ---------- nav / menu ---------- */
const menu=$('#menu'),burger=$('#burger');
const onScroll=()=>nav.classList.toggle('scrolled',(window.scrollY||window.pageYOffset)>40);
window.addEventListener('scroll',onScroll,{passive:true});onScroll();
function openMenu(){
  menu.classList.add('open');menu.setAttribute('aria-hidden','false');
  burger.classList.add('active');burger.setAttribute('aria-expanded','true');
  nav.classList.add('menu-open','on-dark');lockScroll(true);
  if(hasGsap&&!reduced){
    gsap.fromTo('.m-link',{y:44,opacity:0},{y:0,opacity:1,duration:.7,stagger:.06,delay:.3,ease:'power3.out'});
    gsap.fromTo('.m-foot',{opacity:0},{opacity:1,duration:.6,delay:.75});
  }
}
function closeMenu(){
  if(!menu.classList.contains('open'))return;
  menu.classList.remove('open');menu.setAttribute('aria-hidden','true');
  burger.classList.remove('active');burger.setAttribute('aria-expanded','false');
  if(!DARK)nav.classList.remove('on-dark');
  nav.classList.remove('menu-open');lockScroll(false);
}
burger.addEventListener('click',()=>menu.classList.contains('open')?closeMenu():openMenu());

/* ---------- bag (persists via localStorage) ---------- */
const BKEY='lumea_bag_v1',FKEY='lumea_fit';
let bag=new Map();
try{const raw=JSON.parse(localStorage.getItem(BKEY)||'[]');
  if(Array.isArray(raw))raw.forEach(([k,v])=>bag.set(k,v));}catch(_){}
function saveBag(){try{localStorage.setItem(BKEY,JSON.stringify(Array.from(bag.entries())));}catch(_){}}
function getFit(){try{const f=JSON.parse(localStorage.getItem(FKEY));
  if(f&&f.band&&f.cup)return f;}catch(_){}return{band:34,cup:'C'};}
function setFit(f){try{localStorage.setItem(FKEY,JSON.stringify(f));}catch(_){}}

const bagEl=$('#bag'),bagBackdrop=$('#bag-backdrop'),bagCount=$('#bag-count');
function openBag(){bagEl.classList.add('open');bagBackdrop.classList.add('open');
  bagEl.setAttribute('aria-hidden','false');lockScroll(true);}
function closeBag(){if(!bagEl.classList.contains('open'))return;
  bagEl.classList.remove('open');bagBackdrop.classList.remove('open');
  bagEl.setAttribute('aria-hidden','true');lockScroll(false);}
 $('#bag-btn').addEventListener('click',openBag);
 $('#bag-close').addEventListener('click',closeBag);
bagBackdrop.addEventListener('click',closeBag);
 $('#bag-explore').addEventListener('click',()=>{closeBag();location.href='collection.html';});

function addToBag(id,opts){
  const p=PRODUCTS[id];if(!p)return;
  opts=opts||{};
  let cw=opts.cw;
  if(!cw){const sw=document.querySelector('[data-id="'+id+'"] .sw.active');if(sw)cw=sw.dataset.cw;}
  if(!cw)cw=p.cw;
  const size=opts.size||(getFit().band+getFit().cup);
  const key=id+'|'+cw+'|'+size;
  const cur=bag.get(key);
  bag.set(key,{id,cw,size,qty:cur?cur.qty+1:1});
  saveBag();renderBag();openBag();
  if(hasGsap&&!reduced)gsap.fromTo('#bag-btn',{scale:1.3},{scale:1,duration:.5,ease:'back.out(2)'});
}
function renderBag(){
  const list=$('#bag-items'),empty=$('#bag-empty'),foot=$('#bag-foot');
  const items=Array.from(bag.values());
  const count=items.reduce((a,i)=>a+i.qty,0);
  bagCount.textContent=count;
  bagCount.parentElement.classList.toggle('has',count>0);
  $('#bag-title-count').textContent=count?`(${count})`:'';
  if(!items.length){list.innerHTML='';empty.style.display='flex';foot.style.display='none';return;}
  empty.style.display='none';foot.style.display='block';
  list.innerHTML=items.map(it=>{
    const p=PRODUCTS[it.id],c=CW[it.cw];
    return `<div class="bag-item" data-key="${it.id}|${it.cw}|${it.size}">
      <div class="bi-thumb"><img src="${IMG}" class="${c.cls}" alt="${p.name} in ${c.label}"></div>
      <div class="bi-info"><p class="bi-name">${p.name} — ${c.label}</p>
        <p class="bi-meta">Size ${it.size} · $${p.price}</p>
        <div class="bi-qty"><button class="q-btn" data-act="dec" aria-label="Decrease quantity"><i data-lucide="minus"></i></button><span>${it.qty}</span><button class="q-btn" data-act="inc" aria-label="Increase quantity"><i data-lucide="plus"></i></button></div></div>
      <p class="bi-price">$${p.price*it.qty}</p>
      <button class="bi-remove" data-act="rm" aria-label="Remove item"><i data-lucide="x"></i></button></div>`;
  }).join('');
  icons();
  $('#bag-subtotal').textContent='$'+items.reduce((a,i)=>a+PRODUCTS[i.id].price*i.qty,0);
}
 $('#bag-items').addEventListener('click',e=>{
  const btn=e.target.closest('button[data-act]');if(!btn)return;
  const row=btn.closest('.bag-item');const it=bag.get(row.dataset.key);if(!it)return;
  if(btn.dataset.act==='inc')it.qty++;
  if(btn.dataset.act==='dec')it.qty=Math.max(1,it.qty-1);
  if(btn.dataset.act==='rm')bag.delete(row.dataset.key);
  saveBag();renderBag();
});
 $('#checkout').addEventListener('click',function(){
  if(this.dataset.busy)return;this.dataset.busy='1';
  this.querySelector('span').textContent='PROCESSING…';
  setTimeout(()=>{this.querySelector('span').textContent='CHECKOUT';delete this.dataset.busy;
    toast('Prototype checkout — nothing was charged, everything was admired.');},1100);
});
renderBag();

/* ---------- toasts ---------- */
const toastRoot=$('#toasts');
function toast(msg){
  const t=document.createElement('div');t.className='toast';
  t.innerHTML=`<i data-lucide="check"></i><span>${msg}</span>`;
  toastRoot.appendChild(t);icons();
  if(hasGsap&&!reduced){
    gsap.fromTo(t,{y:24,opacity:0},{y:0,opacity:1,duration:.5,ease:'power3.out'});
    setTimeout(()=>gsap.to(t,{y:14,opacity:0,duration:.4,onComplete:()=>t.remove()}),3400);
  } else setTimeout(()=>t.remove(),3600);
}

/* ---------- modal ---------- */
let lastFocus=null;
const modal=$('#modal');
function openModal(src){
  lastFocus=document.activeElement;
  const body=$('#modal-body');body.innerHTML='';
  if(typeof src==='string'&&/^tpl-/.test(src)){
    const t=$('#'+src);if(t)body.appendChild(t.content.cloneNode(true));
  }else if(typeof src==='string'){body.innerHTML=src;}
  else if(src&&src.nodeType){body.appendChild(src);}
  icons();modal.classList.add('open');lockScroll(true);$('#modal-close').focus();
}
function closeModal(){
  if(!modal.classList.contains('open'))return;
  modal.classList.remove('open');lockScroll(false);
  if(lastFocus&&lastFocus.focus)lastFocus.focus();
}
 $('#modal-close').addEventListener('click',closeModal);
modal.addEventListener('click',e=>{if(e.target===modal)closeModal();});

/* ---------- escape stack ---------- */
window.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  if(menu.classList.contains('open'))return closeMenu();
  if(modal.classList.contains('open'))return closeModal();
  if(bagEl.classList.contains('open'))return closeBag();
});

/* ---------- cursor & magnetic ---------- */
if(!isTouch&&!reduced){
  document.body.classList.add('has-cursor');
  const cur=$('#cursor'),lab=$('#cursor-label');
  let xTo=null,yTo=null;
  if(hasGsap){
    xTo=gsap.quickTo(cur,'x',{duration:.32,ease:'power3'});
    yTo=gsap.quickTo(cur,'y',{duration:.32,ease:'power3'});
  }
  window.addEventListener('pointermove',e=>{
    if(xTo){xTo(e.clientX);yTo(e.clientY);}
    else cur.style.transform=`translate(${e.clientX}px,${e.clientY}px)`;
  },{passive:true});
  document.addEventListener('pointerover',e=>{
    const c=e.target.closest('[data-cursor]');
    const l=e.target.closest('a,button,select,input,textarea,[role="button"]');
    if(c){lab.textContent=c.dataset.cursor;cur.classList.add('label');}
    else cur.classList.remove('label');
    cur.classList.toggle('grow',!!l&&!c);
  });
  if(hasGsap){
    $$('.magnetic').forEach(btn=>{
      btn.addEventListener('pointermove',e=>{
        const r=btn.getBoundingClientRect();
        gsap.to(btn,{x:(e.clientX-r.left-r.width/2)*.32,y:(e.clientY-r.top-r.height/2)*.36,duration:.5,ease:'power3.out'});
      });
      btn.addEventListener('pointerleave',()=>gsap.to(btn,{x:0,y:0,duration:.7,ease:'elastic.out(1,0.35)'}));
    });
  }
}

/* ---------- generic motion primitives ---------- */
if(hasGsap&&!reduced){
  $$('.rv').forEach(el=>gsap.from(el,{y:34,opacity:0,duration:1,ease:'power3.out',
    scrollTrigger:{trigger:el,start:'top 88%'}}));
  $$('[data-lines]').forEach(g=>{
    const t=$$('.rli',g);if(!t.length)return;
    gsap.from(t,{yPercent:115,duration:1.05,stagger:.09,ease:'expo.out',
      scrollTrigger:{trigger:g,start:'top 86%'}});
  });
  $$('[data-para]').forEach(el=>{
    const sp=parseFloat(el.dataset.para)||1;
    gsap.fromTo(el,{y:30*sp},{y:-30*sp,ease:'none',
      scrollTrigger:{trigger:el.closest('section')||el,start:'top bottom',end:'bottom top',scrub:true}});
  });
  gsap.fromTo('.foot-mark',{yPercent:60},{yPercent:6,ease:'none',
    scrollTrigger:{trigger:'footer',start:'top bottom',end:'bottom bottom',scrub:true}});
  window.addEventListener('load',()=>ScrollTrigger.refresh());
}

/* ---------- expose page API ---------- */
window.LUMEA={
  IMG,PRODUCTS,CW,SWATCH,reduced,isTouch,hasGsap,
  gsap:hasGsap?window.gsap:null,
  addToBag,openBag,closeBag,openModal,closeModal,
  toast,lockScroll,scrollToEl,getFit,setFit,icons,
  refresh:()=>{if(hasGsap)ScrollTrigger.refresh();}
};
icons();
})();