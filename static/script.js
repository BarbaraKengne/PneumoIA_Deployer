// ── VARIABLES ──
let historiqueAnalyses = [];
let predictionActuelle = null;
let confianceActuelle = null;
let messagesChat = [];
let chatOuvert = false;
let dernierFichier = null;
let resultatsLot = [];

let logoDataURL = null;
let policeRegular = null;
let policeBold = null;

// ── CHAT TOGGLE ──
function toggleChat(e) {
if (e) e.stopPropagation();
chatOuvert = !chatOuvert;
const panel = document.getElementById('chatPanel');
const notif = document.getElementById('chatNotif');
if (chatOuvert) { panel.classList.remove('hidden'); notif.classList.add('hidden'); }
else { panel.classList.add('hidden'); }
}

// ── DRAG bulle ──
const wrapper = document.getElementById('chatWrapper');
const bubble = document.getElementById('chatBubble');
let isDragging = false, startX, startY, origX, origY;
bubble.addEventListener('click', (e) => { if (isDragging) { e.preventDefault(); return; } toggleChat(); });
bubble.addEventListener('mousedown', (e) => {
if (e.button !== 0) return;
isDragging = false; startX = e.clientX; startY = e.clientY;
origX = wrapper.offsetLeft; origY = wrapper.offsetTop;
const onMove = (ev) => {
const dx = ev.clientX - startX, dy = ev.clientY - startY;
if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
isDragging = true; bubble.classList.add('dragging'); bubble.style.animation = 'none';
let nx = Math.max(0, Math.min(window.innerWidth - 60, origX + dx));
let ny = Math.max(0, Math.min(window.innerHeight - 60, origY + dy));
wrapper.style.left = nx + 'px'; wrapper.style.top = ny + 'px';
wrapper.style.right = 'auto'; wrapper.style.bottom = 'auto';
}
};
const onUp = () => {
bubble.classList.remove('dragging');
document.removeEventListener('mousemove', onMove);
document.removeEventListener('mouseup', onUp);
setTimeout(() => { isDragging = false; }, 50);
};
document.addEventListener('mousemove', onMove);
document.addEventListener('mouseup', onUp);
});

// ── UPLOAD UNIQUE (1 ou plusieurs) ──
function setupUpload() {
const zone = document.getElementById('zoneUpload');
const input = document.getElementById('inputImage');
zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); router(e.dataTransfer.files); });
zone.addEventListener('click', () => input.click());
input.addEventListener('change', e => router(e.target.files));
}

// Aiguilleur : 1 image -> analyse détaillée ; plusieurs -> lot
function router(fichiers) {
const liste = Array.from(fichiers || []).filter(f => f.type.startsWith('image/'));
if (liste.length === 0) return;
if (liste.length === 1) {
document.getElementById('blocLot').classList.add('hidden');
document.getElementById('blocResultat').classList.remove('hidden');
analyserImage(liste[0]);
} else {
document.getElementById('blocResultat').classList.add('hidden');
document.getElementById('blocLot').classList.remove('hidden');
analyserLot(liste);
}
}

// ── ANALYSE SIMPLE ──
async function analyserImage(fichier) {
if (!fichier) return;
dernierFichier = fichier;
document.getElementById('zoneHeatmap').classList.add('hidden');
const reader = new FileReader();
reader.onload = e => {
const prev = document.getElementById('previewImage');
const ico = document.getElementById('iconPoumon');
prev.src = e.target.result; prev.classList.remove('hidden');
ico.classList.add('hidden');
};
reader.readAsDataURL(fichier);
document.getElementById('statutLabel').textContent = "Analyse en cours...";
const fd = new FormData(); fd.append("image", fichier);
try {
const rep = await fetch("/predire", { method: "POST", body: fd });
const data = await rep.json();
afficherResultat(data.prediction, data.confiance);
await envoyerMessageAuto(data.prediction, data.confiance);
} catch(err) {
document.getElementById('statutLabel').textContent = "Erreur de connexion.";
}
}

