import { Router } from "express";

/**
 * Painel admin (HTML único, vanilla JS). Servido em /panel. Não tem segredo
 * embutido: pede a x-admin-key (guardada no localStorage) e fala com /admin/*.
 */
export const panelRouter = Router();

panelRouter.get("/panel", (_req, res) => {
  res.type("html").send(PANEL_HTML);
});

const PANEL_HTML = /* html */ `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>wpp-ai · painel</title>
<style>
  :root { --b:#7c3aed; --ink:#0f172a; --mut:#64748b; --bd:#e2e8f0; --bg:#f8fafc; }
  * { box-sizing:border-box; font-family:system-ui,Segoe UI,Roboto,sans-serif; }
  body { margin:0; background:var(--bg); color:var(--ink); }
  header { background:#fff; border-bottom:1px solid var(--bd); padding:12px 20px; display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
  header h1 { font-size:18px; margin:0; flex:1; }
  main { max-width:920px; margin:0 auto; padding:20px; display:flex; flex-direction:column; gap:20px; }
  .card { background:#fff; border:1px solid var(--bd); border-radius:12px; padding:16px; }
  .card h2 { margin:0 0 12px; font-size:15px; }
  input, select, textarea, button { font-size:14px; padding:8px 10px; border:1px solid var(--bd); border-radius:8px; background:#fff; }
  textarea { width:100%; min-height:56px; }
  button { background:var(--b); color:#fff; border:0; cursor:pointer; font-weight:600; }
  button.sec { background:#fff; color:var(--ink); border:1px solid var(--bd); }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th,td { text-align:left; padding:8px; border-bottom:1px solid var(--bd); }
  .pill { font-size:12px; padding:2px 8px; border-radius:999px; }
  .on { background:#dcfce7; color:#166534; } .off { background:#fee2e2; color:#991b1b; } .mid { background:#fef9c3; color:#854d0e; }
  .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .flow { border:1px solid var(--bd); border-radius:10px; padding:12px; margin-bottom:10px; }
  .flow b { display:block; margin-bottom:6px; }
  label { font-size:13px; color:var(--mut); }
  .muted { color:var(--mut); font-size:13px; }
</style>
</head>
<body>
<header>
  <h1>wpp-ai · painel</h1>
  <input id="key" type="password" placeholder="x-admin-key" style="width:260px" />
  <button onclick="saveKey()">Salvar chave</button>
</header>
<main>
  <div class="card">
    <h2>Sistemas</h2>
    <div id="systems" class="muted">—</div>
    <details style="margin-top:12px">
      <summary>Registrar novo sistema</summary>
      <div class="row" style="margin-top:10px">
        <input id="s_name" placeholder="Nome (ex.: Agendota)" />
        <select id="s_adapter" onchange="toggleAdapter()">
          <option value="agendota">agendota</option>
          <option value="generic">generic</option>
        </select>
      </div>
      <div id="ag_fields" class="row" style="margin-top:8px">
        <input id="s_baseUrl" placeholder="config.baseUrl (https://agendota.com)" style="flex:1" />
        <input id="s_apiKey" placeholder="config.apiKey (CHAVE_A)" style="flex:1" />
      </div>
      <div id="gen_fields" class="row" style="margin-top:8px; display:none">
        <input id="s_cbUrl" placeholder="callbackUrl" style="flex:1" />
        <input id="s_cbSecret" placeholder="callbackSecret" style="flex:1" />
      </div>
      <button style="margin-top:10px" onclick="createSystem()">Criar</button>
      <div id="s_result" class="muted" style="margin-top:8px"></div>
    </details>
  </div>

  <div class="card">
    <h2>Conexões (WhatsApp)</h2>
    <div id="instances" class="muted">—</div>
  </div>

  <div class="card">
    <h2>Fluxos</h2>
    <div class="row">
      <select id="pick" onchange="loadFlows()"><option value="">Selecione uma conexão…</option></select>
      <button class="sec" onclick="refresh()">Atualizar</button>
    </div>
    <div id="flows" style="margin-top:12px"></div>
  </div>
</main>
<script>
const $ = (id) => document.getElementById(id);
function key(){ return localStorage.getItem("wppai_key") || ""; }
function saveKey(){ localStorage.setItem("wppai_key", $("key").value.trim()); refresh(); }
async function api(path, opts={}){
  const res = await fetch(path, { ...opts, headers:{ "Content-Type":"application/json", "x-admin-key":key(), ...(opts.headers||{}) } });
  const j = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(j.error || ("Erro "+res.status));
  return j.data;
}
function toggleAdapter(){
  const ag = $("s_adapter").value === "agendota";
  $("ag_fields").style.display = ag ? "flex" : "none";
  $("gen_fields").style.display = ag ? "none" : "flex";
}
function statusPill(s){ const c = s==="CONNECTED"?"on":(s==="CONNECTING"?"mid":"off"); return '<span class="pill '+c+'">'+s+'</span>'; }

let INSTANCES = [];
async function refresh(){
  $("key").value = key();
  try {
    const sys = await api("/admin/systems");
    $("systems").innerHTML = sys.length ? table(sys, ["name","adapter","id"]) : "Nenhum sistema.";
  } catch(e){ $("systems").innerHTML = '<span class="off pill">'+e.message+'</span>'; return; }
  try {
    INSTANCES = await api("/admin/instances");
    $("instances").innerHTML = INSTANCES.length
      ? '<table><tr><th>Sistema</th><th>Tenant</th><th>Número</th><th>Status</th></tr>' +
        INSTANCES.map(i=>'<tr><td>'+i.systemName+'</td><td>'+i.tenantRef+'</td><td>'+(i.phoneNumber||"—")+'</td><td>'+statusPill(i.status)+'</td></tr>').join("") + '</table>'
      : "Nenhuma conexão ainda.";
    const pick = $("pick");
    pick.innerHTML = '<option value="">Selecione uma conexão…</option>' +
      INSTANCES.map((i,ix)=>'<option value="'+ix+'">'+i.systemName+' — '+i.tenantRef+'</option>').join("");
  } catch(e){ $("instances").innerHTML = '<span class="off pill">'+e.message+'</span>'; }
}
function table(rows, cols){
  return '<table><tr>'+cols.map(c=>'<th>'+c+'</th>').join("")+'</tr>'+
    rows.map(r=>'<tr>'+cols.map(c=>'<td>'+(r[c]??"—")+'</td>').join("")+'</tr>').join("")+'</table>';
}
async function createSystem(){
  const adapter = $("s_adapter").value;
  const body = { name:$("s_name").value.trim(), adapter };
  if(adapter==="agendota") body.config = { baseUrl:$("s_baseUrl").value.trim(), apiKey:$("s_apiKey").value.trim() };
  else { body.callbackUrl=$("s_cbUrl").value.trim(); body.callbackSecret=$("s_cbSecret").value.trim(); }
  try {
    const d = await api("/admin/systems", { method:"POST", body:JSON.stringify(body) });
    $("s_result").innerHTML = "✓ Criado. <b>apiKey (CHAVE_B): "+d.apiKey+"</b> — guarde, só aparece agora.";
    refresh();
  } catch(e){ $("s_result").innerHTML = '<span class="off pill">'+e.message+'</span>'; }
}
async function loadFlows(){
  const ix = $("pick").value;
  if(ix===""){ $("flows").innerHTML=""; return; }
  const inst = INSTANCES[ix];
  const flows = await api("/admin/flows?systemId="+encodeURIComponent(inst.systemId)+"&tenantRef="+encodeURIComponent(inst.tenantRef));
  const camp = flows.filter(f=>f.kind==="campaign");
  const reply = flows.filter(f=>f.kind==="reply");
  const ar = inst.autoReply!==false;
  let html = "";
  html += '<div class="flow" style="background:#faf5ff;border-color:#e9d5ff">'+
    '<label class="row" style="justify-content:space-between"><b style="margin:0">Atendimento automático</b>'+
    '<input type="checkbox" '+(ar?"checked":"")+' onchange="saveAutoReply(\\''+inst.systemId+'\\',\\''+inst.tenantRef+'\\',this.checked)"/></label>'+
    '<p class="muted" style="margin:6px 0 0">Se desligado, o robô só ENVIA (confirmação/lembrete) e não responde mensagens recebidas (deixa pro atendente).</p>'+
    '<span id="ar_r" class="muted"></span></div>';
  html += '<h3 style="margin:16px 0 6px;font-size:14px">📤 Envios automáticos (campanha)</h3>';
  html += camp.map(f=>flowCard(inst,f)).join("");
  html += '<h3 style="margin:16px 0 6px;font-size:14px">💬 Respostas automáticas (atendimento)</h3>';
  html += reply.map(f=>flowCard(inst,f)).join("");
  $("flows").innerHTML = html;
}
async function saveAutoReply(systemId, tenantRef, on){
  try {
    await api("/admin/instances/auto-reply", { method:"PUT", body:JSON.stringify({systemId, tenantRef, autoReply:on}) });
    $("ar_r").textContent = "✓ salvo";
    const i = INSTANCES.find(x=>x.systemId===systemId && x.tenantRef===tenantRef); if(i) i.autoReply = on;
  } catch(e){ $("ar_r").textContent = e.message; }
}
function flowCard(inst, f){
  const timing = (f.flow==="CONFIRMATION"||f.flow==="REMINDER");
  return '<div class="flow"><b>'+f.flow+'</b>'+
    '<label><input type="checkbox" '+(f.enabled?"checked":"")+' id="en_'+f.flow+'"/> Ligado</label>'+
    '<textarea id="tpl_'+f.flow+'">'+(f.messageTpl||"").replace(/</g,"&lt;")+'</textarea>'+
    (timing?'<div class="row" style="margin-top:6px"><label>Antecedência (h):</label><input type="number" min="1" max="168" value="'+(f.hoursBefore??"")+'" id="hb_'+f.flow+'" style="width:90px"/></div>':'')+
    '<button style="margin-top:8px" onclick="saveFlow(\\''+inst.systemId+'\\',\\''+inst.tenantRef+'\\',\\''+f.flow+'\\','+timing+')">Salvar</button>'+
    ' <span id="r_'+f.flow+'" class="muted"></span></div>';
}
async function saveFlow(systemId, tenantRef, flow, timing){
  const body = { systemId, tenantRef, flow, enabled:$("en_"+flow).checked, messageTpl:$("tpl_"+flow).value };
  if(timing){ const v=$("hb_"+flow).value; body.hoursBefore = v?Number(v):null; }
  try { await api("/admin/flows", { method:"PUT", body:JSON.stringify(body) }); $("r_"+flow).textContent="✓ salvo"; }
  catch(e){ $("r_"+flow).textContent = e.message; }
}
refresh();
</script>
</body>
</html>`;
