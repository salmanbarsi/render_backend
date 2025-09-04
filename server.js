const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs')
const {Client} = require('pg')

let db = new Client({
    host: "localhost",
    user: "postgres",
    port: 5432,
    password: "2020",
    database: "upload"
})

db.connect()
const app = express();
app.use(cors());
app.use(express.json());

const uploadPath = path.join(__dirname, 'files');
console.log(uploadPath)

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}`+"_"+`${file.originalname}`);
  }
});

const upload = multer({ storage: storage });
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const { filename, path: filepath, size } = req.file;
    const description = req.body.description; 

    await db.query(`INSERT INTO uploads (filename, filepath, size, description) VALUES ('${filename}', '${filepath}', ${size}, '${description}')`);
    res.json({filename, filepath, size, description});
  } 
  catch (err) {
    console.error("DB Insert Error:", err);
    res.status(500).json({ error: "Database insert failed" });
  }
});


app.get("/db-files", async (req, res) => {
  try {
    const result = await db.query("SELECT filename, filepath, size, description FROM uploads ORDER BY id DESC");
    res.json(result.rows);
  } 
  catch (err) {
    console.error("DB Fetch Error:", err);
    res.status(500).json({ error: "Failed to fetch files from DB" });
  }
});

app.delete("/delete/:dfilename", async (req, res) => {
  const {dfilename} = req.params
  const dfilepath = path.join(uploadPath, dfilename)
  try {
    await db.query(`DELETE FROM uploads WHERE filename = '${dfilename}'`);

    if (fs.existsSync(dfilepath)) {
      fs.unlinkSync(dfilepath);
    }
  } 
  catch (err) {
    console.error("DB Delete Error:", err);
    res.status(500).json({ error: "Failed to delete file from DB" });
  }
})

app.put("/update/:oldName/:newName/:description", async (req, res) => {
  const { oldName, newName, description } = req.params;
  const oldPath = path.join(uploadPath, oldName);
  const fileExt = path.extname(oldName);
  const finalName = newName + fileExt;
  const newPath = path.join(uploadPath, finalName);

  try {
    if (fs.existsSync(oldPath)) {
      fs.renameSync(oldPath, newPath);
    } 
    else {
      return res.status(404).json({ error: "File not found on disk" });
    }

    await db.query(`UPDATE uploads SET filename='${finalName}', filepath='${newPath}', description='${description}' WHERE filename='${oldName}'`);

    res.json({ success: true, filename: finalName, description });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ error: "Failed to update file" });
  }
});



app.use("/files", express.static(uploadPath));
app.listen(2000, () => {
  console.log("Server Starting on http://localhost:2000");
});
