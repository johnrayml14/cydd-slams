const express = require('express');
const flash = require('connect-flash');
const bcrypt = require('bcryptjs');
const User = require('../models/userModel');
const { validationResult } = require('express-validator');
const db = require('../config/db'); 
const { PSAUpload, waiverUpload, medCertUpload  } = require('../config/multerConfig');
const { getLatestPostNotification,getTeamStatusNotification } = require('../utils/notificationHelper');
const fs = require('fs');
const path = require('path');






// Signup page
exports.signupPage = (req, res) => {
    const successMessage = req.flash('success');
    const errorMessage = req.flash('error');
    res.render('user/signup', {
        messages: {
            success: successMessage,
            error: errorMessage,
        },
        oldEmail: req.body.email || '' 
    });
};

//Handle Signup
exports.handleSignup = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        req.flash('error', 'There were errors with your form submission.');
        return res.render('user/signup', {
            messages: {
                errors: errors.array(),
                email: req.body.email
            }
        });
    }

    const { email, password } = req.body;
    const trimmedPassword = password.trim();  
    console.log('Raw password during signup:', trimmedPassword); 

    try {
        const existingUser = await User.findByEmail(email);
        if (existingUser) {
            req.flash('error', 'Email already in use');
            return res.render('user/signup', {
                messages: {
                    error: 'Email already in use',
                    email: req.body.email
                }
            });
        }

        // Hash the trimmed password
        const hashedPassword = await bcrypt.hash(trimmedPassword, 12);
        console.log("Hashed Password during Signup: ", hashedPassword); 

        const newUser = {
            email,
            password: hashedPassword,
            created_at: new Date(),
            updated_at: new Date()
        };

        // Create the new user in the database
        const user = await User.createUser(newUser);

        req.user = {
            email: user.email,
            id: user.id
        };

        req.flash('success', 'Account created successfully! Please log in.');

        // Redirect to login page with email as query parameter
        res.redirect(`/login?email=${newUser.email}`);
    } catch (error) {
        console.error(error);
        req.flash('error', 'An error occurred. Please try again later.');
        res.redirect('/signup');
    }
};

// Render terms page
exports.termsPage = (req, res) => {
    res.render('user/terms', {
        user: req.user
    });
};

// Handle terms acceptance
exports.acceptTerms = async (req, res) => {
    try {
        await User.acceptTerms(req.user.id);
        
        req.user.terms_accepted = true;
        req.user.terms_accepted_at = new Date();
        req.session.user = req.user;
        
        res.redirect('/homepage');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Failed to accept terms. Please try again.');
        res.redirect('/terms');
    }
};



// Render login page
exports.loginPage = (req, res) => {
    const successMessage = req.flash('success');
    const errorMessage = req.flash('error');
    const email = req.query.email || '';  

    res.render('user/login', {
        messages: {
            success: successMessage,
            error: errorMessage,
            errors: req.flash('errors'),
        },
        oldEmail: email 
    });
};

// Handle Login
exports.handleLogin = async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findByEmail(email);
        console.log('User from DB:', user);

        if (!user) {
            req.flash('error', 'Invalid email or password');
            return res.redirect('/login');
        }

        // Handle Google-authenticated users (no password)
        if (user.google_id) {
            req.session.user = user;
            console.log('Session after Google login:', req.session);

            return req.session.save((err) => {
                if (err) {
                    console.error('Error saving session:', err);
                    req.flash('error', 'An error occurred. Please try again later.');
                    return res.redirect('/login');
                }
                res.redirect('/homepage');
            });
        }

        // Handle regular users (with password)
        const trimmedPassword = password.trim();
        const isPasswordValid = await bcrypt.compare(trimmedPassword, user.password);
        
        if (!isPasswordValid) {
            req.flash('error', 'Invalid email or password');
            return res.redirect('/login');
        }

        // If password is valid, set the session
        req.session.user = user;
        
        req.session.save((err) => {
        if (err) {
            console.error('Error saving session:', err);
            req.flash('error', 'An error occurred. Please try again later.');
            return res.redirect('/login');
        }
        
        // Check if terms need to be accepted
        if (!user.terms_accepted) {
            return res.redirect('/terms');
        }
        
        res.redirect('/homepage');
    });
    } catch (error) {
        console.error(error);
        req.flash('error', 'An error occurred. Please try again later.');
        res.redirect('/login');
    }
};



