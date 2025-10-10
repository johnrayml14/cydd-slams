const db = require('../config/db');
const { getPendingCoachNotifications, getPendingTeamNotifications } = require("../utils/notificationHelper");

// Get schedule main page
exports.getSchedulePage = async (req, res) => {
    if (!req.session.admin) {
        return res.redirect("/admin");
    }

    try {
        const adminId = req.session.admin.id;
        const [adminData] = await db.execute("SELECT * FROM admins WHERE id = ?", [adminId]);
        const admin = adminData[0];

        const [ongoingEvents] = await db.execute(
            "SELECT * FROM events WHERE status = 'ongoing' ORDER BY created_at DESC"
        );

        // Get notification data
        const newCoachRequests = await getPendingCoachNotifications();
        const newTeamRequests = await getPendingTeamNotifications();
        
        res.render('admin/schedule', {
            admin: admin,
            events: ongoingEvents,
            success: req.flash('success'),
            error: req.flash('error'),
            newCoachRequests: newCoachRequests,
            newTeamRequests: newTeamRequests
        });
    } catch (error) {
        console.error('Error loading schedule page:', error);
        req.flash('error', 'Error loading schedule page');
        res.redirect('/admin/home');
    }
};

// Get sports for a specific event - FIXED VERSION
exports.getEventSports = async (req, res) => {
    try {
        const eventId = req.params.eventId;
        
        const [event] = await db.execute(
            "SELECT * FROM events WHERE id = ?", 
            [eventId]
        );
        
        if (event.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }

        const eventData = event[0];
        const sports = [];
        
        console.log('Event data:', eventData); // Debug log
        
        // Parse the actual sports from the event data - IMPROVED PARSING
        if (eventData.sports && eventData.sports !== 'none' && eventData.sports !== '') {
            const sportsList = eventData.sports.split(',').map(sport => sport.trim());
            console.log('Sports list:', sportsList); // Debug log
            
            sportsList.forEach(sport => {
                if (sport && sport !== 'none' && sport !== '') {
                    sports.push({
                        type: 'sports',
                        name: sport
                    });
                }
            });
        }
        
        if (eventData.esports && eventData.esports !== 'none' && eventData.esports !== '') {
            const esportsList = eventData.esports.split(',').map(esport => esport.trim());
            console.log('Esports list:', esportsList); // Debug log
            
            esportsList.forEach(esport => {
                if (esport && esport !== 'none' && esport !== '') {
                    sports.push({
                        type: 'esports',
                        name: esport
                    });
                }
            });
        }
        
        if (eventData.other_activities && eventData.other_activities !== 'none' && eventData.other_activities !== '') {
            const activitiesList = eventData.other_activities.split(',').map(activity => activity.trim());
            console.log('Other activities list:', activitiesList); // Debug log
            
            activitiesList.forEach(activity => {
                if (activity && activity !== 'none' && activity !== '') {
                    sports.push({
                        type: 'other_activities',
                        name: activity
                    });
                }
            });
        }

        console.log('Final sports array:', sports); // Debug log
        res.json({ sports });
    } catch (error) {
        console.error('Error getting event sports:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Get teams for a specific event and sport
exports.getEventTeams = async (req, res) => {
    try {
        const { eventId, sportType } = req.params;
        
        const [teams] = await db.execute(
            `SELECT t.*, c.fullname as coach_name 
             FROM team t 
             LEFT JOIN coach c ON t.coach_id = c.id 
             WHERE t.event_id = ? AND t.status = 'confirmed' 
             ORDER BY t.teamName`,
            [eventId]
        );

        res.json({ teams });
    } catch (error) {
        console.error('Error getting event teams:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Create tournament bracket
exports.createTournamentBracket = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { eventId, sportType, sportName, bracketType, teams } = req.body;

        // Validate bracket type
        const validBracketTypes = ['single_elimination', 'round_robin'];
        if (!validBracketTypes.includes(bracketType)) {
            return res.status(400).json({ error: 'Invalid bracket type' });
        }

        // Validate minimum teams
        if (teams.length < 2) {
            return res.status(400).json({ error: 'At least 2 teams are required' });
        }

        // Create tournament bracket with sport name
        const [bracketResult] = await connection.execute(
            "INSERT INTO tournament_brackets (event_id, sport_type, bracket_type) VALUES (?, ?, ?)",
            [eventId, sportName, bracketType]
        );

        const bracketId = bracketResult.insertId;

        // Initialize tournament progress
        await connection.execute(
            "INSERT INTO tournament_progress (bracket_id, current_round, total_rounds) VALUES (?, 1, ?)",
            [bracketId, bracketType === 'round_robin' ? teams.length - 1 : Math.ceil(Math.log2(teams.length))]
        );

        // Generate matches based on bracket type
        if (bracketType === 'single_elimination') {
            await generateSingleEliminationMatches(connection, bracketId, teams, 1);
        } else if (bracketType === 'round_robin') {
            await generateRoundRobinMatches(connection, bracketId, teams);
        }

        await connection.commit();
        
        req.flash('success', 'Tournament bracket created successfully!');
        res.json({ success: true, bracketId });
    } catch (error) {
        await connection.rollback();
        console.error('Error creating tournament bracket:', error);
        res.status(500).json({ error: 'Error creating tournament bracket: ' + error.message });
    } finally {
        connection.release();
    }
};

// Generate single elimination matches
async function generateSingleEliminationMatches(connection, bracketId, teams, roundNumber) {
    console.log(`Generating single elimination matches for ${teams.length} teams in round ${roundNumber}`);
    
    // If this is the first round, shuffle teams and create initial matches
    if (roundNumber === 1) {
        const shuffledTeams = [...teams].sort(() => Math.random() - 0.5);
        let matchNumber = 1;
        
        console.log('Shuffled teams:', shuffledTeams);
        
        // Handle odd number of teams by giving one team a bye in the first round
        for (let i = 0; i < shuffledTeams.length; i += 2) {
            if (i + 1 < shuffledTeams.length) {
                // Normal match between two teams
                await connection.execute(
                    `INSERT INTO matches (bracket_id, round_number, match_number, team1_id, team2_id, status) 
                     VALUES (?, ?, ?, ?, ?, 'scheduled')`,
                    [bracketId, roundNumber, matchNumber, shuffledTeams[i], shuffledTeams[i + 1]]
                );
                console.log(`Created match ${matchNumber}: ${shuffledTeams[i]} vs ${shuffledTeams[i + 1]}`);
            } else {
                // Handle odd number of teams - team automatically advances to next round
                // Create a special match record for the bye
                await connection.execute(
                    `INSERT INTO matches (bracket_id, round_number, match_number, team1_id, team2_id, winner_team_id, status) 
                     VALUES (?, ?, ?, ?, NULL, ?, 'completed')`,
                    [bracketId, roundNumber, matchNumber, shuffledTeams[i], shuffledTeams[i]]
                );
                console.log(`Created bye for team ${shuffledTeams[i]} - automatically advances`);
            }
            matchNumber++;
        }
    } else {
        // For subsequent rounds, this will be handled by generateNextRound
        console.log(`Subsequent round ${roundNumber} will be generated when previous round completes`);
    }
}

// Generate round robin matches - TRADITIONAL VERSION (All matches in Round 1)
async function generateRoundRobinMatches(connection, bracketId, teams) {
    console.log(`Generating traditional round robin matches for ${teams.length} teams`);
    
    if (teams.length < 2) {
        throw new Error('Round robin requires at least 2 teams');
    }

    let matchNumber = 1;
    
    // Generate all possible unique pairings
    for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
            await connection.execute(
                `INSERT INTO matches (bracket_id, round_number, match_number, team1_id, team2_id, status) 
                 VALUES (?, 1, ?, ?, ?, 'scheduled')`,
                [bracketId, matchNumber, teams[i], teams[j]]
            );
            console.log(`Round 1, Match ${matchNumber}: ${teams[i]} vs ${teams[j]}`);
            matchNumber++;
        }
    }
    
    console.log(`Traditional round robin complete: ${matchNumber - 1} matches created in Round 1`);
    
    // For round robin, set total rounds to 1 since all matches are in the first round
    await connection.execute(
        "UPDATE tournament_progress SET total_rounds = 1 WHERE bracket_id = ?",
        [bracketId]
    );
}

// Get matches for a bracket
exports.getBracketMatches = async (req, res) => {
    try {
        const { bracketId } = req.params;
        
        const [matches] = await db.execute(
            `SELECT m.*, t1.teamName as team1_name, t2.teamName as team2_name, 
                    winner.teamName as winner_name
             FROM matches m
             LEFT JOIN team t1 ON m.team1_id = t1.id
             LEFT JOIN team t2 ON m.team2_id = t2.id
             LEFT JOIN team winner ON m.winner_team_id = winner.id
             WHERE m.bracket_id = ?
             ORDER BY m.round_number, m.match_number`,
            [bracketId]
        );

        const [bracket] = await db.execute(
            `SELECT tb.*, e.title as event_name, tp.current_round, tp.is_completed, tp.total_rounds
             FROM tournament_brackets tb
             LEFT JOIN events e ON tb.event_id = e.id
             LEFT JOIN tournament_progress tp ON tb.id = tp.bracket_id
             WHERE tb.id = ?`,
            [bracketId]
        );

        res.json({ matches, bracket: bracket[0] });
    } catch (error) {
        console.error('Error getting bracket matches:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Update match schedule
exports.updateMatchSchedule = async (req, res) => {
    try {
        const { matchId } = req.params;
        const { matchDate, venue } = req.body;

        await db.execute(
            "UPDATE matches SET match_date = ?, venue = ? WHERE id = ?",
            [matchDate, venue, matchId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating match schedule:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Update match result
exports.updateMatchResult = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { matchId } = req.params;
        const { team1Score, team2Score, winnerTeamId } = req.body;

        console.log(`Updating match ${matchId} result: ${team1Score}-${team2Score}, winner: ${winnerTeamId}`);

        // Update match result
        await connection.execute(
            "UPDATE matches SET team1_score = ?, team2_score = ?, winner_team_id = ?, status = 'completed' WHERE id = ?",
            [team1Score, team2Score, winnerTeamId, matchId]
        );

        // Get match details
        const [match] = await connection.execute(
            "SELECT * FROM matches WHERE id = ?",
            [matchId]
        );

        const matchData = match[0];
        console.log(`Match details: bracket ${matchData.bracket_id}, round ${matchData.round_number}`);
        
        // Check bracket type
        const [bracketInfo] = await connection.execute(
            "SELECT bracket_type FROM tournament_brackets WHERE id = ?",
            [matchData.bracket_id]
        );
        
        const bracketType = bracketInfo[0].bracket_type;

        if (bracketType === 'single_elimination') {
            await handleSingleEliminationRoundCompletion(connection, matchData);
        } else if (bracketType === 'round_robin') {
            await handleRoundRobinRoundCompletion(connection, matchData);
        }

        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        console.error('Error updating match result:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        connection.release();
    }
};

// Handle single elimination round completion
async function handleSingleEliminationRoundCompletion(connection, matchData) {
    // Check if all matches in current round are completed
    const [currentRoundMatches] = await connection.execute(
        "SELECT COUNT(*) as total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed FROM matches WHERE bracket_id = ? AND round_number = ?",
        [matchData.bracket_id, matchData.round_number]
    );

    const { total, completed } = currentRoundMatches[0];
    console.log(`Round ${matchData.round_number} progress: ${completed}/${total} matches completed`);

    if (total === completed && total > 0) {
        console.log(`All matches in round ${matchData.round_number} completed, generating next round`);
        await generateNextRoundSingleElimination(connection, matchData.bracket_id, matchData.round_number);
    }
}

// Handle round robin round completion  
async function handleRoundRobinRoundCompletion(connection, matchData) {
    // For round robin, check if all matches are completed
    const [allMatches] = await connection.execute(
        "SELECT COUNT(*) as total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed FROM matches WHERE bracket_id = ?",
        [matchData.bracket_id]
    );

    const { total, completed } = allMatches[0];
    console.log(`Round robin overall progress: ${completed}/${total} matches completed`);

    if (total === completed && total > 0) {
        // All matches completed - determine champion
        console.log(`🎉 ROUND ROBIN TOURNAMENT COMPLETE! All matches played.`);
        await determineRoundRobinChampion(connection, matchData.bracket_id);
        await connection.execute(
            "UPDATE tournament_progress SET is_completed = TRUE WHERE bracket_id = ?",
            [matchData.bracket_id]
        );
    }
}

// Generate next round for single elimination
async function generateNextRoundSingleElimination(connection, bracketId, currentRound) {
    console.log(`Generating next round for single elimination bracket ${bracketId}, current round: ${currentRound}`);
    
    // Get winners from current round (including byes)
    const [winners] = await connection.execute(
        "SELECT winner_team_id FROM matches WHERE bracket_id = ? AND round_number = ? AND winner_team_id IS NOT NULL",
        [bracketId, currentRound]
    );

    const winnerTeams = winners.map(w => w.winner_team_id);
    console.log(`Winners from round ${currentRound}:`, winnerTeams);
    
    if (winnerTeams.length > 1) {
        const nextRound = currentRound + 1;
        
        // Update tournament progress
        await connection.execute(
            "UPDATE tournament_progress SET current_round = ? WHERE bracket_id = ?",
            [nextRound, bracketId]
        );

        console.log(`Generating round ${nextRound} with ${winnerTeams.length} winners`);
        
        // Generate next round matches
        let matchNumber = 1;
        for (let i = 0; i < winnerTeams.length; i += 2) {
            if (i + 1 < winnerTeams.length) {
                console.log(`Creating match ${matchNumber}: ${winnerTeams[i]} vs ${winnerTeams[i + 1]}`);
                
                await connection.execute(
                    `INSERT INTO matches (bracket_id, round_number, match_number, team1_id, team2_id, status) 
                     VALUES (?, ?, ?, ?, ?, 'scheduled')`,
                    [bracketId, nextRound, matchNumber, winnerTeams[i], winnerTeams[i + 1]]
                );
                matchNumber++;
            } else {
                // Handle odd number of winners (bye) - team automatically advances
                console.log(`Odd number of winners, giving bye to team ${winnerTeams[i]}`);
                
                // Create a completed match record for the bye
                await connection.execute(
                    `INSERT INTO matches (bracket_id, round_number, match_number, team1_id, team2_id, winner_team_id, status) 
                     VALUES (?, ?, ?, ?, NULL, ?, 'completed')`,
                    [bracketId, nextRound, matchNumber, winnerTeams[i], winnerTeams[i]]
                );
                matchNumber++;
            }
        }
    } else if (winnerTeams.length === 1) {
        // Only one winner left - this is the champion
        console.log(`🎉 SINGLE ELIMINATION TOURNAMENT COMPLETE! Champion: ${winnerTeams[0]}`);
        
        await connection.execute(
            "UPDATE tournament_progress SET champion_team_id = ?, is_completed = TRUE WHERE bracket_id = ?",
            [winnerTeams[0], bracketId]
        );
    } else {
        console.log('No winners found for this round');
    }
}

// Calculate team statistics for round robin
async function calculateTeamStats(connection, bracketId) {
    const [matches] = await connection.execute(
        `SELECT m.*, t1.teamName as team1_name, t2.teamName as team2_name
         FROM matches m
         LEFT JOIN team t1 ON m.team1_id = t1.id
         LEFT JOIN team t2 ON m.team2_id = t2.id
         WHERE m.bracket_id = ? AND m.status = 'completed'`,
        [bracketId]
    );
    
    const teamStats = {};
    
    // Initialize all teams with zero stats
    const [allTeams] = await connection.execute(
        `SELECT DISTINCT team1_id as team_id FROM matches WHERE bracket_id = ? AND team1_id IS NOT NULL
         UNION 
         SELECT DISTINCT team2_id as team_id FROM matches WHERE bracket_id = ? AND team2_id IS NOT NULL`,
        [bracketId, bracketId]
    );
    
    allTeams.forEach(team => {
        teamStats[team.team_id] = {
            teamId: team.team_id,
            teamName: 'Unknown Team',
            wins: 0,
            points: 0,
            matchesPlayed: 0
        };
    });
    
    // Calculate stats from completed matches
    matches.forEach(match => {
        if (!match.winner_team_id) return;
        
        // Update team names from match data
        if (match.team1_id && teamStats[match.team1_id]) {
            teamStats[match.team1_id].teamName = match.team1_name;
        }
        if (match.team2_id && teamStats[match.team2_id]) {
            teamStats[match.team2_id].teamName = match.team2_name;
        }
        
        // Count matches played
        if (match.team1_id) teamStats[match.team1_id].matchesPlayed++;
        if (match.team2_id) teamStats[match.team2_id].matchesPlayed++;
        
        // Award points (3 for win, 1 for draw, 0 for loss)
        if (match.winner_team_id === match.team1_id) {
            teamStats[match.team1_id].wins += 1;
            teamStats[match.team1_id].points += 3;
        } else if (match.winner_team_id === match.team2_id) {
            teamStats[match.team2_id].wins += 1;
            teamStats[match.team2_id].points += 3;
        } else {
            // Draw (if you implement draws)
            teamStats[match.team1_id].points += 1;
            teamStats[match.team2_id].points += 1;
        }
    });
    
    return teamStats;
}

// Determine round robin champion based on points
async function determineRoundRobinChampion(connection, bracketId) {
    console.log(`Determining round robin champion for bracket ${bracketId}`);
    
    const teamStats = await calculateTeamStats(connection, bracketId);
    
    // Convert to array and sort by points
    const standings = Object.values(teamStats).sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return b.wins - a.wins; // Tiebreaker: more wins
    });
    
    console.log('Round robin standings:', standings);
    
    if (standings.length > 0) {
        const champion = standings[0];
        console.log(`🎉 ROUND ROBIN CHAMPION: ${champion.teamName} with ${champion.points} points`);
        
        await connection.execute(
            "UPDATE tournament_progress SET champion_team_id = ?, is_completed = TRUE WHERE bracket_id = ?",
            [champion.teamId, bracketId]
        );
    } else {
        console.log("No champion could be determined - no completed matches found");
    }
}

// Manual next round generation (for testing)
exports.generateNextRoundManual = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { bracketId, currentRound } = req.body;

        // Get bracket type
        const [bracketInfo] = await connection.execute(
            "SELECT bracket_type FROM tournament_brackets WHERE id = ?",
            [bracketId]
        );
        
        const bracketType = bracketInfo[0].bracket_type;

        if (bracketType === 'single_elimination') {
            await generateNextRoundSingleElimination(connection, bracketId, currentRound);
        } else if (bracketType === 'round_robin') {
            // For round robin, there are no next rounds - all matches are in round 1
            console.log('Round robin: All matches are already created in Round 1');
        }

        await connection.commit();
        res.json({ success: true, message: 'Operation completed' });
    } catch (error) {
        await connection.rollback();
        console.error('Error generating next round:', error);
        res.status(500).json({ error: 'Error generating next round: ' + error.message });
    } finally {
        connection.release();
    }
};

// Get all brackets for an event
exports.getEventBrackets = async (req, res) => {
    try {
        const { eventId } = req.params;
        
        const [brackets] = await db.execute(
            `SELECT tb.*, tp.current_round, tp.is_completed, t.teamName as champion_name
             FROM tournament_brackets tb
             LEFT JOIN tournament_progress tp ON tb.id = tp.bracket_id
             LEFT JOIN team t ON tp.champion_team_id = t.id
             WHERE tb.event_id = ?
             ORDER BY tb.created_at DESC`,
            [eventId]
        );

        res.json({ brackets });
    } catch (error) {
        console.error('Error getting event brackets:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Manual champion setting (for debugging)
exports.setChampionManually = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { bracketId } = req.body;

        console.log(`Manually setting champion for bracket ${bracketId}`);

        // Get bracket type
        const [bracketInfo] = await connection.execute(
            "SELECT bracket_type FROM tournament_brackets WHERE id = ?",
            [bracketId]
        );
        
        const bracketType = bracketInfo[0].bracket_type;

        if (bracketType === 'single_elimination') {
            // Find the match in the highest round with a winner
            const [highestRoundMatches] = await connection.execute(
                "SELECT * FROM matches WHERE bracket_id = ? AND round_number = (SELECT MAX(round_number) FROM matches WHERE bracket_id = ?) AND winner_team_id IS NOT NULL",
                [bracketId, bracketId]
            );
            
            if (highestRoundMatches.length === 1) {
                const finalWinner = highestRoundMatches[0].winner_team_id;
                console.log(`🎉 Setting champion: ${finalWinner}`);
                
                await connection.execute(
                    "UPDATE tournament_progress SET champion_team_id = ?, is_completed = TRUE WHERE bracket_id = ?",
                    [finalWinner, bracketId]
                );
            }
        } else if (bracketType === 'round_robin') {
            // For round robin, determine champion based on points
            await determineRoundRobinChampion(connection, bracketId);
            await connection.execute(
                "UPDATE tournament_progress SET is_completed = TRUE WHERE bracket_id = ?",
                [bracketId]
            );
        }

        await connection.commit();
        res.json({ success: true, message: 'Champion set successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Error setting champion:', error);
        res.status(500).json({ error: 'Error setting champion' });
    } finally {
        connection.release();
    }

};
