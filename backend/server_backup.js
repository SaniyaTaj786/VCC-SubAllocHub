const express = require("express");
const mysql = require("mysql2");
const bcrypt = require("bcrypt");
const cors = require("cors");
require("dotenv").config();

console.log("Password loaded:", !!process.env.DB_PASSWORD);

const app = express();

app.use(cors());
app.use(express.json());

// MySQL connection
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: process.env.DB_PASSWORD,
    database: "vcc_faculty_suballoc_hub"
});

// Test MySQL connection
db.connect((err) => {
    if (err) {
        console.error("❌ MySQL connection failed:", err.message);
        return;
    }

    console.log("✅ MySQL connected successfully!");
});

// Test API
app.get("/", (req, res) => {
    res.send("SubAlloc Hub Backend is running!");
});

app.get("/api/users", (req, res) => {
    db.query("SELECT * FROM users", (err, results) => {
        if (err) {
            console.error("Database query error:", err);
            return res.status(500).json({
                error: "Database query failed"
            });
        }

        res.json(results);
    });
});

// Login API
app.post("/api/login", (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: "Username and password are required"
        });
    }

    const sql = `
        SELECT user_id, username, password_hash, role, is_active
        FROM users
        WHERE username = ?
        LIMIT 1
    `;

    db.query(sql, [username], async (err, results) => {
        if (err) {
            console.error("Login database error:", err);
            return res.status(500).json({
                success: false,
                message: "Database error"
            });
        }

        if (results.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password"
            });
        }

        const user = results[0];

        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message: "User account is inactive"
            });
        }

        const passwordMatch = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password"
            });
        }

        res.json({
            success: true,
            message: "Login successful",
            user: {
                user_id: user.user_id,
                username: user.username,
                role: user.role
            }
        });
    });
});

app.get("/test", (req, res) => {
    res.send("TEST ROUTE WORKING");
});

// Admin Dashboard Statistics
app.get("/api/dashboard/stats", (req, res) => {

    const sql = `
        SELECT
            (SELECT COUNT(*) FROM faculty) AS facultyCount,
            (SELECT COUNT(*) FROM subjects) AS subjectCount,
            (SELECT COUNT(*) FROM classes) AS classCount,
            (SELECT COUNT(*) FROM rooms) AS roomCount
    `;

    db.query(sql, (err, results) => {

        if (err) {
            console.error("Dashboard statistics error:", err);

            return res.status(500).json({
                success: false,
                message: "Unable to load dashboard statistics"
            });
        }

        res.json({
            success: true,
            stats: results[0]
        });

    });
});

const PORT = 3000;

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});