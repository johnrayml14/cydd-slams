const db = require('../config/db');
const bcrypt = require('bcryptjs');



// Get Admin Credentials from the database
exports.getAdminCredentials = async (username) => {
    const [rows] = await db.execute(
    "SELECT id, username, password FROM admins WHERE username = ?",
    [username]
    );

    if (rows.length === 0) {
        return null;
    }

    return rows[0]; 
};

// Get list of coaches with their certificates and status
exports.getPendingCoaches = async () => {
    try {
        const [rows] = await db.execute('SELECT * FROM coach WHERE status = "pending"');
        return rows;
    } catch (error) {
        console.error("Error fetching pending coaches:", error);
        throw error;
    }
};

// Update coach status to confirmed or rejected
exports.updateCoachStatus = async (coachId, status) => {
    try {
        const [result] = await db.execute('UPDATE coach SET status = ? WHERE id = ?', [status, coachId]);
        return result;
    } catch (error) {
        console.error("Error updating coach status:", error);
        throw error;
    }
};


// Get all users from the database
exports.getAllUsers = async () => {
    const [rows] = await db.execute(`
        SELECT 
            users.id, 
            users.email, 
            users.created_at,
            team_players.player_name,
            team_players.sports,
            team_players.age,
            team_players.sex,
            team.teamName
        FROM users
        LEFT JOIN team_players ON users.id = team_players.user_id
        LEFT JOIN team ON team_players.team_id = team.id
        ORDER BY users.created_at DESC
    `);
    return rows;
};

