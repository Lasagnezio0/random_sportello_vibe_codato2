// Sportello Lamentele — server minimale
// Avvio:  ADMIN_KEY=la-tua-password node server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "cambiami";
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "tickets.json");
const MAX_TICKETS = 500;

const STATI = ["aperto", "letto", "lavorazione", "feature", "macchina", "risolto", "rifiutato"];
const PRIO = ["bassa", "media", "alta", "crit"];
const CATEGORIE = [
  "Bug nella mia vita", "Richiesta caffè", "Riunione che poteva essere una mail",
  "Richiesta ferie (lol)", "Complimenti (rari)", "Lamentela generica", "Altro / non so"
];

if (ADMIN_KEY === "cambiami") {
  console.warn("⚠️  ADMIN_KEY non impostata: la password admin è 'cambiami'. Impostala!");
}

// ---- storage su file JSON ----
let tickets = [];
try { tickets = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch { tickets = []; }
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(DATA_FILE, JSON.stringify(tickets, null, 2), err => {
      if (err) console.error("Salvataggio fallito:", err.message);
    });
  }, 200);
}

const str = (v, max) => String(v ?? "").trim().slice(0, max);
const isAdmin = req => {
  const k = req.get("x-admin-key") || "";
  const a = Buffer.from(k), b = Buffer.from(ADMIN_KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const requireAdmin = (req, res, next) =>
  isAdmin(req) ? next() : res.status(401).json({ error: "Non sei l'Ufficio." });

// vista pubblica: niente clientId in giro, solo il flag "mine"
const publicView = (t, clientId) => {
  const { clientId: owner, ...rest } = t;
  return { ...rest, mine: !!clientId && owner === clientId };
};

const app = express();
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/tickets", (req, res) => {
  const cid = str(req.query.clientId, 64);
  res.json(tickets.map(t => publicView(t, cid)));
});

app.post("/api/tickets", (req, res) => {
  const b = req.body || {};
  const subject = str(b.subject, 120);
  if (!subject) return res.status(400).json({ error: "Manca l'oggetto. Anche la burocrazia ha dei limiti." });
  if (tickets.length >= MAX_TICKETS) return res.status(507).json({ error: "Archivio pieno. L'Ufficio deve buttare qualche faldone." });
  const t = {
    id: crypto.randomUUID(),
    num: "INC-" + String(Date.now()).slice(-7),
    subject,
    category: CATEGORIE.includes(b.category) ? b.category : "Altro / non so",
    priority: PRIO.includes(b.priority) ? b.priority : "media",
    body: str(b.body, 2000),
    name: str(b.name, 40) || "Anonimo coraggioso",
    spento: !!b.spento,
    clientId: str(b.clientId, 64),
    createdAt: new Date().toISOString(),
    solleciti: 0,
    status: "aperto",
    messages: []
  };
  tickets.unshift(t);
  save();
  res.status(201).json(publicView(t, t.clientId));
});

app.post("/api/tickets/:id/sollecita", (req, res) => {
  const t = tickets.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "Ticket smarrito nei corridoi." });
  if (!t.clientId || t.clientId !== str(req.body?.clientId, 64))
    return res.status(403).json({ error: "Puoi sollecitare solo i tuoi ticket." });
  t.solleciti = Math.min((t.solleciti || 0) + 1, 999);
  save();
  res.json({ ok: true, solleciti: t.solleciti });
});

app.get("/api/admin/check", requireAdmin, (req, res) => res.json({ ok: true }));

app.post("/api/tickets/:id/reply", requireAdmin, (req, res) => {
  const t = tickets.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "Ticket non trovato." });
  const status = req.body?.status;
  const text = str(req.body?.text, 2000);
  if (STATI.includes(status)) t.status = status;
  if (text) t.messages = [...(t.messages || []), { text, at: new Date().toISOString() }].slice(-40);
  save();
  res.json({ ok: true });
});

app.delete("/api/tickets/:id", requireAdmin, (req, res) => {
  tickets = tickets.filter(x => x.id !== req.params.id);
  save();
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Sportello aperto su http://localhost:${PORT}`));