// View front page
exports.frontPage = (req, res) => {
    res.render('user/frontpage'); 
};

// Homepage 
exports.homepage = async (req, res) => {
    if (!req.session.user) return res.redirect('/login');

    const postNotifications = await getLatestPostNotification();
    const teamNotifications = await getTeamStatusNotification(req.session.user.id);

    console.log('Post Notifications:', postNotifications);
    console.log('Team Notifications:', teamNotifications);

    res.render('user/homepage', {
        user: req.session.user,
        notifications: [...postNotifications, ...teamNotifications] // Combine arrays
    });
};


// Get Gallery for users
exports.getGallery = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect('/login');
        }

        // Calculate date 10 days ago
        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

        // Fetch all posts with media files, ordered by created_at (newest first)
        const [posts] = await db.execute(`
            SELECT id, images, videos, created_at 
            FROM posts 
            WHERE (images IS NOT NULL AND images != '[]') 
               OR (videos IS NOT NULL AND videos != '[]')
            ORDER BY created_at DESC
        `);

        console.log(`Found ${posts.length} posts with potential media`);

        const recentMediaItems = [];
        const olderMediaItems = [];

        posts.forEach(post => {
            const postDate = new Date(post.created_at);
            const isRecent = postDate >= tenDaysAgo;

            // 🔹 Process images (saved as [{ url, public_id }])
            if (post.images && post.images !== '[]') {
                try {
                    const images = JSON.parse(post.images);
                    if (Array.isArray(images)) {
                        images.forEach(imgObj => {
                            if (imgObj && imgObj.url) {
                                const mediaItem = {
                                    type: 'image',
                                    url: imgObj.url, // ✅ Cloudinary URL
                                    createdAt: post.created_at,
                                    postId: post.id,
                                    filename: imgObj.public_id || imgObj.url.split('/').pop()
                                };
                                if (isRecent) recentMediaItems.push(mediaItem);
                                else olderMediaItems.push(mediaItem);
                            }
                        });
                    }
                } catch (e) {
                    console.error(`Error parsing images for post ${post.id}:`, e);
                }
            }

            // 🔹 Process videos (saved as [{ url, public_id }])
            if (post.videos && post.videos !== '[]') {
                try {
                    const videos = JSON.parse(post.videos);
                    if (Array.isArray(videos)) {
                        videos.forEach(vidObj => {
                            if (vidObj && vidObj.url) {
                                const mediaItem = {
                                    type: 'video',
                                    url: vidObj.url, // ✅ Cloudinary URL
                                    createdAt: post.created_at,
                                    postId: post.id,
                                    filename: vidObj.public_id || vidObj.url.split('/').pop()
                                };
                                if (isRecent) recentMediaItems.push(mediaItem);
                                else olderMediaItems.push(mediaItem);
                            }
                        });
                    }
                } catch (e) {
                    console.error(`Error parsing videos for post ${post.id}:`, e);
                }
            }
        });

        console.log(`Processed ${recentMediaItems.length} recent and ${olderMediaItems.length} older media items`);

        // ✅ Render gallery with Cloudinary URLs
        res.render('user/gallery', {
            user: req.session.user,
            recentMediaItems,
            olderMediaItems
        });
    } catch (error) {
        console.error('Error fetching gallery:', error);
        res.status(500).render('user/gallery', {
            user: req.session.user,
            recentMediaItems: [],
            olderMediaItems: [],
            error: 'Error loading gallery'
        });
    }
};



// Helper function to format date like Facebook
function formatTimeAgo(dateString) {
    const now = new Date();
    const postDate = new Date(dateString);
    const seconds = Math.floor((now - postDate) / 1000);
    
    let interval = Math.floor(seconds / 31536000);
    if (interval >= 1) {
        return interval === 1 ? "1yr" : `${interval}yrs`;
    }
    
    interval = Math.floor(seconds / 2592000);
    if (interval >= 1) {
        return interval === 1 ? "1mon" : `${interval}mons`;
    }
    
    interval = Math.floor(seconds / 86400);
    if (interval >= 1) {
        return interval === 1 ? "1d" : `${interval}d`;
    }
    
    interval = Math.floor(seconds / 3600);
    if (interval >= 1) {
        return interval === 1 ? "1h" : `${interval}h`;
    }
    
    interval = Math.floor(seconds / 60);
    if (interval >= 1) {
        return interval === 1 ? "1m" : `${interval}m`;
    }
    
    return "just now";
};


