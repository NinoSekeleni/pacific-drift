// The puzzle book: a dialog with two daily puzzles, a five-letter word in six guesses and a
// criss-cross of sea words. Progress for the day is kept in this browser, so the book can be put
// down and picked up again. Practice puzzles are there for when the day's are done.
import {WORDS,wordOfDay,scoreGuess,buildCrissCross,dayNumber} from './puzzles.js';

const KEYROWS=['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'];
const LABEL={hit:'in the right place',near:'in the word, in another place',miss:'not in the word'};

export function createPuzzleBook({storageKey='pacific-drift-puzzles-v1',toast=()=>{},onOpen=()=>{},onClose=()=>{}}={}){
 let state=load();
 const dialog=document.createElement('dialog');dialog.className='puzzle-book';dialog.setAttribute('aria-labelledby','puzzleTitle');
 dialog.innerHTML=`<header class="puzzle-head"><div><p class="eyebrow">Puzzle book</p><h2 id="puzzleTitle">Today's puzzles</h2><p class="puzzle-date"></p></div><button type="button" class="journal-close" data-close aria-label="Close the puzzle book">×</button></header>
 <div class="puzzle-tabs" role="tablist"><button type="button" role="tab" data-tab="word" aria-selected="true">Five letters</button><button type="button" role="tab" data-tab="cross" aria-selected="false">Criss-cross</button></div>
 <section class="puzzle-pane" data-pane="word"><p class="puzzle-help">Find the hidden five-letter word in six guesses. After each guess, a green tile is in the right place, a gold tile is in the word but elsewhere, and a grey tile is not in the word.</p><div class="word-grid" role="grid" aria-label="Guesses"></div><p class="word-status" aria-live="polite"></p><div class="word-keys"></div><div class="puzzle-actions"><button type="button" data-practice-word>Practice word</button></div></section>
 <section class="puzzle-pane" data-pane="cross" hidden><p class="puzzle-help">Every answer is a word from the sea or sailing. Select a square or a clue and type. Select the same square again to switch between across and down.</p><div class="cross-wrap"><div class="cross-grid"></div><div class="cross-clues"><h3>Across</h3><ol data-dir="across"></ol><h3>Down</h3><ol data-dir="down"></ol></div></div><p class="cross-status" aria-live="polite"></p><div class="puzzle-actions"><button type="button" data-check>Check</button><button type="button" data-reveal>Reveal a letter</button><button type="button" data-practice-cross>Practice puzzle</button></div></section>`;
 dialog.tabIndex=-1;document.body.append(dialog);
 const $=s=>dialog.querySelector(s);
 dialog.querySelector('[data-close]').onclick=()=>close();
 dialog.addEventListener('close',()=>onClose());
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 for(const b of dialog.querySelectorAll('[data-tab]'))b.onclick=()=>tab(b.dataset.tab);
 function tab(id){state.tab=id;save();if(id==='word'&&dialog.open)queueMicrotask(()=>dialog.focus());for(const b of dialog.querySelectorAll('[data-tab]'))b.setAttribute('aria-selected',String(b.dataset.tab===id));for(const p of dialog.querySelectorAll('[data-pane]'))p.hidden=p.dataset.pane!==id;}

 // ---------- storage
 function load(){try{return JSON.parse(localStorage.getItem(storageKey))||{};}catch{return {};}}
 function save(){try{localStorage.setItem(storageKey,JSON.stringify(state));}catch{}}
 function today(){const d=dayNumber();if(state.day!==d){state.day=d;state.word={key:'day',answer:wordOfDay(d),guesses:[]};state.cross={key:d,fill:{}};}return d;}

 // ---------- five letters
 let typed='';
 function renderWord(){
  const w=state.word,grid=$('.word-grid');grid.replaceChildren();
  for(let r=0;r<6;r++){const row=document.createElement('div');row.className='word-row';row.setAttribute('role','row');
   const g=w.guesses[r],marks=g?scoreGuess(g,w.answer):null,text=g||(r===w.guesses.length?typed:'');
   for(let i=0;i<5;i++){const c=document.createElement('span');c.className='word-tile'+(marks?' '+marks[i]:'')+(text[i]&&!marks?' typed':'');c.setAttribute('role','gridcell');c.textContent=text[i]||'';
    if(marks)c.setAttribute('aria-label',`${text[i]}, ${LABEL[marks[i]]}`);row.append(c);}
   grid.append(row);}
  // keyboard colours: best mark seen for each letter
  const best={};for(const g of w.guesses){const m=scoreGuess(g,w.answer);[...g].forEach((ch,i)=>{const rank={hit:3,near:2,miss:1};if(!best[ch]||rank[m[i]]>rank[best[ch]])best[ch]=m[i];});}
  const keys=$('.word-keys');keys.replaceChildren();
  KEYROWS.forEach((row,ri)=>{const div=document.createElement('div');div.className='key-row';
   if(ri===2)div.append(key('Enter','enter'));
   for(const ch of row)div.append(key(ch,ch,best[ch]));
   if(ri===2)div.append(key('⌫','back','','Delete a letter'));
   keys.append(div);});
  const done=solved()||w.guesses.length>=6;
  $('.word-status').textContent=solved()?`Found in ${w.guesses.length} ${w.guesses.length===1?'guess':'guesses'}. ${w.key==='day'?'A new word arrives tomorrow.':''}`:w.guesses.length>=6?`The word was ${w.answer}.`:'';
  $('[data-practice-word]').hidden=!done&&w.key==='day';
 }
 function key(label,value,mark='',aria=''){const b=document.createElement('button');b.type='button';b.className='word-key'+(mark?' '+mark:'')+(value.length>1?' wide':'');b.textContent=label;if(aria)b.setAttribute('aria-label',aria);b.onclick=()=>input(value);return b;}
 const solved=()=>state.word.guesses.includes(state.word.answer);
 function input(v){
  const w=state.word;if(solved()||w.guesses.length>=6)return;
  if(v==='back')typed=typed.slice(0,-1);
  else if(v==='enter'){if(typed.length<5){$('.word-status').textContent='Five letters, please.';return;}
   w.guesses.push(typed);typed='';save();if(solved())toast(w.key==='day'?'You found today\'s word.':'You found it.');stats();}
  else if(/^[A-Z]$/.test(v)&&typed.length<5)typed+=v;
  renderWord();
 }
 function stats(){const w=state.word;if(w.key!=='day'||!(solved()||w.guesses.length>=6)||state.lastScored===state.day)return;state.lastScored=state.day;
  state.played=(state.played||0)+1;if(solved()){state.won=(state.won||0)+1;state.streak=(state.lastWin===state.day-1?(state.streak||0):0)+1;state.lastWin=state.day;}else state.streak=0;save();}
 $('[data-practice-word]').onclick=()=>{const n=(state.practiceWord=(state.practiceWord||0)+1);state.word={key:'practice',answer:WORDS[(n*7919+state.day*31)%WORDS.length].toUpperCase(),guesses:[]};typed='';save();renderWord();};

 // ---------- criss-cross
 let puzzle=null,sel={row:0,col:0,dir:'across'};const inputs=new Map();
 function crossFor(){const c=state.cross;return buildCrissCross(typeof c.key==='number'?c.key:1e6+(c.practice||0));}
 function renderCross(){
  puzzle=crossFor();const fill=state.cross.fill,grid=$('.cross-grid');grid.replaceChildren();inputs.clear();
  grid.style.gridTemplateColumns=`repeat(${puzzle.width},var(--cell))`;
  const numbers=new Map(puzzle.words.map(w=>[w.row+','+w.col,w.number]));
  for(let y=0;y<puzzle.height;y++)for(let x=0;x<puzzle.width;x++){
   const ch=puzzle.cells[y][x];if(!ch){const e=document.createElement('span');e.className='cross-void';grid.append(e);continue;}
   const cell=document.createElement('label');cell.className='cross-cell';const n=numbers.get(y+','+x);
   if(n){const s=document.createElement('small');s.textContent=n;cell.append(s);}
   const inp=document.createElement('input');inp.maxLength=1;inp.autocomplete='off';inp.autocapitalize='characters';inp.spellcheck=false;inp.value=fill[y+','+x]||'';
   inp.setAttribute('aria-label',`Row ${y+1}, column ${x+1}`);
   inp.onfocus=()=>{if(sel.row===y&&sel.col===x)return;sel.row=y;sel.col=x;if(!wordAt(y,x,sel.dir))sel.dir=sel.dir==='across'?'down':'across';highlight();};
   inp.onclick=()=>{if(sel.row===y&&sel.col===x&&wordAt(y,x,sel.dir==='across'?'down':'across')){sel.dir=sel.dir==='across'?'down':'across';highlight();}};
   inp.onkeydown=e=>crossKey(e,y,x);
   inp.oninput=()=>{const v=inp.value.toUpperCase().replace(/[^A-Z]/g,'').slice(-1);inp.value=v;setFill(y,x,v);if(v)step(1);};
   cell.append(inp);grid.append(cell);inputs.set(y+','+x,inp);}
  for(const dir of ['across','down']){const ol=$(`ol[data-dir=${dir}]`);ol.replaceChildren();
   for(const w of puzzle.words.filter(w=>w.dir===dir)){const li=document.createElement('li');li.value=w.number;const b=document.createElement('button');b.type='button';b.textContent=`${w.clue} (${w.answer.length})`;b.onclick=()=>{sel={row:w.row,col:w.col,dir};inputs.get(w.row+','+w.col)?.focus();highlight();};li.append(b);li.dataset.key=w.number+dir;ol.append(li);}}
  highlight();crossStatus();
 }
 function wordAt(y,x,dir){return puzzle.words.find(w=>w.dir===dir&&(dir==='across'?w.row===y&&x>=w.col&&x<w.col+w.answer.length:w.col===x&&y>=w.row&&y<w.row+w.answer.length));}
 function highlight(){const w=wordAt(sel.row,sel.col,sel.dir);
  for(const [k,inp]of inputs){const [y,x]=k.split(',').map(Number);const on=w&&(w.dir==='across'?y===w.row&&x>=w.col&&x<w.col+w.answer.length:x===w.col&&y>=w.row&&y<w.row+w.answer.length);inp.parentElement.classList.toggle('active',!!on);inp.parentElement.classList.toggle('cursor',y===sel.row&&x===sel.col);}
  for(const li of dialog.querySelectorAll('.cross-clues li'))li.classList.toggle('active',!!w&&li.dataset.key===w.number+w.dir);}
 function step(d){const dy=sel.dir==='down'?d:0,dx=sel.dir==='across'?d:0,k=(sel.row+dy)+','+(sel.col+dx);if(inputs.has(k)){sel.row+=dy;sel.col+=dx;inputs.get(k).focus();highlight();}}
 function crossKey(e,y,x){
  if(e.key==='Backspace'&&!e.target.value){e.preventDefault();step(-1);const k=sel.row+','+sel.col;inputs.get(k).value='';setFill(sel.row,sel.col,'');}
  else if(e.key.startsWith('Arrow')){e.preventDefault();const dir=e.key==='ArrowLeft'||e.key==='ArrowRight'?'across':'down';if(sel.dir!==dir&&wordAt(y,x,dir)){sel.dir=dir;highlight();return;}step(e.key==='ArrowRight'||e.key==='ArrowDown'?1:-1);}
  else if(e.key===' '){e.preventDefault();if(wordAt(y,x,sel.dir==='across'?'down':'across')){sel.dir=sel.dir==='across'?'down':'across';highlight();}}
 }
 function setFill(y,x,v){const k=y+','+x;if(v)state.cross.fill[k]=v;else delete state.cross.fill[k];for(const i of inputs.values())i.parentElement.classList.remove('wrong');save();crossStatus();}
 function crossStatus(){let total=0,filled=0,right=0;for(let y=0;y<puzzle.height;y++)for(let x=0;x<puzzle.width;x++){const ch=puzzle.cells[y][x];if(!ch)continue;total++;const v=state.cross.fill[y+','+x];if(v){filled++;if(v===ch)right++;}}
  const done=right===total;$('.cross-status').textContent=done?'Solved. Every word is in place.':`${filled} of ${total} squares filled.`;
  if(done&&!state.cross.solved){state.cross.solved=true;save();toast('Criss-cross solved.');}
  $('[data-practice-cross]').hidden=!done&&typeof state.cross.key==='number';}
 $('[data-check]').onclick=()=>{let wrong=0;for(const [k,inp]of inputs){const [y,x]=k.split(',').map(Number);const bad=inp.value&&inp.value!==puzzle.cells[y][x];inp.parentElement.classList.toggle('wrong',!!bad);if(bad)wrong++;}$('.cross-status').textContent=wrong?`${wrong} ${wrong===1?'square is':'squares are'} not right yet; they are marked.`:'Everything filled in so far is right.';};
 $('[data-reveal]').onclick=()=>{const w=wordAt(sel.row,sel.col,sel.dir)||puzzle.words[0];for(let i=0;i<w.answer.length;i++){const y=w.row+(w.dir==='down'?i:0),x=w.col+(w.dir==='across'?i:0);if(state.cross.fill[y+','+x]!==w.answer[i]){inputs.get(y+','+x).value=w.answer[i];setFill(y,x,w.answer[i]);return;}}};
 $('[data-practice-cross]').onclick=()=>{state.cross={key:'practice',practice:(state.cross.practice||state.practiceCross||0)+1,fill:{}};state.practiceCross=state.cross.practice;save();renderCross();};

 // physical keyboard for the word game
 dialog.addEventListener('keydown',e=>{if(state.tab==='cross'||e.target.closest('input')||e.metaKey||e.ctrlKey||e.altKey)return;
  if(e.key==='Enter'&&!e.target.closest('button')){e.preventDefault();input('enter');}else if(e.key==='Backspace'){e.preventDefault();input('back');}else if(/^[a-z]$/i.test(e.key)){e.preventDefault();input(e.key.toUpperCase());}});

 function open(){const d=today();save();const date=new Date(d*864e5);
  $('.puzzle-date').textContent=`${date.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'})}${state.streak?` · word streak ${state.streak}`:''}`;
  renderWord();renderCross();tab(state.tab||'word');if(!dialog.open)dialog.showModal();
  // focus the page, so typed letters and Enter go to the puzzle rather than the close button
  if(state.tab==='cross')inputs.get(sel.row+','+sel.col)?.focus();else dialog.focus();onOpen();}
 function close(){if(dialog.open)dialog.close();}
 return{open,close,get isOpen(){return dialog.open;},get state(){return state;},input,get puzzle(){return puzzle;}};
}
