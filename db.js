const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to SQLite Database
const dbPath = path.resolve(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

// Initialize tables and mock data
db.serialize(() => {
    // Create Tables
    db.run(`CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, class TEXT, parent_number TEXT, fee_due_date TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS teachers (subject TEXT, phone TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS homework (subject TEXT, text TEXT, date TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS holidays (date TEXT, name TEXT)`);

    // Insert Example Data for Testing (Only if students table is empty)
    db.get("SELECT COUNT(*) as count FROM students", (err, row) => {
        if (row && row.count === 0) {
            console.log("Inserting example data into database...");
            
            // Calculate a date exactly 3 days from today for the cron job test
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 3);
            const dueStr = futureDate.toISOString().split('T')[0];

            db.run(`INSERT INTO students (name, class, parent_number, fee_due_date) VALUES ('Rahul', '8', '919876543210', '${dueStr}')`);
            db.run(`INSERT INTO students (name, class, parent_number, fee_due_date) VALUES ('Priya', '10', '918765432109', '2026-12-01')`);
            
            db.run(`INSERT INTO teachers (subject, phone) VALUES ('math', '919998887776')`);
            db.run(`INSERT INTO holidays (date, name) VALUES ('2026-08-15', 'Independence Day')`);
            db.run(`INSERT INTO holidays (date, name) VALUES ('2026-10-02', 'Gandhi Jayanti')`);
            db.run(`INSERT INTO homework (subject, text, date) VALUES ('science', 'Read Chapter 4', '${new Date().toISOString().split('T')[0]}')`);
        }
    });
});

// Promise wrappers for database queries to use async/await in index.js
const runQuery = (query, params = []) => new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
        if (err) reject(err);
        else resolve(this);
    });
});

const getQuery = (query, params = []) => new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
    });
});

const allQuery = (query, params = []) => new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
    });
});

module.exports = { runQuery, getQuery, allQuery };