function afficherResultat(prediction, confiance) {
predictionActuelle = prediction; confianceActuelle = confiance;
const estPneumo = prediction === "PNEUMONIE";
const badge = document.getElementById('badgeStatut');
badge.textContent = prediction;
badge.className = estPneumo ? 'badge-pneumo' : 'badge-normal';
document.getElementById('confianceVal').textContent = confiance + "%";
const barre = document.getElementById('barreConfiance');
barre.style.width = confiance + "%";
barre.style.background = estPneumo ? 'linear-gradient(90deg,#fb7185,#f43f5e)' : 'linear-gradient(90deg,#3b82f6,#2563eb)';
document.getElementById('statutLabel').textContent = estPneumo
? "Pneumonie détectée — résultat transmis à l'agent IA."
: "Aucune anomalie détectée sur ce cliché.";
document.getElementById('btnPdf').classList.remove('hidden');
document.getElementById('btnHeatmap').classList.remove('hidden');
const now = new Date();
const id = "PAT-" + String(Math.floor(Math.random()*900)+100);
historiqueAnalyses.unshift({ id, heure: now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}), prediction, confiance });
mettreAJourHistorique();
if (!chatOuvert) document.getElementById('chatNotif').classList.remove('hidden');
}

function mettreAJourHistorique() {
const tbody = document.getElementById('tbodyHistorique');
if (historiqueAnalyses.length === 0) return;
tbody.innerHTML = historiqueAnalyses.slice(0,8).map(h => `
<tr>
<td>${h.id}</td>
<td>${h.heure}</td>
<td><span class="${h.prediction==='PNEUMONIE'?'badge-pneumo':'badge-normal'}">${h.prediction}</span></td>
<td>${h.confiance}%</td>
</tr>`).join('');
}

async function envoyerMessageAuto(prediction, confiance) {
await envoyerMessage(`Le modèle a détecté : ${prediction} avec ${confiance}% de confiance. Explique ce résultat.`, true);
}

async function envoyerMessage(texte, auto = false) {
if (!texte || !texte.trim()) return;
if (!auto) { ajouterMsg('user', texte); document.getElementById('inputChat').value = ''; }
messagesChat.push({ role: "user", content: texte });
const typingId = 'typing-' + Date.now();
ajouterMsg('ai', 'En train d\'écrire...', typingId);
try {
const rep = await fetch("/chat", {
method: "POST", headers: {"Content-Type":"application/json"},
body: JSON.stringify({ messages: messagesChat, prediction: predictionActuelle, confiance: confianceActuelle })
});
const data = await rep.json();
document.getElementById(typingId)?.remove();
ajouterMsg('ai', data.reponse);
messagesChat.push({ role: "assistant", content: data.reponse });
} catch(err) {
document.getElementById(typingId)?.remove();
ajouterMsg('ai', "Erreur de connexion.");
}
}

function ajouterMsg(role, texte, id) {
const container = document.getElementById('chatMessages');
const div = document.createElement('div');
div.className = role === 'user' ? 'msg-user' : 'msg-ai';
if (id) div.id = id;
div.innerHTML = `<div class="msg-ava ${role==='user'?'msg-ava-user':'msg-ava-ai'}">${role==='user'?'DR':'AI'}</div><div class="msg-txt">${texte}</div>`;
container.appendChild(div);
container.scrollTop = container.scrollHeight;
}

