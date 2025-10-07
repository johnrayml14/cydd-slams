const db = require('../config/db');
const bcrypt = require('bcryptjs');

// Function to find a user by email
exports.findByEmail = async (email) => {
    try {
        const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        return rows[0] || null;
    } catch (error) {
        console.error('Error finding user by email:', error);
        throw error;
    }
};

// Function to find a user by google_id
exports.findByGoogleId = async (google_id) => {
    try {
        const [rows] = await db.execute('SELECT * FROM users WHERE google_id = ?', [google_id]);
        return rows[0] || null;
    } catch (error) {
        console.error('Error finding user by google_id:', error);
        throw error;
    }
};

// Function to create a new user (updated with terms fields)
exports.createUser = async (userData) => {
    try {
        const { email, password = null, google_id = null, profile = null } = userData;
        const created_at = new Date();
        const updated_at = new Date();

        const [result] = await db.execute(
            'INSERT INTO users (email, password, google_id, profile, created_at, updated_at, terms_accepted, terms_accepted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [email, password, google_id, profile, created_at, updated_at, false, null]
        );

        const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [result.insertId]);
        return rows[0];
    } catch (error) {
        console.error("Error in createUser:", error);
        throw error;
    }
};

// Function to update user with Google ID
exports.updateUserWithGoogleId = async (userId, googleId) => {
    try {
        await db.execute(
            'UPDATE users SET google_id = ?, updated_at = ? WHERE id = ?',
            [googleId, new Date(), userId]
        );
        return true;
    } catch (error) {
        console.error("Error updating user with Google ID:", error);
        throw error;
    }
};

// NEW: Function to accept terms
exports.acceptTerms = async (userId) => {
    try {
        await db.execute(
            'UPDATE users SET terms_accepted = ?, terms_accepted_at = ?, updated_at = ? WHERE id = ?',
            [true, new Date(), new Date(), userId]
        );
        return true;
    } catch (error) {
        console.error("Error accepting terms:", error);
        throw error;
    }
};

// Function to compare passwords during login
exports.comparePassword = async (user, password) => {
    try {
        if (!user || !user.password) {
            throw new Error("User or password not found");
        }
        return await bcrypt.compare(password, user.password);
    } catch (error) {
        console.error("Error in comparePassword:", error);
        throw error;
    }
};