// Get Posts for Users
exports.getPosts = async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    // Get latest post notification
    const postNotifications = await getLatestPostNotification();
    const userId = req.session.user.id;

    try {
        // 1. Get admin info with profile picture
        const [[admin]] = await db.execute("SELECT id, name, profilePic FROM admins LIMIT 1");

        // 2. Get all posts
        let [posts] = await db.execute("SELECT * FROM posts ORDER BY created_at DESC");

        // 3. Initialize reactions data
        const postIds = posts.map(post => post.id);
        let reactionsData = {};
        posts.forEach(post => {
            reactionsData[post.id] = {
                likes: 0,
                dislikes: 0,
                hasLiked: false,
                hasDisliked: false
            };
        });

        // 4. Get reactions if there are posts
        if (postIds.length > 0) {
            const placeholders = postIds.map(() => '?').join(',');

            // Total reactions
            const [countResults] = await db.execute(`
                SELECT 
                    post_id,
                    SUM(reaction_type = 'like') AS likes,
                    SUM(reaction_type = 'dislike') AS dislikes
                FROM post_reactions
                WHERE post_id IN (${placeholders})
                GROUP BY post_id
            `, postIds);

            countResults.forEach(r => {
                reactionsData[r.post_id].likes = r.likes || 0;
                reactionsData[r.post_id].dislikes = r.dislikes || 0;
            });

            // User’s reactions
            const [userReactions] = await db.execute(`
                SELECT post_id, reaction_type 
                FROM post_reactions 
                WHERE post_id IN (${placeholders}) AND user_id = ?
            `, [...postIds, userId]);

            userReactions.forEach(r => {
                if (r.reaction_type === 'like') reactionsData[r.post_id].hasLiked = true;
                if (r.reaction_type === 'dislike') reactionsData[r.post_id].hasDisliked = true;
            });
        }

        // 5. Format posts with Cloudinary media + reactions
        posts = posts.map(post => {
            let images = [];
            let videos = [];

            try {
                images = post.images ? JSON.parse(post.images) : [];
                videos = post.videos ? JSON.parse(post.videos) : [];
            } catch (e) {
                console.error(`Error parsing media for post ${post.id}:`, e);
            }

            return {
                ...post,
                images: Array.isArray(images) ? images.map(img => ({
                    url: img.url,
                    public_id: img.public_id || null
                })) : [],
                videos: Array.isArray(videos) ? videos.map(vid => ({
                    url: vid.url,
                    public_id: vid.public_id || null
                })) : [],
                likes: reactionsData[post.id].likes,
                dislikes: reactionsData[post.id].dislikes,
                hasLiked: reactionsData[post.id].hasLiked,
                hasDisliked: reactionsData[post.id].hasDisliked
            };
        });

        // 6. Render posts
        res.render('user/posts', {
            notifications: postNotifications,
            user: req.session.user,
            admin: admin || { name: 'Admin', profilePic: '' },
            posts,
            formatTimeAgo
        });

    } catch (err) {
        console.error("Error fetching posts:", err);
        res.render('user/posts', {
            user: req.session.user,
            admin: { name: 'Admin', profilePic: '' },
            posts: []
        });
    }
};


// React to Post (for users)
exports.reactToPost = async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.session.user.id;
    const { postId, reactionType } = req.params;

    try {
        // First check current reaction state
        const [currentReaction] = await db.execute(`
            SELECT reaction_type 
            FROM post_reactions 
            WHERE post_id = ? AND user_id = ?
        `, [postId, userId]);

        // Determine the action
        let shouldRemove = false;
        if (currentReaction.length > 0) {
            shouldRemove = currentReaction[0].reaction_type === reactionType;
        }

        // Perform the action
        if (shouldRemove) {
            await db.execute(`
                DELETE FROM post_reactions 
                WHERE post_id = ? AND user_id = ?
            `, [postId, userId]);
        } else {
            // Remove any existing reaction first
            await db.execute(`
                DELETE FROM post_reactions 
                WHERE post_id = ? AND user_id = ?
            `, [postId, userId]);
            
            // Add new reaction
            await db.execute(`
                INSERT INTO post_reactions 
                (post_id, user_id, reaction_type) 
                VALUES (?, ?, ?)
            `, [postId, userId, reactionType]);
        }

        // Get updated counts and status
        const [reactions] = await db.execute(`
            SELECT 
                SUM(reaction_type = 'like') AS likes,
                SUM(reaction_type = 'dislike') AS dislikes,
                EXISTS(SELECT 1 FROM post_reactions 
                       WHERE post_id = ? AND user_id = ? 
                       AND reaction_type = 'like') AS has_liked,
                EXISTS(SELECT 1 FROM post_reactions 
                       WHERE post_id = ? AND user_id = ? 
                       AND reaction_type = 'dislike') AS has_disliked
            FROM post_reactions
            WHERE post_id = ?
        `, [postId, userId, postId, userId, postId]);

        res.json({
            likes: reactions[0].likes || 0,
            dislikes: reactions[0].dislikes || 0,
            hasLiked: Boolean(reactions[0].has_liked),
            hasDisliked: Boolean(reactions[0].has_disliked)
        });

    } catch (err) {
        console.error("Error reacting to post:", err);
        res.status(500).json({ error: 'Failed to process reaction' });
    }
};