// ── ANALYSE PAR LOT ──
async function analyserLot(liste) {
const grid = document.getElementById('lotGrid');
grid.innerHTML = ''; resultatsLot = [];
document.getElementById('lotResume').classList.remove('visible');

liste.forEach((fichier, i) => {
const vignette = document.createElement('div');
vignette.className = 'lot-vignette'; vignette.id = 'vig-' + i;
const url = URL.createObjectURL(fichier);
vignette.innerHTML = `<img class="lot-img" src="${url}" alt="${fichier.name}">
<div class="lot-info"><div class="lot-nom" title="${fichier.name}">${fichier.name}</div>
<div class="lot-pending"><i class="fa-solid fa-spinner fa-spin"></i> analyse...</div></div>`;
grid.appendChild(vignette);
});

for (let i = 0; i < liste.length; i++) {
const fichier = liste[i];
try {
const fd = new FormData(); fd.append("image", fichier);
const rep = await fetch("/predire", { method: "POST", body: fd });
const data = await rep.json();
const dataURL = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(fichier); });
resultatsLot.push({ nom: fichier.name, prediction: data.prediction, confiance: data.confiance, image: dataURL });
majVignette(i, fichier.name, data.prediction, data.confiance);
// ajoute aussi à l'historique
const now = new Date();
historiqueAnalyses.unshift({ id: "LOT-" + String(Math.floor(Math.random()*900)+100), heure: now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}), prediction: data.prediction, confiance: data.confiance });
} catch (err) {
majVignette(i, fichier.name, "ERREUR", 0);
}
}
mettreAJourHistorique();
majResumeLot();
}

function majVignette(i, nom, prediction, confiance) {
const vig = document.getElementById('vig-' + i);
if (!vig) return;
const estPneumo = prediction === "PNEUMONIE";
const classeBadge = estPneumo ? 'badge-pneumo' : (prediction === "NORMAL" ? 'badge-normal' : 'badge-wait');
vig.querySelector('.lot-info').innerHTML = `<div class="lot-nom" title="${nom}">${nom}</div>
<span class="lot-badge ${classeBadge}">${prediction}</span><div class="lot-conf">${confiance}%</div>`;
}

function majResumeLot() {
const total = resultatsLot.length;
const pneumo = resultatsLot.filter(r => r.prediction === "PNEUMONIE").length;
const normal = resultatsLot.filter(r => r.prediction === "NORMAL").length;
document.getElementById('lotTotal').textContent = total;
document.getElementById('lotPneumo').textContent = pneumo;
document.getElementById('lotNormal').textContent = normal;
document.getElementById('lotResume').classList.add('visible');
}

// ── HEATMAP ──
async function genererHeatmap() {
if (!dernierFichier) return;
const btn = document.getElementById('btnHeatmap');
const zone = document.getElementById('zoneHeatmap');
const texteInitial = btn.innerHTML;
btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Calcul en cours...';
btn.disabled = true;
try {
const fd = new FormData(); fd.append('image', dernierFichier);
const rep = await fetch('/heatmap', { method: 'POST', body: fd });
const data = await rep.json();
if (data.heatmap) {
document.getElementById('imgHeatmap').src = data.heatmap;
document.getElementById('imgOriginale').src = document.getElementById('previewImage').src;
zone.classList.remove('hidden');
} else { alert("Impossible de générer la carte de chaleur."); }
} catch (e) {
alert("Erreur lors du calcul de la carte de chaleur.");
} finally {
btn.innerHTML = texteInitial; btn.disabled = false;
}
}

