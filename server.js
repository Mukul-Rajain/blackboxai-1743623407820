const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 8000;

// Configure middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Configure file upload storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        if (path.extname(file.originalname) !== '.pdf') {
            return cb(new Error('Only PDF files are allowed'));
        }
        cb(null, true);
    }
});

// Initialize SQLite database
const db = new sqlite3.Database('dissertations.db', (err) => {
    if (err) {
        console.error('Database connection error:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initializeDatabase();
    }
});

// Create tables if they don't exist
function initializeDatabase() {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT CHECK(role IN ('student', 'faculty', 'admin')) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            abstract TEXT,
            file_path TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            submission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES users(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS evaluations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            submission_id INTEGER NOT NULL,
            faculty_id INTEGER NOT NULL,
            score INTEGER,
            comments TEXT,
            evaluation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (submission_id) REFERENCES submissions(id),
            FOREIGN KEY (faculty_id) REFERENCES users(id)
        )
    `);
}

// API Routes
app.post('/api/upload', upload.single('dissertation'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    res.json({
        message: 'File uploaded successfully',
        filePath: req.file.path,
        fileName: req.file.originalname
    });
});

app.post('/api/submit', (req, res) => {
    const { studentId, title, abstract, filePath } = req.body;

    db.run(
        `INSERT INTO submissions (student_id, title, abstract, file_path) VALUES (?, ?, ?, ?)`,
        [studentId, title, abstract, filePath],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({
                message: 'Submission created successfully',
                submissionId: this.lastID
            });
        }
    );
});

app.get('/api/submissions/:studentId', (req, res) => {
    const { studentId } = req.params;

    db.all(
        `SELECT * FROM submissions WHERE student_id = ? ORDER BY submission_date DESC`,
        [studentId],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json(rows);
        }
    );
});

app.get('/api/evaluations/:submissionId', (req, res) => {
    const { submissionId } = req.params;

    db.all(
        `SELECT e.*, u.name as faculty_name 
         FROM evaluations e
         JOIN users u ON e.faculty_id = u.id
         WHERE e.submission_id = ?`,
        [submissionId],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json(rows);
        }
    );
});

// Serve frontend files
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Error handling
process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err);
    process.exit(1);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    process.exit(1);
});