//Get Events page
exports.getEvents = async (req, res) => {
    try {
        const [events] = await db.execute(`
            SELECT id, title, description, sports, image, date_schedule, location, created_at, status
            FROM events
            WHERE status = 'ongoing'  
        `);

        console.log('Fetched events:', events); // Debug log

        res.render('user/events', { 
            events: events,
            user: req.session.user || {}
        });

    } catch (error) {
        console.error('Error fetching events:', error);
        req.flash('error', 'Unable to fetch events');
        res.redirect('/homepage');  
    }
};

//getEventDetails
exports.getEventDetails = async (req, res) => {
    console.log('Entering getEventDetails controller');
    if (!req.session.user) {
        console.log('No user session, redirecting to login');
        return res.redirect("/login");
    }
    
    // Use req.params.eventId to match the route parameter
    const eventId = req.params.id;  // This is the key change
    console.log('Requested event ID:', eventId);

    try {
        console.log('Executing SQL query for event ID:', eventId);
        const [eventRows] = await db.execute('SELECT * FROM events WHERE id = ?', [eventId]);
        
        if (eventRows.length === 0) {
            console.log('No event found with ID:', eventId);
            return res.redirect('/events');
        }

        const event = eventRows[0];
        console.log('Found event:', event.title);
        
        // Format date for display
        event.formattedDate = new Date(event.date_schedule).toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Get user data separately
        const userId = req.session.user.id;
        const [userRows] = await db.execute("SELECT * FROM users WHERE id = ?", [userId]);
        const user = userRows[0];

        console.log('Rendering eventDetails template');
        res.render("user/eventDetails", {
            event: event,
            user: user,
            messages: {}
        });
    } catch (error) {
        console.error("Error fetching event details:", error);
        res.redirect('/events');
    }
};

// Get all teams the current user has joined
exports.getMyTeams = async (req, res) => {
    try {
        const userId = req.session.user.id;

        // Get all teams where the user is a player
        const [teamRows] = await db.execute(`
            SELECT t.*, e.title AS event_title
            FROM team t
            LEFT JOIN events e ON t.event_id = e.id
            WHERE t.id IN (
                SELECT team_id FROM team_players 
                WHERE user_id = ? AND status = 'confirmed'
            )
            AND t.status = 'confirmed'
            ORDER BY t.teamName ASC
        `, [userId]);

        res.render('user/myTeam', {
            teams: teamRows,
            user: req.session.user || {}
        });

    } catch (error) {
        console.error('Error fetching user teams:', error);
        res.redirect('/homepage');
    }
};