// ── PRÉCHARGEMENT PDF ──
function abEnBase64(buffer) {
let binaire = ''; const octets = new Uint8Array(buffer); const taille = 0x8000;
for (let i = 0; i < octets.length; i += taille) binaire += String.fromCharCode.apply(null, octets.subarray(i, i + taille));
return btoa(binaire);
}
async function chargerRessourcesPDF() {
try {
const rep = await fetch('/static/logo.png');
if (rep.ok) { const blob = await rep.blob(); logoDataURL = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); }); }
} catch (e) { logoDataURL = null; }
try {
const r = await fetch('/static/Roboto-Regular.ttf');
if (r.ok) policeRegular = abEnBase64(await r.arrayBuffer());
const b = await fetch('/static/Roboto-Bold.ttf');
if (b.ok) policeBold = abEnBase64(await b.arrayBuffer());
} catch (e) { policeRegular = null; policeBold = null; }
}
function nettoyerTexte(t) { return (t || '').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}]/gu, '').trim(); }
function appliquerPolice(doc) {
if (policeRegular) {
doc.addFileToVFS('Roboto-Regular.ttf', policeRegular);
doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
if (policeBold) { doc.addFileToVFS('Roboto-Bold.ttf', policeBold); doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold'); }
return 'Roboto';
}
return 'helvetica';
}

// ── PDF analyse simple ──
async function genererPDF() {
const btn = document.getElementById('btnPdf');
const texteBtn = btn.innerHTML;
btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Génération...';
btn.disabled = true;

// Génère la heatmap automatiquement pour l'inclure dans le PDF
let heatmapURL = null;
if (dernierFichier) {
try {
const fd = new FormData(); fd.append('image', dernierFichier);
const rep = await fetch('/heatmap', { method: 'POST', body: fd });
const data = await rep.json();
if (data.heatmap) heatmapURL = data.heatmap;
} catch (e) { heatmapURL = null; }
}

const { jsPDF } = window.jspdf;
const doc = new jsPDF();
const P = doc.internal.pageSize.getWidth(); const marge = 15;
const bleu1 = [37, 99, 235], bleu2 = [59, 130, 246], gris = [100, 116, 139], noir = [15, 23, 42];
const police = appliquerPolice(doc);
doc.setFont(police, 'normal');

// En-tête
doc.setFillColor(...bleu1); doc.rect(0, 0, P, 32, 'F');
doc.setFillColor(...bleu2); doc.rect(0, 32, P, 2, 'F');
let xTitre = marge;
if (logoDataURL) { try { doc.addImage(logoDataURL, 'PNG', marge, 7, 18, 18); xTitre = marge + 24; } catch(e) {} }
doc.setTextColor(255,255,255); doc.setFont(police,'bold'); doc.setFontSize(20);
doc.text("PneuMoAI", xTitre, 16);
doc.setFont(police,'normal'); doc.setFontSize(10);
doc.text("Rapport d'analyse radiographique", xTitre, 24);
const now = new Date();
doc.setFontSize(8);
doc.text(now.toLocaleDateString('fr-FR') + " · " + now.toLocaleTimeString('fr-FR'), P - marge, 16, { align: 'right' });

// Radio + encadré diagnostic
let y = 44;
const img = document.getElementById('previewImage');
if (img && img.src && !img.classList.contains('hidden')) { try { doc.addImage(img.src, 'JPEG', marge, y, 45, 45); } catch(e) {} }
doc.setFontSize(7); doc.setTextColor(...gris);
doc.text("Radiographie analysée", marge, y + 49);

const estPneumo = predictionActuelle === "PNEUMONIE";
const xBox = marge + 52, wBox = P - marge - xBox;
doc.setDrawColor(...(estPneumo ? [254,205,211] : [187,247,208]));
doc.setFillColor(...(estPneumo ? [255,241,242] : [240,253,244]));
doc.roundedRect(xBox, y, wBox, 45, 3, 3, 'FD');
doc.setTextColor(...gris); doc.setFontSize(9); doc.text("DIAGNOSTIC", xBox + 6, y + 9);
doc.setFont(police,'bold'); doc.setFontSize(22);
doc.setTextColor(...(estPneumo ? [225,29,72] : [22,163,74]));
doc.text(predictionActuelle || "--", xBox + 6, y + 22);
doc.setFont(police,'normal'); doc.setFontSize(10); doc.setTextColor(...noir);
doc.text("Confiance : " + (confianceActuelle || "--") + "%", xBox + 6, y + 32);
const xBar = xBox + 6, yBar = y + 36, wBar = wBox - 12;
doc.setFillColor(238,242,248); doc.roundedRect(xBar, yBar, wBar, 3, 1.5, 1.5, 'F');
doc.setFillColor(...(estPneumo ? [244,63,94] : bleu1));
doc.roundedRect(xBar, yBar, Math.max(0,Math.min(100,confianceActuelle||0))/100*wBar, 3, 1.5, 1.5, 'F');
doc.setFontSize(8); doc.setTextColor(...gris);
doc.text("Modèle : HistGradientBoosting", xBox + 6, y + 43);

y = 100;

// Carte de chaleur (toujours générée)
if (heatmapURL) {
doc.setFont(police,'bold'); doc.setFontSize(13); doc.setTextColor(...noir);
doc.text("Carte de chaleur (zones analysées)", marge, y); y += 6;
doc.setFont(police,'normal'); doc.setFontSize(8.5); doc.setTextColor(...gris);
const intro = doc.splitTextToSize("Zones ayant le plus influencé la décision du modèle (rouge = forte influence, bleu = faible).", P - 2*marge);
doc.text(intro, marge, y); y += intro.length * 4.5 + 3;
try {
const orig = document.getElementById('previewImage').src;
doc.addImage(orig, 'JPEG', marge, y, 50, 50);
doc.addImage(heatmapURL, 'PNG', marge + 58, y, 50, 50);
doc.setFontSize(7); doc.setTextColor(...gris);
doc.text("Originale", marge + 17, y + 54);
doc.text("Carte de chaleur", marge + 70, y + 54);
} catch(e) {}
y += 62;
}

// Échanges MedAI
if (y > 230) { doc.addPage(); y = 20; }
doc.setFont(police,'bold'); doc.setFontSize(13); doc.setTextColor(...noir);
doc.text("Échanges avec l'assistant MedAI", marge, y); y += 8; doc.setFontSize(9);
const echanges = messagesChat.filter(m => !m.content.startsWith("Le modèle a détecté"));
if (echanges.length === 0) {
doc.setFont(police,'normal'); doc.setTextColor(...gris);
doc.text("Aucun échange avec l'assistant.", marge, y);
} else {
echanges.forEach(m => {
const estUser = m.role === "user";
const lignes = doc.splitTextToSize((estUser ? "Vous : " : "MedAI : ") + nettoyerTexte(m.content), P - 2*marge);
if (y + lignes.length * 5 > 275) { doc.addPage(); y = 20; }
doc.setFont(police, estUser ? 'bold' : 'normal');
doc.setTextColor(...(estUser ? bleu1 : gris));
doc.text(lignes, marge, y); y += lignes.length * 5 + 3;
});
}

ajouterPiedDePage(doc, police, gris, P, marge);
doc.save("rapport_pneumoai_" + now.getTime() + ".pdf");
btn.innerHTML = texteBtn; btn.disabled = false;
}

// ── PDF lot ──
function genererPDFLot() {
if (resultatsLot.length === 0) return;
const { jsPDF } = window.jspdf;
const doc = new jsPDF();
const P = doc.internal.pageSize.getWidth(); const marge = 15;
const bleu1 = [37,99,235], bleu2 = [59,130,246], gris = [100,116,139], noir = [15,23,42];
const police = appliquerPolice(doc);

// En-tête
doc.setFillColor(...bleu1); doc.rect(0, 0, P, 32, 'F');
doc.setFillColor(...bleu2); doc.rect(0, 32, P, 2, 'F');
let xTitre = marge;
if (logoDataURL) { try { doc.addImage(logoDataURL, 'PNG', marge, 7, 18, 18); xTitre = marge + 24; } catch(e) {} }
doc.setTextColor(255,255,255); doc.setFont(police,'bold'); doc.setFontSize(20);
doc.text("PneuMoAI", xTitre, 16);
doc.setFont(police,'normal'); doc.setFontSize(10);
doc.text("Rapport d'analyse par lot", xTitre, 24);
const now = new Date();
doc.setFontSize(8);
doc.text(now.toLocaleDateString('fr-FR') + " · " + now.toLocaleTimeString('fr-FR'), P - marge, 16, { align: 'right' });

const total = resultatsLot.length;
const pneumo = resultatsLot.filter(r => r.prediction === "PNEUMONIE").length;
const normal = resultatsLot.filter(r => r.prediction === "NORMAL").length;

// Cartes de synthèse (3 encadrés)
let y = 44;
doc.setFont(police,'bold'); doc.setFontSize(13); doc.setTextColor(...noir);
doc.text("Synthèse du lot", marge, y); y += 8;
const cardW = (P - 2*marge - 2*5) / 3;
const cartes = [
  ["TOTAL", String(total), [37,99,235], [239,245,255], [211,227,253]],
  ["PNEUMONIES", String(pneumo), [225,29,72], [255,241,242], [254,205,211]],
  ["NORMALES", String(normal), [22,163,74], [240,253,244], [187,247,208]],
];
cartes.forEach((c, i) => {
  const x = marge + i * (cardW + 5);
  doc.setDrawColor(...c[4]); doc.setFillColor(...c[3]);
  doc.roundedRect(x, y, cardW, 26, 3, 3, 'FD');
  doc.setFont(police,'bold'); doc.setFontSize(22); doc.setTextColor(...c[2]);
  doc.text(c[1], x + cardW/2, y + 14, { align: 'center' });
  doc.setFont(police,'normal'); doc.setFontSize(7.5); doc.setTextColor(...gris);
  doc.text(c[0], x + cardW/2, y + 21, { align: 'center' });
});
y += 36;

// Tableau détaillé
doc.setFont(police,'bold'); doc.setFontSize(11); doc.setTextColor(...noir);
doc.text("Détail des analyses", marge, y); y += 7;
doc.setFillColor(239,245,255); doc.rect(marge, y - 4, P - 2*marge, 7, 'F');
doc.setFont(police,'bold'); doc.setFontSize(8); doc.setTextColor(...gris);
doc.text("#", marge + 3, y); doc.text("FICHIER", marge + 12, y);
doc.text("DIAGNOSTIC", marge + 115, y); doc.text("CONFIANCE", marge + 160, y); y += 6;
doc.setFont(police,'normal');
resultatsLot.forEach((r, idx) => {
if (y > 278) { doc.addPage(); y = 20; }
doc.setFontSize(9); doc.setTextColor(...gris);
doc.text(String(idx + 1), marge + 3, y);
doc.setTextColor(...noir);
const nomCourt = r.nom.length > 42 ? r.nom.substring(0, 39) + "..." : r.nom;
doc.text(nomCourt, marge + 12, y);
doc.setTextColor(...(r.prediction === 'PNEUMONIE' ? [225,29,72] : [22,163,74]));
doc.setFont(police,'bold');
doc.text(String(r.prediction), marge + 115, y);
doc.setFont(police,'normal'); doc.setTextColor(...noir);
doc.text(r.confiance + "%", marge + 160, y);
doc.setDrawColor(238,242,248); doc.line(marge, y + 2, P - marge, y + 2); y += 7;
});

ajouterPiedDePage(doc, police, gris, P, marge);
doc.save("rapport_lot_pneumoai_" + now.getTime() + ".pdf");
}

function ajouterPiedDePage(doc, police, gris, P, marge) {
const nb = doc.internal.getNumberOfPages();
for (let i = 1; i <= nb; i++) {
doc.setPage(i);
doc.setDrawColor(238,242,248); doc.line(marge, 285, P - marge, 285);
doc.setFont(police,'normal'); doc.setFontSize(7); doc.setTextColor(...gris);
doc.text("Outil d'aide au diagnostic — ne remplace pas l'avis d'un médecin.", marge, 290);
doc.text("Page " + i + "/" + nb, P - marge, 290, { align: 'right' });
}
}

window.onload = () => { setupUpload(); chargerRessourcesPDF(); };