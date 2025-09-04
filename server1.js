// server.js
import express from "express";
import 'dotenv/config'; // automatically loads .env

import multer from "multer";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { neon } from "@neondatabase/serverless";

// Setup __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Neon database
const db = neon(process.env.DATABASE_URL);

const app = express();
app.use(cors());
app.use(express.json());

// File upload path
const uploadPath = path.join(__dirname, "files");
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`),
});

const upload = multer({ storage });

// Upload endpoint
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const { filename, path: filepath, size } = req.file;
    const description = req.body.description || "";

    await db.query(
      `INSERT INTO uploads (filename, filepath, size, description) VALUES ($1, $2, $3, $4)`,
      [filename, filepath, size, description]
    );

    res.json({ filename, filepath, size, description });
  } catch (err) {
    console.error("DB Insert Error:", err);
    res.status(500).json({ error: "Database insert failed" });
  }
});

// Get all files
app.get("/db-files", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT filename, filepath, size, description FROM uploads ORDER BY id DESC"
    );
    res.json(result);
  } catch (err) {
    console.error("DB Fetch Error:", err);
    res.status(500).json({ error: "Failed to fetch files from DB" });
  }
});

// Delete a file
app.delete("/delete/:dfilename", async (req, res) => {
  const { dfilename } = req.params;
  const dfilepath = path.join(uploadPath, dfilename);

  try {
    await db.query(`DELETE FROM uploads WHERE filename = $1`, [dfilename]);

    if (fs.existsSync(dfilepath)) {
      fs.unlinkSync(dfilepath);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("DB Delete Error:", err);
    res.status(500).json({ error: "Failed to delete file from DB" });
  }
});

// Update filename & description
app.put("/update/:oldName/:newName/:description", async (req, res) => {
  const { oldName, newName, description } = req.params;
  const oldPath = path.join(uploadPath, oldName);
  const fileExt = path.extname(oldName);
  const finalName = newName + fileExt;
  const newPath = path.join(uploadPath, finalName);

  try {
    if (!fs.existsSync(oldPath)) {
      return res.status(404).json({ error: "File not found on disk" });
    }

    fs.renameSync(oldPath, newPath);

    await db.query(
      `UPDATE uploads SET filename=$1, filepath=$2, description=$3 WHERE filename=$4`,
      [finalName, newPath, description, oldName]
    );

    res.json({ success: true, filename: finalName, description });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ error: "Failed to update file" });
  }
});

// Serve static files
app.use("/files", express.static(uploadPath));

// Start server
const PORT = process.env.PORT || 2000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
