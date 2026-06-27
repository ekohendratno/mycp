const fs = require("fs");
const db = require("../models/db");
const exec = require("../../scripts/exec");
const { requireAuth } = require("../middleware/auth");
const multer = require("multer");
const upload = multer({ dest: "/tmp/mycp-uploads/" });

module.exports = function (app) {
  app.get("/api/sites/:domain/files", requireAuth, async (req, res) => {
    const site = db.getSite(req.params.domain);
    if (!site) return res.status(404).json({ error: "Site tidak ditemukan" });
    const relPath = req.query.path || ".";
    try {
      const result = await exec.execFileList(req.params.domain, relPath);
      const lines = result.stdout.trim().split("\n");
      const entries = lines.slice(1).filter(Boolean).map((line) => {
        const parts = line.split("\t");
        return { name: parts[1] || "", type: parts[0] === "d" ? "folder" : "file", size: parts[2] || "0", modified: parts[3] || "", owner: parts[4] || "", perms: parts[5] || "" };
      });
      res.json({ path: relPath, entries, root: site.path });
    } catch (e) {
      res.json({ path: relPath, entries: [], root: site.path, error: "Gagal membaca direktori" });
    }
  });

  app.post("/api/sites/:domain/files/folder", requireAuth, async (req, res) => {
    const relPath = req.body.path;
    if (!relPath) return res.status(400).json({ error: "Path folder wajib diisi" });
    try {
      await exec.execCreateFolder(req.params.domain, relPath);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: "Gagal membuat folder" }); }
  });

  app.put("/api/sites/:domain/files/write", requireAuth, async (req, res) => {
    const { path: relPath, content } = req.body;
    if (!relPath || content === undefined) return res.status(400).json({ error: "Path dan konten wajib diisi" });
    try {
      await exec.execWriteFile(req.params.domain, relPath, content);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: "Gagal menulis file" }); }
  });

  app.get("/api/sites/:domain/files/read", requireAuth, async (req, res) => {
    const relPath = req.query.path;
    if (!relPath) return res.status(400).json({ error: "Path wajib diisi" });
    try {
      const result = await exec.execReadFile(req.params.domain, relPath);
      res.json({ content: result.stdout });
    } catch (e) { res.status(500).json({ error: "Gagal membaca file" }); }
  });

  app.post("/api/sites/:domain/files/rename", requireAuth, async (req, res) => {
    const { path: oldPath, newName } = req.body;
    if (!oldPath || !newName) return res.status(400).json({ error: "Path dan nama baru wajib diisi" });
    try {
      await exec.execRenameFile(req.params.domain, oldPath, newName);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: "Gagal rename" }); }
  });

  app.post("/api/sites/:domain/files/copy", requireAuth, async (req, res) => {
    const { source, dest } = req.body;
    if (!source || !dest) return res.status(400).json({ error: "Source dan dest wajib diisi" });
    try {
      await exec.execCopyFile(req.params.domain, source, dest);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: "Gagal copy" }); }
  });

  app.post("/api/sites/:domain/files/move", requireAuth, async (req, res) => {
    const { source, dest } = req.body;
    if (!source || !dest) return res.status(400).json({ error: "Source dan dest wajib diisi" });
    try {
      await exec.execMoveFile(req.params.domain, source, dest);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: "Gagal move" }); }
  });

  app.delete("/api/sites/:domain/files/delete", requireAuth, async (req, res) => {
    const relPath = req.query.path;
    if (!relPath) return res.status(400).json({ error: "Path wajib diisi" });
    try {
      await exec.execDeleteFile(req.params.domain, relPath);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: "Gagal menghapus" }); }
  });

  app.post("/api/sites/:domain/files/compress", requireAuth, async (req, res) => {
    const relPath = req.body.path;
    if (!relPath) return res.status(400).json({ error: "Path wajib diisi" });
    try {
      await exec.execCompressFile(req.params.domain, relPath);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: "Gagal compress" }); }
  });

  app.post("/api/sites/:domain/files/chmod", requireAuth, async (req, res) => {
    const { path: relPath, mode } = req.body;
    if (!relPath || !mode) return res.status(400).json({ error: "Path dan mode wajib diisi" });
    try {
      await exec.execChmodFile(req.params.domain, relPath, mode);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: "Gagal chmod" }); }
  });

  app.get("/api/sites/:domain/files/download", requireAuth, async (req, res) => {
    const relPath = req.query.path;
    if (!relPath) return res.status(400).json({ error: "Path wajib diisi" });
    try {
      const result = await exec.execReadFile(req.params.domain, relPath);
      const fileName = relPath.split("/").pop() || "file";
      res.setHeader("Content-Disposition", 'attachment; filename="' + fileName + '"');
      res.setHeader("Content-Type", "application/octet-stream");
      res.send(result.stdout);
    } catch (e) { res.status(500).send("Gagal download"); }
  });

  app.post("/api/sites/:domain/files/upload", requireAuth, upload.single("file"), async (req, res) => {
    const site = db.getSite(req.params.domain);
    if (!site) return res.status(404).json({ error: "Site tidak ditemukan" });
    const relPath = req.body.target || ".";
    const file = req.file;
    if (!file) return res.status(400).json({ error: "File wajib dipilih" });
    const fileName = file.originalname;
    const destPath = relPath === "." ? fileName : relPath.replace(/\/+$/, "") + "/" + fileName;
    try {
      const result = await exec.runScript("file-write", [
        "--domain", req.params.domain,
        "--path", destPath,
        "--content-file", file.path,
      ]);
      if (result.code !== 0) return res.status(500).json({ error: result.stderr || "Gagal upload file" });
      try { fs.unlinkSync(file.path); } catch (e) { }
      res.json({ ok: true, file: destPath });
    } catch (e) { res.status(500).json({ error: "Gagal upload file" }); }
  });
};