// Get team details for modal
exports.getTeamDetailsModal = async (req, res) => {
    try {
        const teamId = req.params.id;

        // Get team details with coach and event info
        const [teamRows] = await db.execute(`
            SELECT t.*, 
                   c.fullname AS coach_name,
                   c.email AS coach_email,
                   u.profile AS coach_profile,
                   e.title AS event_title
            FROM team t
            LEFT JOIN coach c ON t.coach_id = c.id
            LEFT JOIN users u ON c.email = u.email
            LEFT JOIN events e ON t.event_id = e.id
            WHERE t.id = ?
        `, [teamId]);

        if (teamRows.length === 0) {
            return res.status(404).json({ error: 'Team not found' });
        }

        const team = teamRows[0];

        // Get all players for the team
        const [playerRows] = await db.execute(`
            SELECT tp.*, u.profile AS user_profile
            FROM team_players tp
            LEFT JOIN users u ON tp.user_id = u.id
            WHERE tp.team_id = ? AND tp.status = 'confirmed'
            ORDER BY tp.player_name ASC
        `, [teamId]);

        res.json({
            team: team,
            players: playerRows
        });

    } catch (error) {
        console.error('Error fetching team details:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};


// Get all organizations
exports.getJoinTeam = async (req, res) => {
    try {
        const userId = req.session.user.id;

        // Get only confirmed teams with their related event and coach info
        const [teams] = await db.execute(`
            SELECT 
                t.id, 
                t.teamName as organizationName,
                t.teamProfile,
                t.organization,
                t.status,
                t.created_at,
                t.event_id,
                e.title as eventTitle,
                c.fullname as coordinatorName
            FROM team t
            LEFT JOIN events e ON t.event_id = e.id
            LEFT JOIN coach c ON t.coach_id = c.id
            WHERE t.status = 'confirmed'
            ORDER BY t.created_at DESC
        `);

        // Get all teams the user is registered in (including pending/rejected) with their event_id
        const [playerTeams] = await db.execute(`
            SELECT 
                tp.team_id, 
                tp.status,
                t.event_id
            FROM team_players tp
            JOIN team t ON tp.team_id = t.id
            WHERE tp.user_id = ?
        `, [userId]);

        // Check if user has any team registration (regardless of status)
        const hasTeamRegistration = playerTeams.length > 0;

        // Create a map of event IDs the user is already registered for
        const userEventRegistrations = new Map();
        playerTeams.forEach(pt => {
            if (pt.event_id) {
                userEventRegistrations.set(pt.event_id, pt.status);
            }
        });

        res.render('user/joinTeam', {
            user: req.session.user,
            organizations: teams.map(team => ({
                ...team,
                created_at: formatDate(team.created_at),
                statusClass: 'confirmed',
                // Check if user has registered for this specific team
                userTeamStatus: playerTeams.find(pt => pt.team_id === team.id)?.status || null,
                // Check if user has registered for any team in the same event
                userEventStatus: team.event_id ? userEventRegistrations.get(team.event_id) : null
            })),
            hasTeamRegistration: hasTeamRegistration,
            playerTeams: playerTeams
        });
    } catch (error) {
        console.error('Error fetching organizations:', error);
        req.flash('error', 'Failed to load organizations');
        res.redirect('/homepage');
    }
};

//Get All Teams
exports.getAllTeams = async (req, res) => {
    try {
        console.log('Fetching teams...'); // Debug log
        
        const [teams] = await db.execute(`
            SELECT t.id, t.teamName, t.teamProfile, t.organization, t.created_at,
                   e.title AS eventTitle
            FROM team t
            LEFT JOIN events e ON t.event_id = e.id
            WHERE t.status = 'confirmed'
            ORDER BY t.created_at DESC
        `);

        console.log('Teams found:', teams.length); // Debug log
        
        res.render('user/allTeams', {
            teams: teams,
            user: req.session.user || {}
        });

    } catch (error) {
        console.error('Error fetching teams:', error);
        // Instead of redirecting, render the page with empty teams
        res.render('user/allTeams', {
            teams: [],
            user: req.session.user || {}
        });
    }
};

// Get team details
exports.getTeamDetails = async (req, res) => {
    try {
        const teamId = req.params.id;
        
        // Get team details with coach information
        const [teamRows] = await db.execute(`
            SELECT t.*, 
                   c.fullname AS coachName,
                   c.email AS coachEmail,
                   u.profile AS coachProfile
            FROM team t
            LEFT JOIN coach c ON t.coach_id = c.id
            LEFT JOIN users u ON c.email = u.email
            WHERE t.id = ? AND t.status = 'confirmed'
        `, [teamId]);

        if (teamRows.length === 0) {
            return res.redirect('/all-teams');
        }

        const team = teamRows[0];
        let event = null;
        let sports = null;

        // Get associated event and sports if exists
        if (team.event_id) {
            const [eventRows] = await db.execute(`
                SELECT *, sports FROM events WHERE id = ?
            `, [team.event_id]);
            
            if (eventRows.length > 0) {
                event = eventRows[0];
                sports = event.sports; // Get sports from the event
            }
        }

        res.render('user/viewTeamDetails', {
            team: team,
            event: event || null,
            sports: sports, // Pass sports separately
            user: req.session.user || {}
        });

    } catch (error) {
        console.error('Error fetching team details:', error);
        res.redirect('/all-teams');
    }
};

// Get team players by sport
exports.getTeamPlayers = async (req, res) => {
    try {
        const teamId = req.params.id;
        const sport = req.query.sport;
        
        // Get team info
        const [teamRows] = await db.execute(`
            SELECT * FROM team WHERE id = ? AND status = 'confirmed'
        `, [teamId]);

        if (teamRows.length === 0) {
            return res.redirect('/all-teams');
        }

        const team = teamRows[0];

        // Get players for the selected sport with user profiles
        const [playerRows] = await db.execute(`
            SELECT tp.*, u.profile AS user_profile 
            FROM team_players tp
            LEFT JOIN users u ON tp.user_id = u.id
            WHERE tp.team_id = ? AND tp.sports = ? AND tp.status = 'confirmed'
            ORDER BY tp.player_name ASC
        `, [teamId, sport]);

        res.render('user/sportPlayers', {
            team: team,
            players: playerRows,
            sport: sport,
            user: req.session.user || {}
        });

    } catch (error) {
        console.error('Error fetching team players:', error);
        res.redirect('/all-teams');
    }
};

// Sport player limits configuration
const SPORT_LIMITS = {
    // Basketball
    'basketball': 12,
    
    // Volleyball
    'volleyball': 12,
    
    // Soccer
    'soccer': 11,
    
    // Badminton
    'badminton_single': 1,
    'badminton_double': 2,
    
    // Other sports
    'sepak_takraw': 9,
    'table_tennis': 1,
    'chess': 1,
    'taekwondo': 1,
    'arnis': 1,
    'gymnastic': 1,
    
    // Athletics (track and field)
    'athletics_100m': 1,
    'athletics_200m': 1,
    'athletics_400m': 1,
    'athletics_800m': 1,
    'athletics_1500m': 1,
    'athletics_5000m': 1,
    'athletics_longjump': 1,
    'athletics_highjump': 1,
    'athletics_triplejump': 1,
    'athletics_shotput': 1,
    'athletics_javelin': 1,
    'athletics_discusthrow': 1,
    'athletics_4x100': 4,
    'athletics_4x400': 4,
    
    // Esports
    'ml': 5,       // Mobile Legends
    'codm': 5,     // CODM
    
    // Other activities
    'cheerdance': 15,
    'dance_competition': 15,
    'singing_contest': 1
};

//get Player Register Page
exports.getPlayerRegister = async (req, res) => {
    try {
        const { team_id } = req.query;
        
        if (!req.user || !req.user.id) {
            req.flash('error', 'You must be logged in to register a player.');
            return res.redirect('/login');
        }

        if (!team_id || isNaN(team_id)) {
            req.flash('error', 'Invalid team selection.');
            return res.redirect('/all-teams');
        }

        // Get team info with event_id and organization type
        const [team] = await db.execute(`
            SELECT t.id, t.teamName, t.event_id, t.organization, e.sports, e.esports, e.other_activities 
            FROM team t
            LEFT JOIN events e ON t.event_id = e.id
            WHERE t.id = ?`, 
            [team_id]
        );

        if (!team || team.length === 0) {
            req.flash('error', 'Team not found.');
            return res.redirect('/all-teams');
        }

        const teamData = team[0];
        let sports = [];

        // If team is associated with an event and has sports/esports/activities defined
        if (teamData.event_id) {
            // Process sports
            if (teamData.sports) {
                sports = sports.concat(teamData.sports.split(',').map(s => s.trim()).filter(s => s.length > 0));
            }
            
            // Process esports
            if (teamData.esports) {
                const esports = teamData.esports.split(',').map(s => s.trim()).filter(s => s.length > 0);
                // Map esports codes to full names
                const esportsMap = {
                    'ml': 'Mobile Legends',
                    'codm': 'CODM'
                };
                sports = sports.concat(esports.map(code => esportsMap[code] || code));
            }
            
            // Process other activities
            if (teamData.other_activities) {
                const activities = teamData.other_activities.split(',').map(s => s.trim()).filter(s => s.length > 0);
                // Map activity codes to full names
                const activitiesMap = {
                    'cheerdance': 'Cheerdance',
                    'dance_competition': 'Dance Competition',
                    'singing_contest': 'Singing Contest'
                };
                sports = sports.concat(activities.map(code => activitiesMap[code] || code));
            }
        } else {
            // Fallback to all sports if no event
            const [events] = await db.execute(
                'SELECT sports, esports, other_activities FROM events WHERE sports IS NOT NULL OR esports IS NOT NULL OR other_activities IS NOT NULL'
            );
            
            const allSports = [];
            const esportsMap = {
                'ml': 'Mobile Legends',
                'codm': 'CODM'
            };
            const activitiesMap = {
                'cheerdance': 'Cheerdance',
                'dance_competition': 'Dance Competition',
                'singing_contest': 'Singing Contest'
            };

            events.forEach(event => {
                if (event.sports) {
                    allSports.push(...event.sports.split(',').map(s => s.trim()));
                }
                if (event.esports) {
                    allSports.push(...event.esports.split(',').map(code => esportsMap[code] || code));
                }
                if (event.other_activities) {
                    allSports.push(...event.other_activities.split(',').map(code => activitiesMap[code] || code));
                }
            });
            
            sports = [...new Set(allSports)]; // Remove duplicates
        }

        // Sort alphabetically
        sports.sort();

        // Get current player counts for each sport in this team
        const sportData = await Promise.all(sports.map(async (sport) => {
            // Map display name back to code
            let sportCode = sport;
            const reverseEsportsMap = {
                'Mobile Legends': 'ml',
                'CODM': 'codm'
            };
            const reverseActivitiesMap = {
                'Cheerdance': 'cheerdance',
                'Dance Competition': 'dance_competition',
                'Singing Contest': 'singing_contest'
            };

            if (reverseEsportsMap[sport]) {
                sportCode = reverseEsportsMap[sport];
            } else if (reverseActivitiesMap[sport]) {
                sportCode = reverseActivitiesMap[sport];
            }

            const [count] = await db.execute(`
                SELECT COUNT(*) as count 
                FROM team_players 
                WHERE team_id = ? AND sports = ?
            `, [team_id, sportCode]);

            const limit = SPORT_LIMITS[sportCode] || 'No limit';

            return {
                name: sport,
                currentCount: count[0].count,
                limit: limit,
                full: limit !== 'No limit' && count[0].count >= limit
            };
        }));

        res.render('user/playerRegister', {
            team_id: team_id,
            sports: sportData.filter(s => !s.full), // Only show sports that aren't full
            teamName: teamData.teamName,
            organizationType: teamData.organization,
            errorMessage: req.flash('error')
        });
    } catch (error) {
        console.error('Error in getPlayerRegister:', error);
        req.flash('error', 'Error loading registration form');
        res.redirect('/all-teams');
    }
};

//REGISTER PLAYER FUNCTION
exports.registerPlayer = async (req, res) => {
    const { 
        team_id, 
        player_name, 
        birthdate, 
        age, 
        sex, 
        sports,
        school,
        year_level,
        barangay,
        contact_no
    } = req.body;

    try {
        // First get the team's organization type and event info
        const [team] = await db.execute(`
            SELECT t.organization, e.sports, e.esports, e.other_activities 
            FROM team t
            LEFT JOIN events e ON t.event_id = e.id
            WHERE t.id = ?`, 
            [team_id]
        );

        if (!team || team.length === 0) {
            req.flash('error', 'Team not found.');
            return res.redirect('/all-teams');
        }

        const organizationType = team[0].organization;

        // Validate fields based on organization type
        if (organizationType === 'school') {
            if (!school || !year_level) {
                req.flash('error', 'Please fill in all required fields for school organization.');
                return res.redirect(`/player-register?team_id=${team_id}`);
            }
        } else if (organizationType === 'barangay') {
            if (!barangay) {
                req.flash('error', 'Please fill in barangay information.');
                return res.redirect(`/player-register?team_id=${team_id}`);
            }
        }

        // Check for other required fields
        if (!team_id || !player_name || !birthdate || !age || !sex || !sports || !contact_no ||
            !req.files || !req.files.PSA || !req.files.waiver || !req.files.med_cert) {
            req.flash('error', 'Please fill in all the fields and upload the required files.');
            return res.redirect(`/player-register?team_id=${team_id}`);
        }

        // Map display names back to codes if needed
        let sportsValue = sports;
        const reverseEsportsMap = {
            'Mobile Legends': 'ml',
            'CODM': 'codm'
        };
        const reverseActivitiesMap = {
            'Cheerdance': 'cheerdance',
            'Dance Competition': 'dance_competition',
            'Singing Contest': 'singing_contest'
        };

        // Check if the selected sport is an esport or activity and convert to code
        if (reverseEsportsMap[sports]) {
            sportsValue = reverseEsportsMap[sports];
        } else if (reverseActivitiesMap[sports]) {
            sportsValue = reverseActivitiesMap[sports];
        }

        // Check if sport has player limit
        if (SPORT_LIMITS[sportsValue]) {
            // Get current player count for this sport in this team
            const [playerCount] = await db.execute(`
                SELECT COUNT(*) as count 
                FROM team_players 
                WHERE team_id = ? AND sports = ?
            `, [team_id, sportsValue]);

            if (playerCount[0].count >= SPORT_LIMITS[sportsValue]) {
                req.flash('error', `Sorry, the team for ${sports} has reached the maximum number of players (${SPORT_LIMITS[sportsValue]}).`);
                return res.redirect(`/player-register?team_id=${team_id}`);
            }
        }

        const userId = req.session.user.id;

        const PSAFile = req.files.PSA[0];
        const waiverFile = req.files.waiver[0];
        const medCertFile = req.files.med_cert[0];

        const PSAUrl = req.files.PSA[0].path;       // Cloudinary secure URL
        const waiverUrl = req.files.waiver[0].path;
        const medCertUrl = req.files.med_cert[0].path;


        // Insert player with fields based on organization type
        await db.execute(`
        INSERT INTO team_players 
        (team_id, user_id, player_name, PSA, waiver, med_cert, 
        birthdate, age, sex, sports, school, year_level, barangay, contact_number,
        status, notification_viewed, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "pending", 0, NOW(), NOW())
    `, [
        team_id,
        userId,
        player_name,
        PSAUrl,    // ✅ Cloudinary URL
        waiverUrl, // ✅ Cloudinary URL
        medCertUrl,// ✅ Cloudinary URL
        birthdate,
        age,
        sex,
        sportsValue,
        organizationType === 'school' ? school : null,
        organizationType === 'school' ? year_level : null,
        organizationType === 'barangay' ? barangay : null,
        contact_no
    ]);

        req.flash('success', 'Player registered successfully!');
        res.redirect('/join-team');
    } catch (error) {
        console.error('Error during player registration:', error);
        req.flash('error', 'An error occurred while registering the player.');
        res.redirect(`/player-register?team_id=${team_id}`);
    }
};





// Logout route
exports.handleLogout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.redirect('/homepage');
        }
        res.redirect('/login');
    });
};



