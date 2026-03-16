const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const { runQuery, getQuery, allQuery } = require('./db');

// --- CONFIGURATION ---
// IMPORTANT: Add your admin phone number here with country code, NO '+' sign.
const ADMIN_NUMBER = '919876543210@c.us'; 

// Initialize WhatsApp Client with persistent session
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox'] } // Helps prevent launch errors on some systems
});

// Display QR Code
client.on('qr', (qr) => {
    console.log('Scan the QR code below to log in:');
    qrcode.generate(qr, { small: true });
});

// Client Ready Event
client.on('ready', () => {
    console.log('WhatsApp Bot is ready and connected!');
    startCronJobs();
});

// --- CRON JOBS ---
function startCronJobs() {
    // Fee Reminder System: Runs every day at 9:00 AM
    cron.schedule('0 9 * * *', async () => {
        console.log('Running daily fee reminder check...');
        try {
            // Get date for 3 days from now
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 3);
            const dueStr = futureDate.toISOString().split('T')[0];

            // Find students whose fee is due exactly in 3 days
            const students = await allQuery(`SELECT * FROM students WHERE fee_due_date = ?`, [dueStr]);
            
            for (const student of students) {
                const parentId = `${student.parent_number}@c.us`;
                const message = `*Reminder:* Fee for ${student.name} (Class ${student.class}) is due in 3 days (${student.fee_due_date}).`;
                await client.sendMessage(parentId, message);
                console.log(`Fee reminder sent to ${student.parent_number} for ${student.name}`);
            }
        } catch (error) {
            console.error('Error in cron job:', error);
        }
    });
    console.log('Cron jobs scheduled successfully.');
}

