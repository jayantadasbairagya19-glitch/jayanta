/* Offline fallback: when not running inside claude.ai, store data in this browser (localStorage). */
(function(){
if(typeof window.claude!=="undefined")return;
var KEY="sswl.localdb.v1",store={},ls=[];
try{store=JSON.parse(localStorage.getItem(KEY)||"{}")}catch(e){store={}}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(store))}catch(e){}}
function ids(col){var p=col+"/";return Object.keys(store).filter(function(k){return k.indexOf(p)===0&&k.slice(p.length).indexOf("/")<0})}
function sd(path){var d=store[path];return{id:path.split("/").pop(),exists:!!d,data:function(){return d?JSON.parse(JSON.stringify(d)):undefined}}}
function fire(){persist();ls.slice().forEach(function(f){f()})}
function sub(f){ls.push(f);setTimeout(f,0);return function(){ls=ls.filter(function(x){return x!==f})}}
function docRef(path){return{
get:async function(){return sd(path)},
set:async function(d){store[path]=JSON.parse(JSON.stringify(d));fire()},
update:async function(d){store[path]=Object.assign({},store[path]||{},d);fire()},
delete:async function(){delete store[path];fire()},
onSnapshot:function(n){return sub(function(){n(sd(path))})}}}
function query(col,ord,lim){
function mk(){var docs=ids(col).map(sd);if(ord)docs.sort(function(a,b){var x=a.data()[ord.f],y=b.data()[ord.f];return(x>y?1:x<y?-1:0)*(ord.d==="desc"?-1:1)});if(lim)docs=docs.slice(0,lim);return{docs:docs,size:docs.length,empty:!docs.length}}
return{orderBy:function(f,d){return query(col,{f:f,d:d||"asc"},lim)},limit:function(n){return query(col,ord,n)},get:async function(){return mk()},onSnapshot:function(n){return sub(function(){n(mk())})}}}
var db={doc:docRef,collection:function(c){var q=query(c);q.add=async function(d){var id="a"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);await docRef(c+"/"+id).set(d);return docRef(c+"/"+id)};q.doc=function(i){return docRef(c+"/"+i)};return q}};
var user={isOwner:async function(){return true},canEdit:async function(){return true},can:async function(){return true},me:async function(){return{id:"local",name:"Admin",isOwner:true}},id:async function(){return"local"},profiles:async function(){return{}},search:async function(){return[]}};
var dl={save:async function(o){var b=new Blob([o.data],{type:"text/csv;charset=utf-8"}),a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=o.filename;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},500)}};
window.claude={use:async function(n){return n==="db"?db:n==="user"?user:n==="downloads"?dl:null}};
var l=document.getElementById("login");if(l){var d=document.createElement("div");d.style.cssText="margin-top:12px;font-size:12px;color:var(--mu);text-align:center";d.textContent="Offline mode: data is saved in this browser only.";l.appendChild(d)}
})();
(async function(){
function $(i){return document.getElementById(i)}
$("logo2").src=$("logo1").src;
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function gate(m){$("app").classList.add("hid");$("login").classList.add("hid");$("gate").classList.remove("hid");$("gate").textContent=m}
function fail(x){alert("Action not allowed or failed: "+((x&&x.message)||x))}
window.addEventListener("unhandledrejection",function(e){var g=$("gate");if(g&&!g.classList.contains("hid"))gate("Error: "+((e.reason&&e.reason.message)||e.reason))});
window.addEventListener("error",function(e){var g=$("gate");if(g&&!g.classList.contains("hid"))gate("Error: "+e.message)});
setTimeout(function(){var g=$("gate");if(g&&!g.classList.contains("hid")&&(g.textContent==="Loading…"||/^(Connecting|Checking)/.test(g.textContent)))g.textContent="Still loading ("+g.textContent+") — open the portal from its claude.ai link while signed in, then refresh the page."},8000);
if(typeof claude==="undefined"||!claude.use){gate("Open this portal from its claude.ai artifact link while signed in. Opening the file directly will not work.");return}
function tmo(p){return Promise.race([p,new Promise(function(r){setTimeout(function(){r(null)},12000)})])}
gate("Connecting to database…");
var db=await tmo(claude.use("db")),user=await tmo(claude.use("user"));
if(!db){gate("Please open this page signed in to claude.ai (through the shared link).");return}
if(!(window.crypto&&crypto.subtle)){gate("This browser cannot run secure login (crypto unavailable).");return}
gate("Checking your account…");
var me=user?((await tmo(user.me()))||{id:null,name:""}):{id:null,name:""};
var isAdminAcct=user?!!(await tmo(user.canEdit())):false;
var PORTALS=[{id:"firestick",name:"Firestick Stock",icon:"📺"},{id:"clients",name:"Client Records",icon:"🗂️"}];
var cur=null,view="",unsubC=null,started=false,fails=0,lock=0;
var sticks=[],events=[],clients=[],users=[],logs=[],fS=false,fE=false,popped=false,editId=null,fsort={k:"serial",d:1},cedit=null;

/* ---------- crypto ---------- */
function b2h(b){return Array.from(new Uint8Array(b)).map(function(x){return x.toString(16).padStart(2,"0")}).join("")}
function h2b(h){var a=new Uint8Array(h.length/2);for(var i=0;i<a.length;i++)a[i]=parseInt(h.substr(i*2,2),16);return a}
function rnd(){var a=new Uint8Array(16);crypto.getRandomValues(a);return b2h(a)}
async function hashPw(pw,salt){var k=await crypto.subtle.importKey("raw",new TextEncoder().encode(pw),"PBKDF2",false,["deriveBits"]);
return b2h(await crypto.subtle.deriveBits({name:"PBKDF2",salt:h2b(salt),iterations:100000,hash:"SHA-256"},k,256))}
var UNRE=/^[a-z0-9][a-z0-9._-]{2,29}$/;

/* ---------- access helpers ---------- */
function isAdm(){return !!cur&&cur.type==="admin"}
function lv(p){return !cur?"none":isAdm()?"admin":((cur.portals&&cur.portals[p])||"none")}
function W(p){var l=lv(p);return l==="admin"||l==="edit"}
function logEntry(u,n,r){return db.collection("logins").add({username:u,name:n||"",result:r,at:new Date().toISOString()}).catch(function(){})}
function saveSess(v){try{sessionStorage.setItem("sswl.s",v)}catch(e){}}
function getSess(){try{return sessionStorage.getItem("sswl.s")}catch(e){return null}}

/* ---------- login / logout ---------- */
function showLogin(){$("app").classList.add("hid");$("gate").classList.add("hid");$("login").classList.remove("hid");$("lerr").textContent="";$("lp").value="";
$("adminbox").classList.toggle("hid",!isAdminAcct);if(isAdminAcct)$("abtn").textContent="Continue as Admin ("+(me.name||"owner")+")"}
function setCur(c){cur=c;if(unsubC){unsubC();unsubC=null}
if(c.type==="user"){unsubC=db.doc("creds/"+c.username).onSnapshot(function(s){var d=s.exists&&s.data();if(!d||d.active===false){logout();return}cur.name=d.name;cur.portals=d.portals||{};build()},function(){})}
saveSess(c.type==="admin"?"__admin__":c.username);startData();$("login").classList.add("hid");$("gate").classList.add("hid");$("app").classList.remove("hid");
$("who").textContent=c.name||c.username;$("role").textContent=c.type==="admin"?"Admin":"User";build()}
function logout(){cur=null;view="";if(unsubC){unsubC();unsubC=null}saveSess("");showLogin()}
$("out").onclick=logout;
$("lbtn").onclick=async function(){
var u=$("lu").value.trim().toLowerCase(),p=$("lp").value,e=$("lerr");
if(Date.now()<lock){e.textContent="Too many attempts. Wait 30 seconds.";return}
if(!UNRE.test(u)||!p){e.textContent="Enter a valid username and password.";return}
try{var s=await db.doc("creds/"+u).get(),d=s.exists?s.data():null,ok=false;
if(d&&d.active!==false)ok=(await hashPw(p,d.salt))===d.hash;
await logEntry(u,d&&d.name,ok?"success":"failed");
if(!ok){if(++fails>=5){lock=Date.now()+30000;fails=0}e.textContent="Wrong username/password, or account disabled.";return}
fails=0;$("lu").value="";setCur({type:"user",username:u,name:d.name,portals:d.portals||{}})}catch(x){e.textContent="Login failed: "+((x&&x.message)||x)}};
$("lp").onkeydown=$("lu").onkeydown=function(e){if(e.key==="Enter")$("lbtn").click()};
$("abtn").onclick=async function(){await logEntry("admin",me.name||"Admin","admin");setCur({type:"admin",username:"admin",name:me.name||"Admin",portals:{}})};

/* ---------- data ---------- */
function snap(q,fn,soft){q.onSnapshot(function(s){fn(s.docs.map(function(d){var x=d.data()||{};x.id=d.id;return x}))},function(e){if(!soft)gate("Cannot read data: "+(e&&e.message))})}
function startData(){if(started)return;started=true;
snap(db.collection("sticks"),function(a){sticks=a;fS=true;draw()});
snap(db.collection("events"),function(a){events=a;fE=true;draw()});
snap(db.collection("clients"),function(a){clients=a;draw()});
if(isAdm()){snap(db.collection("creds"),function(a){users=a;draw()},true);
snap(db.collection("logins").orderBy("at","desc").limit(500),function(a){logs=a;draw()},true)}}

/* ---------- shell / nav ---------- */
function tabs(){var a=PORTALS.filter(function(p){return lv(p.id)!=="none"}).map(function(p){return{id:p.id,t:p.icon+" "+p.name}});
if(isAdm()){a.push({id:"users",t:"👥 Users & access"});a.push({id:"log",t:"🕒 Login log"})}return a}
function build(){if(!cur)return;var t=tabs();
if(!t.some(function(x){return x.id===view}))view=t.length?t[0].id:"";
$("nav").innerHTML=t.map(function(x){return"<button data-v='"+x.id+"' class='"+(x.id===view?"on":"")+"'>"+x.t+"</button>"}).join("");
$("who").textContent=cur.name||cur.username;draw()}
$("nav").onclick=function(e){var b=e.target.closest("button");if(!b)return;view=b.dataset.v;build()};
function draw(){if(!cur)return;
["firestick","clients","users","log"].forEach(function(v){$("v-"+v).classList.toggle("hid",v!==view)});
$("v-none").classList.toggle("hid",view!=="");
if(view==="firestick")drawF();else if(view==="clients")drawC();else if(view==="users")drawU();else if(view==="log")drawL()}

/* ---------- Firestick portal ---------- */
var F=["serial","model","hub","status","fe","cid","cname","date","note"];
function mk(o){var d=new Date();d.setDate(1);d.setMonth(d.getMonth()+o);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")}
function cls(s){return s==="In Stock"?"In":s}
function fstats(){var tm=mk(0),lm=mk(-1),cnt=function(m){return events.filter(function(e){return String(e.date).slice(0,7)===m}).length};
var inS=sticks.filter(function(r){return r.status==="In Stock"}),fe={};
inS.forEach(function(r){var k=r.fe||"Unassigned / Store";(fe[k]=fe[k]||{s:0,i:0}).s++});
events.forEach(function(e){if(String(e.date).slice(0,7)===tm){var k=e.fe||"Unassigned / Store";(fe[k]=fe[k]||{s:0,i:0}).i++}});
return{tm:cnt(tm),lm:cnt(lm),inS:inS.length,iss:sticks.filter(function(r){return r.status==="Issued"}).length,total:sticks.length,fl:sticks.filter(function(r){return r.status==="Faulty"}).length,fe:fe}}
function feTable(fe){var k=Object.keys(fe).sort();if(!k.length)return"<div style='color:var(--mu);padding:6px'>No data yet.</div>";
return"<table><thead><tr><th>FE</th><th>In stock</th><th>Issued this month</th></tr></thead><tbody>"+k.map(function(x){return"<tr><td>"+esc(x)+"</td><td><b>"+fe[x].s+"</b></td><td>"+fe[x].i+"</td></tr>"}).join("")+"</tbody></table>"}
function chart(a,b){var m=Math.max(a,b,1),h=110,ha=Math.round(a/m*h),hb=Math.round(b/m*h);
return"<svg viewBox='0 0 340 190' width='100%' role='img' aria-label='Issued last month "+b+", this month "+a+"'><line x1='30' y1='150' x2='320' y2='150' stroke='currentColor' opacity='.3'/><rect class='b2' x='70' y='"+(150-hb)+"' width='80' height='"+hb+"' rx='4'/><rect class='b1' x='200' y='"+(150-ha)+"' width='80' height='"+ha+"' rx='4'/><text x='110' y='"+(144-hb)+"' text-anchor='middle' font-weight='700'>"+b+"</text><text x='240' y='"+(144-ha)+"' text-anchor='middle' font-weight='700'>"+a+"</text><text x='110' y='172' text-anchor='middle'>Last month ("+mk(-1)+")</text><text x='240' y='172' text-anchor='middle'>This month ("+mk(0)+")</text></svg>"}
function showPop(){var s=fstats();
$("popb").innerHTML="<div class='stats'><div class='s'><b class='In'>"+s.inS+"</b><span>In stock</span></div><div class='s'><b class='Issued'>"+s.iss+"</b><span>Issued (now)</span></div><div class='s'><b>"+s.tm+"</b><span>Issued this month</span></div><div class='s'><b>"+s.lm+"</b><span>Issued last month</span></div></div><b>Who holds the stock</b><div class='mini tw'>"+feTable(s.fe)+"</div>";
if(!$("pop").open)$("pop").showModal()}
$("sum").onclick=showPop;$("popx").onclick=function(){$("pop").close()};
function drawF(){var s=fstats(),w=W("firestick");
$("fstats").innerHTML=[["Total",s.total,""],["In stock",s.inS,"In"],["Issued (now)",s.iss,"Issued"],["Issued this month",s.tm,""],["Faulty",s.fl,"Faulty"]].map(function(x){return"<div class='s'><b class='"+x[2]+"'>"+x[1]+"</b><span>"+x[0]+"</span></div>"}).join("");
$("chart").innerHTML=chart(s.tm,s.lm);$("fetab").innerHTML=feTable(s.fe);
document.querySelectorAll(".fw").forEach(function(b){b.classList.toggle("hid",!w)});
var hs=[];sticks.forEach(function(r){if(r.hub&&hs.indexOf(r.hub)<0)hs.push(r.hub)});hs.sort();var c=$("ffh").value;
$("ffh").innerHTML='<option value="">All hubs</option>'+hs.map(function(x){return"<option>"+esc(x)+"</option>"}).join("");$("ffh").value=hs.indexOf(c)>-1?c:"";
var q=$("fq").value.toLowerCase(),fs=$("ffs").value,fh=$("ffh").value;
var l=sticks.filter(function(r){return(!fs||r.status===fs)&&(!fh||r.hub===fh)&&(!q||F.map(function(k){return r[k]}).join(" ").toLowerCase().indexOf(q)>-1)});
l.sort(function(a,b){var x=String(a[fsort.k]||"").toLowerCase(),y=String(b[fsort.k]||"").toLowerCase();return(x>y?1:x<y?-1:0)*fsort.d});
$("ftb").innerHTML=l.map(function(r){var a="";
if(w){if(r.status==="In Stock")a+="<button data-a='i' data-id='"+r.id+"'>Issue</button> ";if(r.status==="Issued")a+="<button data-a='r' data-id='"+r.id+"'>Return</button> ";a+="<button data-a='e' data-id='"+r.id+"'>Edit</button> "}
if(isAdm())a+="<button class='d' data-a='d' data-id='"+r.id+"'>✕</button>";
return"<tr>"+F.map(function(k){return k==="status"?"<td><span class='tag "+cls(r.status)+"'>"+esc(r.status)+"</span></td>":"<td>"+esc(r[k])+"</td>"}).join("")+"<td>"+a+"</td></tr>"}).join("")||"<tr><td colspan='10' style='color:var(--mu)'>No records.</td></tr>";
if(!popped&&fS&&fE){popped=true;showPop()}}
function fnd(id){return sticks.filter(function(x){return x.id===id})[0]}
function openD(r){editId=r?r.id:null;$("dt").textContent=r?"Edit Firestick":"Add Firestick";$("err").textContent="";F.forEach(function(k){$(k).value=r?(r[k]||""):(k==="status"?"In Stock":"")});$("dlg").showModal()}
$("fadd").onclick=function(){openD()};$("cx").onclick=function(){$("dlg").close()};
$("fm").onsubmit=async function(e){var d={};F.forEach(function(k){d[k]=$(k).value.trim()});var m="",old=editId?fnd(editId):null;
if(sticks.some(function(r){return r.id!==editId&&String(r.serial).toLowerCase()===d.serial.toLowerCase()}))m="Serial No. already exists.";
else if(d.status==="Issued"&&(!d.cid||!d.fe||!d.date))m="Issued হলে Client ID, FE ও Date দিন।";
if(m){$("err").textContent=m;e.preventDefault();return false}
try{if(editId)await db.doc("sticks/"+editId).set(d);else await db.collection("sticks").add(d);
if(d.status==="Issued"&&(!old||old.status!=="Issued"))await db.collection("events").add({serial:d.serial,fe:d.fe,cid:d.cid,date:d.date})}catch(x){fail(x)}};
var issueId=null;$("icx").onclick=function(){$("idlg").close()};
$("ifm").onsubmit=async function(){var r=fnd(issueId);if(!r)return;var d=Object.assign({},r);delete d.id;d.status="Issued";d.cid=$("icid").value.trim();d.cname=$("icname").value.trim();d.fe=$("ife").value.trim();d.date=$("idate").value;
try{await db.doc("sticks/"+issueId).set(d);await db.collection("events").add({serial:d.serial,fe:d.fe,cid:d.cid,date:d.date})}catch(x){fail(x)}};
$("fbulk").onclick=function(){$("be").textContent="";$("bl").value="";$("bdlg").showModal()};$("bx").onclick=function(){$("bdlg").close()};
$("bf").onsubmit=async function(e){var list=$("bl").value.split(/\r?\n/).map(function(s){return s.trim()}).filter(Boolean),seen={},dup=[],add=[];
sticks.forEach(function(r){seen[String(r.serial).toLowerCase()]=1});
list.forEach(function(s){if(seen[s.toLowerCase()])dup.push(s);else{seen[s.toLowerCase()]=1;add.push(s)}});
if(dup.length){$("be").textContent="Duplicate: "+dup.slice(0,5).join(", ")+(dup.length>5?"…":"");e.preventDefault();return false}
try{for(var i=0;i<add.length;i++)await db.collection("sticks").add({serial:add[i],model:$("bm").value,hub:$("bh").value.trim(),status:"In Stock",fe:$("bfe").value.trim(),cid:"",cname:"",date:"",note:""})}catch(x){fail(x)}};
$("ftb").onclick=async function(e){var b=e.target.closest("button");if(!b)return;var id=b.dataset.id,r=fnd(id),a=b.dataset.a;if(!r)return;
if(a==="e")return openD(r);
if(a==="i"){issueId=id;$("it").textContent="Issue "+r.serial;$("icid").value="";$("icname").value="";$("ife").value=r.fe||"";$("idate").value=new Date().toISOString().slice(0,10);return $("idlg").showModal()}
try{if(a==="r"&&confirm("Mark "+r.serial+" as Returned?")){var d=Object.assign({},r);delete d.id;d.status="Returned";d.date=new Date().toISOString().slice(0,10);await db.doc("sticks/"+id).set(d)}
if(a==="d"&&confirm("Delete "+r.serial+"?"))await db.doc("sticks/"+id).delete()}catch(x){fail(x)}};
$("fh").onclick=function(e){var k=e.target.dataset.k;if(!k)return;fsort=fsort.k===k?{k:k,d:-fsort.d}:{k:k,d:1};draw()};
$("fq").oninput=draw;$("ffs").onchange=draw;$("ffh").onchange=draw;
async function exportCsv(name,h,rows){var csv=[h].concat(rows).map(function(a){return a.map(function(c){return'"'+String(c==null?"":c).replace(/"/g,'""')+'"'}).join(",")}).join("\n");
var dl=await claude.use("downloads");if(dl){try{await dl.save({filename:name,data:csv});return}catch(x){}}
var w=window.open("","_blank");if(w)w.document.write("<pre>"+esc(csv)+"</pre>");else alert("Pop-up blocked.")}
$("fexp").onclick=function(){exportCsv("firestick-stock.csv",["Serial No.","Model","HUB","Status","FE","Client ID","Client Name","Date","Remarks"],sticks.map(function(r){return F.map(function(k){return r[k]})}))};

/* ---------- Client Records portal ---------- */
var CF=["name","half","cid","zone","zid","hub","fe","serial","mac","acc","pkg","doi"];
var CL=["Name","Half Name","Client ID","Zone","Zone ID","HUB","FE","ISTICS Serial No.","Pan Metro MAC ID","Pan Metro Account ID","Package","Date of Issue"];
$("ch").innerHTML="<tr>"+CL.map(function(x){return"<th>"+x+"</th>"}).join("")+"<th></th></tr>";
$("cgrid").innerHTML=CF.map(function(k,i){return"<div><label>"+CL[i]+"</label><input id='c_"+k+"' "+(k==="doi"?"type='date' ":"")+(k==="mac"?"placeholder='AA:BB:CC:DD:EE:FF' ":"")+"required></div>"}).join("");
function drawC(){var w=W("clients"),q=$("cq").value.toLowerCase();
document.querySelectorAll(".cw").forEach(function(b){b.classList.toggle("hid",!w)});
var l=clients.filter(function(r){return!q||CF.map(function(k){return r[k]}).join(" ").toLowerCase().indexOf(q)>-1});
l.sort(function(a,b){return String(a.name).toLowerCase()>String(b.name).toLowerCase()?1:-1});
$("ccnt").textContent=l.length+" / "+clients.length;
$("ctb").innerHTML=l.map(function(r){return"<tr>"+CF.map(function(k){return"<td>"+esc(r[k])+"</td>"}).join("")+"<td>"+(w?"<button data-a='e' data-id='"+r.id+"'>Edit</button> ":"")+(isAdm()?"<button class='d' data-a='d' data-id='"+r.id+"'>✕</button>":"")+"</td></tr>"}).join("")||"<tr><td colspan='13' style='color:var(--mu)'>No records.</td></tr>"}
function cfnd(id){return clients.filter(function(x){return x.id===id})[0]}
function openC(r){cedit=r?r.id:null;$("cdt").textContent=r?"Edit record":"Add record";$("cerr").textContent="";CF.forEach(function(k){$("c_"+k).value=r?(r[k]||""):(k==="doi"?new Date().toISOString().slice(0,10):"")});$("cdlg").showModal()}
$("cadd").onclick=function(){openC()};$("ccx").onclick=function(){$("cdlg").close()};
$("c_name").oninput=function(){if(!cedit&&!$("c_half").dataset.t)$("c_half").value=$("c_name").value.trim().split(/\s+/)[0]||""};$("c_half").oninput=function(){$("c_half").dataset.t=1};
$("cfm").onsubmit=async function(e){var d={};CF.forEach(function(k){d[k]=$("c_"+k).value.trim()});d.mac=d.mac.toUpperCase().replace(/-/g,":");var m="";
if(!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(d.mac))m="MAC ID must look like AA:BB:CC:DD:EE:FF";
else if(clients.some(function(r){return r.id!==cedit&&String(r.cid).toLowerCase()===d.cid.toLowerCase()}))m="Client ID already exists.";
else if(clients.some(function(r){return r.id!==cedit&&r.mac===d.mac}))m="This MAC ID is already registered.";
if(m){$("cerr").textContent=m;e.preventDefault();return false}
$("c_half").dataset.t="";try{if(cedit)await db.doc("clients/"+cedit).set(d);else await db.collection("clients").add(d)}catch(x){fail(x)}};
$("ctb").onclick=async function(e){var b=e.target.closest("button");if(!b)return;var r=cfnd(b.dataset.id);if(!r)return;
if(b.dataset.a==="e")return openC(r);if(confirm("Delete "+r.name+"?"))try{await db.doc("clients/"+r.id).delete()}catch(x){fail(x)}};
$("cq").oninput=draw;
$("cexp").onclick=function(){exportCsv("client-records.csv",CL,clients.map(function(r){return CF.map(function(k){return r[k]})}))};

/* ---------- Users & access (admin) ---------- */
function psel(id,val,u){return"<select "+(u?"data-u='"+u+"' ":"")+"data-p='"+id+"'><option value='none'"+(val==="none"?" selected":"")+">No access</option><option value='view'"+(val==="view"?" selected":"")+">View</option><option value='edit'"+(val==="edit"?" selected":"")+">Edit</option></select>"}
$("nps").innerHTML=PORTALS.map(function(p){return"<label>"+p.icon+" "+p.name+"</label>"+psel(p.id,"view").replace("data-p=","id='np_"+p.id+"' data-p=")}).join("");
function lastLogin(){var m={};logs.forEach(function(l){if(l.result==="success"&&!m[l.username])m[l.username]=l.at});return m}
function drawU(){if(!isAdm())return;var ll=lastLogin();
$("utb").innerHTML=users.slice().sort(function(a,b){return a.id>b.id?1:-1}).map(function(u){var p=u.portals||{},on=u.active!==false;
return"<tr><td><b>"+esc(u.id)+"</b></td><td>"+esc(u.name)+"</td><td>"+PORTALS.map(function(x){return"<div style='margin:2px 0'>"+x.icon+" "+psel(x.id,p[x.id]||"none",u.id)+"</div>"}).join("")+"</td><td><button data-act='tog' data-u='"+u.id+"' class='"+(on?"":"d")+"'>"+(on?"Active":"Disabled")+"</button></td><td>"+(ll[u.id]?esc(new Date(ll[u.id]).toLocaleString()):"—")+"</td><td><button data-act='pw' data-u='"+u.id+"'>Reset password</button> <button class='d' data-act='del' data-u='"+u.id+"'>Delete</button></td></tr>"}).join("")||"<tr><td colspan='6' style='color:var(--mu)'>No users yet. Create one above.</td></tr>"}
$("uadd").onclick=async function(){var u=$("nu").value.trim().toLowerCase(),n=$("nn").value.trim(),p=$("npw").value,e=$("uerr");e.textContent="";
if(!UNRE.test(u)){e.textContent="Username: 3–30 chars, a-z 0-9 . _ - (start with letter/number).";return}
if(p.length<6){e.textContent="Password must be at least 6 characters.";return}
if(users.some(function(x){return x.id===u})){e.textContent="Username already exists.";return}
var pr={};PORTALS.forEach(function(x){var v=$("np_"+x.id).value;if(v!=="none")pr[x.id]=v});
try{var salt=rnd();await db.doc("creds/"+u).set({name:n||u,salt:salt,hash:await hashPw(p,salt),portals:pr,active:true,createdAt:new Date().toISOString()});
$("nu").value="";$("nn").value="";$("npw").value="";e.textContent="";alert("User created. Share the username and password with them.")}catch(x){e.textContent=(x&&x.message)||String(x)}};
$("utb").onchange=async function(e){var s=e.target;if(!s.dataset.u)return;var row=s.closest("tr"),pr={};
row.querySelectorAll("select[data-p]").forEach(function(x){if(x.value!=="none")pr[x.dataset.p]=x.value});
try{await db.doc("creds/"+s.dataset.u).update({portals:pr})}catch(x){fail(x)}};
$("utb").onclick=async function(e){var b=e.target.closest("button[data-act]");if(!b)return;var u=b.dataset.u,rec=users.filter(function(x){return x.id===u})[0];if(!rec)return;
try{if(b.dataset.act==="tog")await db.doc("creds/"+u).update({active:rec.active===false});
else if(b.dataset.act==="del"){if(confirm("Delete user "+u+"?"))await db.doc("creds/"+u).delete()}
else{var p=prompt("New password for "+u+" (min 6 characters):");if(p&&p.length>=6){var salt=rnd();await db.doc("creds/"+u).update({salt:salt,hash:await hashPw(p,salt)});alert("Password updated.")}else if(p)alert("Too short.")}}catch(x){fail(x)}};

/* ---------- Login log (admin) ---------- */
function drawL(){if(!isAdm())return;var q=$("lq").value.toLowerCase();
var l=logs.filter(function(r){return!q||(r.username+" "+r.name+" "+r.result).toLowerCase().indexOf(q)>-1});
$("lcnt").textContent=l.length+" entries (latest 500)";
$("ltb").innerHTML=l.map(function(r){return"<tr><td>"+esc(new Date(r.at).toLocaleString())+"</td><td>"+esc(r.username)+"</td><td>"+esc(r.name)+"</td><td><span class='tag "+esc(r.result)+"'>"+esc(r.result==="success"?"Login":r.result==="admin"?"Admin login":"Failed")+"</span></td></tr>"}).join("")||"<tr><td colspan='4' style='color:var(--mu)'>No logins yet.</td></tr>"}
$("lq").oninput=draw;

/* ---------- start ---------- */
var s0=getSess();
if(s0==="__admin__"&&isAdminAcct){setCur({type:"admin",username:"admin",name:me.name||"Admin",portals:{}})}
else if(s0&&UNRE.test(s0)){try{var sn=await db.doc("creds/"+s0).get(),dd=sn.exists?sn.data():null;if(dd&&dd.active!==false)setCur({type:"user",username:s0,name:dd.name,portals:dd.portals||{}});else showLogin()}catch(x){showLogin()}}
else showLogin();
})();
