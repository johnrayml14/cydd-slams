const db = require('../config/db');
const bcrypt = require('bcryptjs');

// Function to find a coach by email
exports.findCoachByEmail = async (email) => {
    try {
        const [rows] = await db.execute('SELECT * FROM coach WHERE email = ?', [email]);
        return rows[0]; 
    } catch (error) {
        throw error;
    }
};



// Function to find a coach by ID 
exports.findCoachById = async (id) => {
    try {
        const [rows] = await db.execute('SELECT * FROM coach WHERE id = ?', [id]);
        return rows[0]; 
    } catch (error) {
        throw error;
    }
};

//Function to create Coach account
exports.createCoach = async (coachData) => {
    try {
        const { fullname, email, phone, password, coachCertificate } = coachData;

        console.log("Inserting coach with the following data:");
        console.log("fullname:", fullname);
        console.log("email:", email);
        console.log("phone:", phone);
        console.log("password:", password);
        console.log("coach_certificate:", coachCertificate);

        const certificatePath = coachCertificate || null;

        const [result] = await db.execute(
            'INSERT INTO coach (fullname, email, phone, password, coach_certificate) VALUES (?, ?, ?, ?, ?)', 
            [fullname, email, phone, password, certificatePath]
        );

        return result; 
    } catch (error) {
        console.error("Database Error:", error);
        throw error; 
    }
};


//check if email is exists
exports.checkEmailExists = async (email) => {
    try {
        const [rows] = await db.execute('SELECT * FROM coach WHERE email = ?', [email]);
        return rows.length > 0; 
    } catch (error) {
        throw error;
    }
};

// Function to get a coach's status by ID
exports.getCoachStatusById = async (id) => {
    try {
        const [rows] = await db.execute('SELECT status FROM coach WHERE id = ?', [id]);
        return rows[0] ? rows[0].status : null;
    } catch (error) {
        throw error;
    }
};


// Update coach profile picture
exports.updateCoachProfile = async (id, profilePath) => {
    await db.execute(
        'UPDATE coach SET coachProfile = ?, updated_at = NOW() WHERE id = ?',
        [profilePath, id]
    );
};