// --- MESSAGE HANDLING ---
client.on('message', async (message) => {
    const text = message.body.toLowerCase().trim();
    const sender = message.from;

    try {
        // ==========================================
        // ADMIN COMMANDS (Only processed if sender matches ADMIN_NUMBER)
        // ==========================================
        if (sender === ADMIN_NUMBER) {
            
            // 1. Attendance Alert: "absent Rahul"
            if (text.startsWith('absent ')) {
                const studentName = text.split(' ')[1];
                const student = await getQuery(`SELECT * FROM students WHERE LOWER(name) = ?`, [studentName.toLowerCase()]);
                
                if (student) {
                    await client.sendMessage(`${student.parent_number}@c.us`, `*Attendance Alert:* Your child ${student.name} was absent today.`);
                    return message.reply(`Absent alert sent to ${student.name}'s parent.`);
                } else {
                    return message.reply(`Student '${studentName}' not found in database.`);
                }
            }

            // 2. Broadcast / Event / Emergency Message: "broadcast [msg]" or "event [msg]" or "emergency [msg]"
            const isBroadcast = text.startsWith('broadcast ') || text.startsWith('event ') || text.startsWith('emergency ');
            if (isBroadcast) {
                const msgBody = message.body.substring(message.body.indexOf(' ') + 1); // Keep original casing
                const prefix = text.split(' ')[0].toUpperCase();
                
                const parents = await allQuery(`SELECT DISTINCT parent_number FROM students`);
                for (const parent of parents) {
                    await client.sendMessage(`${parent.parent_number}@c.us`, `*[${prefix}]*\n${msgBody}`);
                }
                return message.reply(`Broadcast sent to ${parents.length} parents.`);
            }

            // 3. Class Broadcast: "class10 [msg]"
            const classMatch = text.match(/^class(\d+)\s+(.+)/i);
            if (classMatch) {
                const classNum = classMatch[1];
                const msgBody = classMatch[2]; // Original casing
                
                const parents = await allQuery(`SELECT DISTINCT parent_number FROM students WHERE class = ?`, [classNum]);
                for (const parent of parents) {
                    await client.sendMessage(`${parent.parent_number}@c.us`, `*[Class ${classNum} Notice]*\n${msgBody}`);
                }
                return message.reply(`Message sent to Class ${classNum} parents.`);
            }

            // 4. Add Homework: "homework math: read chapter 3"
            const hwMatch = text.match(/^homework\s+(\w+):\s+(.+)/i);
            if (hwMatch) {
                const subject = hwMatch[1].toLowerCase();
                const hwText = hwMatch[2];
                const today = new Date().toISOString().split('T')[0];

                await runQuery(`INSERT INTO homework (subject, text, date) VALUES (?, ?, ?)`, [subject, hwText, today]);
                return message.reply(`Homework for ${subject} saved successfully.`);
            }

            // 5. Add Teacher: "addteacher math 9876543210"
            const teacherMatch = text.match(/^addteacher\s+(\w+)\s+(\d+)/i);
            if (teacherMatch) {
                const subject = teacherMatch[1].toLowerCase();
                const phone = teacherMatch[2];
                
                await runQuery(`INSERT INTO teachers (subject, phone) VALUES (?, ?)`, [subject, phone]);
                return message.reply(`${subject} teacher added successfully.`);
            }
        }

        // ==========================================
        // PUBLIC / STUDENT COMMANDS
        // ==========================================

        // 1. Admission Enquiry
        if (text === 'admission') {
            const reply = `*Welcome to Our School!* 🏫\n\n` +
                          `*Fee Structure:*\n- Class 1-5: $500/yr\n- Class 6-10: $800/yr\n\n` +
                          `*Contact:* +1 234 567 8900\n` +
                          `*Admission Link:* https://schoolwebsite.com/admission`;
            return message.reply(reply);
        }

        // 2. Exam Timetable
        if (text === 'exam') {
            const reply = `*Upcoming Exam Timetable:*\n\n` +
                          `📅 *10 Oct:* Mathematics\n` +
                          `📅 *12 Oct:* Science\n` +
                          `📅 *15 Oct:* English\n` +
                          `Best of luck! 📚`;
            return message.reply(reply);
        }

        // 3. Holidays
        if (text === 'holidays') {
            const holidays = await allQuery(`SELECT * FROM holidays ORDER BY date ASC`);
            if (holidays.length === 0) return message.reply("No holidays scheduled currently.");
            
            let reply = `*Upcoming Holidays:*\n\n`;
            holidays.forEach(h => reply += `🌴 *${h.date}:* ${h.name}\n`);
            return message.reply(reply);
        }

        // 4. Homework Today
        if (text === 'homework today') {
            const today = new Date().toISOString().split('T')[0];
            const homework = await allQuery(`SELECT * FROM homework WHERE date = ?`, [today]);
            
            if (homework.length === 0) return message.reply("No homework assigned for today yet! 🎉");
            
            let reply = `*Homework for Today (${today}):*\n\n`;
            homework.forEach(hw => reply += `📖 *${hw.subject.toUpperCase()}:* ${hw.text}\n`);
            return message.reply(reply);
        }

        // 5. Contact Subject Teacher: "contact math teacher"
        const contactMatch = text.match(/^contact\s+(\w+)\s+teacher/i);
        if (contactMatch) {
            const subject = contactMatch[1].toLowerCase();
            const teacher = await getQuery(`SELECT * FROM teachers WHERE subject = ?`, [subject]);
            
            if (teacher) {
                return message.reply(`*${subject.toUpperCase()} Teacher Contact:*\n📞 ${teacher.phone}`);
            } else {
                return message.reply(`Could not find a contact for the ${subject} teacher.`);
            }
        }

        // 6. Leave Tomorrow
        if (text === 'leave tomorrow') {
            // Notify the admin about the leave request
            await client.sendMessage(ADMIN_NUMBER, `*Leave Request Received:*\nFrom number: +${sender.replace('@c.us', '')}`);
            return message.reply("Your leave request has been sent to the school administration.");
        }

    } catch (error) {
        console.error('Error handling message:', error);
        message.reply("Sorry, I encountered an error while processing your request.");
    }
});

// Initialize the client
client.initialize();
