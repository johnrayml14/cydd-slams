const db = require('../config/db');

//notif for pending coach
exports.getPendingCoachNotifications = async () => {
    const [pendingCoaches] = await db.execute("SELECT * FROM coach WHERE status = 'pending'");
    return pendingCoaches;
};

//notif for pending team request
exports.getPendingTeamNotifications = async () => {
    const [pendingTeams] = await db.execute("SELECT * FROM team WHERE status = 'pending'");
    return pendingTeams;
};

// Get coach account status notification
exports.getCoachStatusNotification = async (coachId) => {
    const [result] = await db.execute("SELECT status, notification_viewed FROM coach WHERE id = ?", [coachId]);
    if (result.length === 0) return null;

    const coach = result[0];

    if (coach.status === 'confirmed' && !coach.notification_viewed) {
        return {
            type: 'success',
            message: 'Your account is now registered as Coordinator.',
            viewed: false
        };
    } else if (coach.status === 'rejected' && !coach.notification_viewed) {
        return {
            type: 'error',
            message: 'Your account has been rejected.',
            viewed: false
        };
    }

    return null;
};

//notification for player wants to join a team
exports.getPlayerJoinNotifications = async (coachId) => {
    const [players] = await db.execute(
        `SELECT tp.player_name
         FROM team_players tp
         JOIN team t ON tp.team_id = t.id
         WHERE t.coach_id = ? AND tp.status = 'pending'`,
        [coachId]
    );

    return players.map(player => ({
        type: 'info',
        message: `${player.player_name} wants to join your team!`,
        link: '/coach/my-team',
        viewed: false
    }));
};

// Get notifications for coach to know if his/her team is accepted by admin
exports.getTeamStatusNotifications = async (coachId) => {
    const [teams] = await db.execute(
        `SELECT id, teamName, status, notification_viewed 
         FROM team 
         WHERE coach_id = ? 
         AND (status = 'confirmed' OR status = 'rejected') 
         AND notification_viewed = 0`,
        [coachId]
    );

    return teams.map(team => {
        const isConfirmed = team.status === 'confirmed';
        return {
            type: isConfirmed ? 'success' : 'error',
            message: isConfirmed 
                ? `Your team "${team.teamName}" is now registered!` 
                : `Your team "${team.teamName}" has been rejected.`,
            link: isConfirmed ? '/coach/my-team' : '',
            viewed: false
        };
    });
};

//get notif for cooach if city youth has new post
exports.getLatestCoachPostNotification = async () => {
    const [posts] = await db.execute(`
        SELECT id, caption, coach_notifViewed 
        FROM posts 
        WHERE coach_notifViewed = 0
        ORDER BY created_at DESC 
        LIMIT 1
    `);

    if (posts.length > 0) {
        return [{
            type: 'info',
            message: 'City Youth has new Post!',
            link: `/coach/posts/mark-viewed/${posts[0].id}`,
            viewed: false
        }];
    }

    return [];
};



// New: Get latest admin post notification
exports.getLatestPostNotification = async () => {
    const [posts] = await db.execute(
        `SELECT id, caption, created_at 
         FROM posts 
         WHERE notification_viewed = 0
         ORDER BY created_at DESC 
         LIMIT 1`
    );

    if (posts.length > 0) {
        return [{
            type: 'info',
            message: 'The City Youth has new post!',
            link: `/posts/mark-viewed/${posts[0].id}`, 
            viewed: false
        }];
    }

    return [];
};


exports.getTeamStatusNotification = async (userId) => {
    console.log(`Checking team notifications for user ${userId}...`);
    
    const [teamPlayers] = await db.execute(`
        SELECT tp.team_id, t.teamName, tp.status, tp.notification_viewed 
        FROM team_players tp
        JOIN team t ON tp.team_id = t.id
        WHERE tp.user_id = ? 
        AND tp.status IN ('confirmed', 'rejected')
        AND tp.notification_viewed = 0  
        ORDER BY tp.updated_at DESC 
        LIMIT 1
    `, [userId]);

    console.log('Team notifications query results:', teamPlayers);

    if (teamPlayers.length > 0) {
        const record = teamPlayers[0];
        const message = record.status === 'confirmed'
            ? `You are accepted to ${record.teamName}`
            : `You are rejected to join ${record.teamName}`;

        return [{
            message: message,
            link: `/team/mark-viewed/${record.team_id}`,
        }];
    }
    return [];
};