// Format date to "Month Day, Year"
function formatDate(dateStr) {
    if (!dateStr) return null;
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateStr).toLocaleDateString('en-US', options);
}

//Get Profile
exports.getProfile = async (req, res) => {
    const user = req.user || req.session.user;

    if (!user || !user.id) {
        return res.status(401).send("Unauthorized: No user session found.");
    }

    try {
        const [[userData]] = await db.execute("SELECT * FROM users WHERE id = ?", [user.id]);

        const [[player]] = await db.execute(
            "SELECT player_name, sex, birthdate, age FROM team_players WHERE user_id = ? LIMIT 1",
            [user.id]
        );

        // Format birthdate if it exists
        if (player?.birthdate) {
            player.birthdate = formatDate(player.birthdate);
        }

        res.render('user/profile', {
            user: userData,
            player,
            message: req.query.upload === 'success' ? 'Profile picture uploaded successfully!' : null
        });

    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
};





// POST: Upload profile picture
exports.uploadProfilePicture = async (req, res) => {
    const user = req.user || req.session.user;

    if (!user || !user.id) {
        return res.status(401).send("Unauthorized: No user session found.");
    }

    if (!req.file) {
        return res.redirect('/profile');
    }

    const profileUrl = req.file.path;

    try {
        // Update DB
        await db.execute("UPDATE users SET profile = ? WHERE id = ?", [profileUrl, user.id]);

        // Refresh user data in session
        const [[updatedUser]] = await db.execute("SELECT * FROM users WHERE id = ?", [user.id]);
        req.session.user = updatedUser;

        res.redirect('/profile?upload=success');
    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
};



