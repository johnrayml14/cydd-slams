const express = require('express');
const flash = require('connect-flash');
const bcrypt = require('bcryptjs');
const coachModel = require('../models/coachModel');
const session = require('express-session');
const { coachUpload,teamProfileUpload, appointmentFormUpload, combinedUpload } = require('../config/multerConfig');
const db = require('../config/db');
const upload = require('../config/coachProfileMulter');
const fs = require('fs');
const path = require('path');
const { 
    getCoachStatusNotification, 
    getLatestPostNotification,
    getPlayerJoinNotifications, 
    getTeamStatusNotifications,
    getLatestCoachPostNotification
} = require('../utils/notificationHelper');
const { coachCertificateUpload } = require('../config/cloudinary');
const { coachRegisterUpload } = require('../config/cloudinary');



// Render the Coach Sign Up page
exports.getCoachSignup = (req, res) => {
    res.render('coach/coachSignup', {
        messages: {}, 
        old: req.body || {}  
    });
};

// Post signup
exports.postCoachSignup = (req, res) => {
    coachCertificateUpload.single('coach_certificate')(req, res, async (err) => {
        if (err) {
            console.error("Cloudinary Upload Error:", err);
            return res.render('coach/coachSignup', {
                messages: { error: 'File upload failed' },
                old: req.body || {}
            });
        }

        if (!req.file) {
            return res.render('coach/coachSignup', {
                messages: { error: 'No file uploaded. Please upload a coach certificate.' },
                old: req.body || {}
            });
        }

        const { fullname, email, phone, password, confirm_password } = req.body;
        if (!fullname || !email || !phone || !password || !confirm_password) {
            return res.render('coach/coachSignup', {
                messages: { error: 'Please fill in all fields' },
                old: req.body || {}
            });
        }
        if (password !== confirm_password) {
            return res.render('coach/coachSignup', {
                messages: { error: 'Passwords do not match' },
                old: req.body || {}
            });
        }

        const emailExists = await coachModel.checkEmailExists(email);
        if (emailExists) {
            return res.render('coach/coachSignup', {
                messages: { error: 'Email already in use' },
                old: req.body || {}
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const coachData = {
            fullname,
            email,
            phone,
            password: hashedPassword,
            // Store Cloudinary URL
            coachCertificate: req.file.path,  
        };

        try {
            await coachModel.createCoach(coachData);
            res.render('coach/coachLogin', {
                messages: { success: 'Coach successfully signed up!' },
                old: {}
            });
        } catch (error) {
            console.error("Database Insertion Error:", error);
            res.render('coach/coachSignup', {
                messages: { error: 'An error occurred while signing up' },
                old: req.body || {}
            });
        }
    });
};



// Get coach Login page
exports.getCoachLogin = (req, res) => {
    res.render('coach/coachLogin', {
        messages: {
            success: req.flash('success'),
            error: req.flash('error')
        },
        old: req.body || {}  
    });
};

// Post coach Login - Updated with better session handling
exports.postCoachLogin = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        req.flash('error', 'Please fill in all fields');
        return res.render('coach/coachLogin', { 
            messages: { error: req.flash('error') },
            old: req.body || {}  
        });
    }

    try {
        const coach = await coachModel.findCoachByEmail(email);
        if (!coach) {
            req.flash('error', 'Invalid email or password');
            return res.render('coach/coachLogin', { 
                messages: { error: req.flash('error') },
                old: req.body || {}
            });
        }

        const isMatch = await bcrypt.compare(password, coach.password);
        if (!isMatch) {
            req.flash('error', 'Invalid email or password');
            return res.render('coach/coachLogin', { 
                messages: { error: req.flash('error') },
                old: req.body || {}
            });
        }

        // Create new session object without destroying existing session
        req.session.coachOnly = {
            id: coach.id,
            email: coach.email,
            fullname: coach.fullname,
            status: coach.status
        };

        // Explicitly save session before redirect
        req.session.save((err) => {
            if (err) {
                console.error("Session save error:", err);
                req.flash('error', 'Login failed. Try again.');
                return res.redirect('/coach/login');
            }
            res.redirect('/coach/homepage');
        });

    } catch (error) {
        console.error("Login Error:", error);
        req.flash('error', 'An error occurred during login');
        return res.render('coach/coachLogin', { 
            messages: { error: req.flash('error') },
            old: req.body || {}
        });
    }
};



// Get coach HOMEPAGE
exports.getCoachHomepage = async (req, res) => {
    if (!req.session.coachOnly) {
        req.flash('error', 'You need to log in to access this page');
        return res.redirect('/coach/login');
    }

    try {
        const coach = await coachModel.findCoachById(req.session.coachOnly.id);

        const statusNotif = await getCoachStatusNotification(coach.id);
        const playerNotifs = await getPlayerJoinNotifications(coach.id);
        const teamNotifs = await getTeamStatusNotifications(coach.id);
        const coachPostNotif = await getLatestCoachPostNotification();

        const notifications = [];
        if (statusNotif) notifications.push(statusNotif);
        notifications.push(...playerNotifs, ...teamNotifs);
        if (coachPostNotif.length > 0) notifications.push(...coachPostNotif);

        res.render('coach/coachHomepage', {
            coach: coach, // Add this line to pass the coach object
            coachStatus: coach.status,
            notifications,
            coachId: coach.id
        });
    } catch (error) {
        console.error('Error fetching coach data:', error);
        req.flash('error', 'An error occurred while loading your profile');
        res.redirect('/coach/login');
    }
};
// Get coach profile
exports.getCoachProfile = async (req, res) => {
    try {
        const coach = await coachModel.findCoachById(req.session.coachOnly.id);
        res.render('coach/coachProfile', {
            coach: coach,
            success: req.flash('success'),
            error: req.flash('error')
        });
    } catch (error) {
        console.error('Error fetching coach profile:', error);
        req.flash('error', 'Failed to load profile');
        res.redirect('/coach/homepage');
    }
};

// Update coach profile picture
exports.updateCoachProfile = [
    upload.single('profilePic'),
    async (req, res) => {
        try {
            if (!req.file) {
                req.flash('error', 'No file uploaded');
                return res.redirect('/coach/profile');
            }

            const profilePath = '/uploads/coach_profile/' + req.file.filename;
            
            // Update coach profile in database
            await coachModel.updateCoachProfile(req.session.coachOnly.id, profilePath);
            
            req.flash('success', 'Profile picture updated successfully');
            res.redirect('/coach/profile');
        } catch (error) {
            console.error('Error updating coach profile:', error);
            req.flash('error', error.message || 'Failed to update profile');
            res.redirect('/coach/profile');
        }
    }
];

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



// Get coach posts with reactions
exports.getCoachPosts = async (req, res) => {
    if (!req.session.coachOnly) {
        console.log('No coach session - redirecting to login');
        return res.redirect('/coach/login');
    }

    const coach = await coachModel.findCoachById(req.session.coachOnly.id);

    const coachId = req.session.coachOnly.id;
    try {
        
        // 1. Get admin info
        const [[admin]] = await db.execute(
            "SELECT id, name, profilePic FROM admins LIMIT 1"
        );

        // 2. Get all posts
        const [posts] = await db.execute(
            "SELECT * FROM posts ORDER BY created_at DESC"
        );

        // 3. Get all post IDs
        const postIds = posts.map(post => post.id);
        
        // 4. Initialize reaction data
        const reactionsData = {};
        posts.forEach(post => {
            reactionsData[post.id] = {
                likes: 0,
                dislikes: 0,
                hasLiked: false,
                hasDisliked: false
            };
        });

        // 5. Get reaction counts and coach's reactions in parallel
        if (postIds.length > 0) {
            // Get total reaction counts
            const [countResults] = await db.execute(`
                SELECT 
                    post_id,
                    SUM(reaction_type = 'like') AS likes,
                    SUM(reaction_type = 'dislike') AS dislikes
                FROM post_reactions
                WHERE post_id IN (${postIds.map(() => '?').join(',')})
                GROUP BY post_id
            `, postIds);

            // Get coach's specific reactions
            const [coachReactions] = await db.execute(`
                SELECT post_id, reaction_type 
                FROM post_reactions 
                WHERE post_id IN (${postIds.map(() => '?').join(',')}) 
                AND coach_id = ?
            `, [...postIds, coachId]);

            // Process counts
            countResults.forEach(reaction => {
                reactionsData[reaction.post_id].likes = reaction.likes || 0;
                reactionsData[reaction.post_id].dislikes = reaction.dislikes || 0;
            });

            // Process coach's reactions
            coachReactions.forEach(reaction => {
                if (reaction.reaction_type === 'like') {
                    reactionsData[reaction.post_id].hasLiked = true;
                } else if (reaction.reaction_type === 'dislike') {
                    reactionsData[reaction.post_id].hasDisliked = true;
                }
            });
        }

        // 6. Format posts with media and reactions
        const formattedPosts = posts.map(post => {
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
                images,
                videos,
                likes: reactionsData[post.id].likes,
                dislikes: reactionsData[post.id].dislikes,
                hasLiked: reactionsData[post.id].hasLiked,
                hasDisliked: reactionsData[post.id].hasDisliked
            };
        });

        // 7. Get notifications and render
        const postNotifications = await getLatestPostNotification();
        
        res.render('coach/coachPosts', {
            
            notifications: postNotifications,
            coach: req.session.coachOnly,
            coach: coach,
            admin: admin || { name: 'Admin', profilePic: '' },
            posts: formattedPosts,
            formatTimeAgo
        });

    } catch (err) {
        console.error("Error in getCoachPosts:", err);
        res.render('coach/coachPosts', {
            coach: req.session.coachOnly,
            admin: { name: 'Admin', profilePic: '' },
            posts: [],
            notifications: []
        });
    }
};


// React to Post (for coaches)
exports.reactToPost = async (req, res) => {
    if (!req.session.coachOnly) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const coachId = req.session.coachOnly.id;
    const { postId, reactionType } = req.params;

    try {
        // Check if post exists
        const [post] = await db.execute('SELECT id FROM posts WHERE id = ?', [postId]);
        if (post.length === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }

        // Check existing reaction
        const [existingReaction] = await db.execute(
            'SELECT reaction_type FROM post_reactions WHERE post_id = ? AND coach_id = ?',
            [postId, coachId]
        );

        // Determine action
        const shouldRemove = existingReaction.length > 0 && 
                           existingReaction[0].reaction_type === reactionType;

        // Process reaction
        if (shouldRemove) {
            await db.execute(
                'DELETE FROM post_reactions WHERE post_id = ? AND coach_id = ?',
                [postId, coachId]
            );
        } else {
            // Remove any existing reaction first
            await db.execute(
                'DELETE FROM post_reactions WHERE post_id = ? AND coach_id = ?',
                [postId, coachId]
            );
            
            // Add new reaction if not 'remove'
            if (reactionType !== 'remove') {
                await db.execute(
                    'INSERT INTO post_reactions (post_id, coach_id, reaction_type) VALUES (?, ?, ?)',
                    [postId, coachId, reactionType]
                );
            }
        }

        // Get updated counts
        const [reactions] = await db.execute(`
            SELECT 
                SUM(reaction_type = 'like') AS likes,
                SUM(reaction_type = 'dislike') AS dislikes
            FROM post_reactions
            WHERE post_id = ?
        `, [postId]);

        // Check if current coach has reacted
        const [coachReaction] = await db.execute(
            'SELECT reaction_type FROM post_reactions WHERE post_id = ? AND coach_id = ?',
            [postId, coachId]
        );

        res.json({
            success: true,
            likes: reactions[0].likes || 0,
            dislikes: reactions[0].dislikes || 0,
            hasLiked: coachReaction[0]?.reaction_type === 'like',
            hasDisliked: coachReaction[0]?.reaction_type === 'dislike'
        });

    } catch (err) {
        console.error('Error reacting to post:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};


// Get Gallery for Coach
exports.getCoachGallery = async (req, res) => {
    try {
        if (!req.session.coachOnly) {
            return res.redirect('/coach/login');
        }

        const coach = await coachModel.findCoachById(req.session.coachOnly.id);

        // Calculate date 10 days ago
        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

        // Fetch all posts with media files
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

        // ✅ Render gallery
        res.render('coach/coachGallery', {
            coach: req.session.coachOnly,
            coachProfile: coach.coachProfile,
            recentMediaItems,
            olderMediaItems
        });

    } catch (error) {
        console.error('Error fetching coach gallery:', error);
        res.status(500).render('coach/coachGallery', {
            coach: req.session.coachOnly,
            recentMediaItems: [],
            olderMediaItems: [],
            error: 'Error loading gallery'
        });
    }
};




// Coach Controller
exports.getCoachLogout = (req, res) => {
    delete req.session.coachOnly;
    res.redirect('/coach/login');
};


// Get Coach Events
exports.getCoachEvents = async (req, res) => {
    const coach = await coachModel.findCoachById(req.session.coachOnly.id);
    try {
        const [events] = await db.execute('SELECT * FROM events WHERE status = "ongoing"');
        const coachStatus = await coachModel.getCoachStatusById(req.session.coachOnly.id);

        res.render('coach/coachEvents', { 
            coach: coach,
            events: events,
            coachStatus: coachStatus, 
        });
    } catch (error) {
        console.error('Error fetching events:', error);
        res.render('coach/coachEvents', { events: [] });
    }
};

// Get Coach Event Details
exports.getCoachEventDetails = async (req, res) => {
    try {
        const coach = await coachModel.findCoachById(req.session.coachOnly.id);
        const eventId = req.params.id;
        const coachId = req.session.coachOnly.id;
        
        // Get event details
        const [eventRows] = await db.execute('SELECT * FROM events WHERE id = ?', [eventId]);
        
        if (eventRows.length === 0) {
            return res.redirect('/coach/events');
        }

        const event = eventRows[0];
        const coachStatus = await coachModel.getCoachStatusById(coachId);

        // Check if coach already has a team registered for this event
        const [teamRows] = await db.execute(
            'SELECT * FROM team WHERE coach_id = ? AND event_id = ?', 
            [coachId, eventId]
        );
        
        const hasRegisteredTeam = teamRows.length > 0;

        res.render('coach/coachEventDetails', { 
            event: event,
            coachStatus: coachStatus,
            coach: coach,
            hasRegisteredTeam: hasRegisteredTeam
        });
    } catch (error) {
        console.error('Error fetching event details:', error);
        res.redirect('/coach/events');
    }
};


// Get Coach Register Team Event
exports.getCoachRegisterEvent = async (req, res) => {
    const coachStatus = await coachModel.getCoachStatusById(req.session.coachOnly.id);

    if (coachStatus !== 'confirmed') {
        req.flash('error', 'Sorry, Your account is not verified by the admin.');
        return res.redirect('/coach/events');
    }

    const eventId = req.params.eventId;
    try {
        const [event] = await db.execute('SELECT * FROM events WHERE id = ?', [eventId]);
        if (event.length === 0) {
            req.flash('error', 'Event not found.');
            return res.redirect('/coach/events');
        }
        const [events] = await db.execute('SELECT DISTINCT sports FROM events');
        res.render('coach/coachRegisterEvents', {
            event: event[0],
            events: events,
            errorMessage: req.flash('error'),
            successMessage: req.flash('success') 
        });
    } catch (error) {
        console.error('Error fetching event:', error);
        req.flash('error', 'Error retrieving event details.');
        res.redirect('/coach/events');
    }
};


// handle coach team registration
exports.postCoachRegisterTeam = [
  coachRegisterUpload.fields([
    { name: 'teamProfile', maxCount: 1 },
    { name: 'appointment_form', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      if (!req.files || !req.files.teamProfile || !req.files.appointment_form) {
        req.flash('error', 'Please upload both team profile image and appointment form.');
        return res.redirect(`/coach/register/${req.params.eventId}`);
      }

      const coachId = req.session.coachOnly.id;
      const { teamName, position, organization } = req.body;
      const eventId = req.params.eventId;

      // Use secure_url from Cloudinary
      const teamProfile = req.files.teamProfile[0].path;
      const appointmentForm = req.files.appointment_form[0].path;

      // Update coach's position
      await db.execute('UPDATE coach SET position = ? WHERE id = ?', [position, coachId]);

      // Check if already registered
      const [existingTeam] = await db.execute(
        'SELECT * FROM team WHERE coach_id = ? AND event_id = ?',
        [coachId, eventId]
      );

      if (existingTeam.length > 0) {
        req.flash('error', 'You are already registered to a team for this event.');
        return res.redirect(`/coach/events`);
      }

      // Insert team registration
      await db.execute(
        'INSERT INTO team (teamName, teamProfile, appointment_form, organization, coach_id, event_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [teamName, teamProfile, appointmentForm, organization, coachId, eventId, 'pending']
      );

      req.flash('success', 'Team registered successfully!');
      res.redirect('/coach/events');
    } catch (error) {
      console.error('Error registering team:', error);
      req.flash('error', 'There was an error registering your team. Please try again.');
      res.redirect(`/coach/register/${req.params.eventId}`);
    }
  },
];

//get coachMyTeam
exports.getCoachMyTeam = async (req, res) => {
    if (!req.session.coachOnly) {
        req.flash('error', 'You need to log in to access this page');
        return res.redirect('/coach/login');
    }

    const coach = await coachModel.findCoachById(req.session.coachOnly.id);
    const coachId = req.session.coachOnly.id;

    try {
        // Get all teams for this coach with their event details
        const [teams] = await db.execute(`
            SELECT 
                t.id AS team_id,
                t.teamName,
                t.teamProfile,
                t.organization,
                t.status AS team_status,
                t.created_at AS team_created_at,
                e.sports AS event_sports,
                e.esports AS event_esports,
                e.other_activities AS event_other_activities,
                e.id AS event_id,
                e.title AS event_title,
                e.description AS event_description,
                e.date_schedule,
                e.location,
                e.status AS event_status,
                e.image AS event_image
            FROM team t
            LEFT JOIN events e ON t.event_id = e.id
            WHERE t.coach_id = ?
            ORDER BY 
                CASE WHEN t.status = 'confirmed' THEN 1
                    WHEN t.status = 'pending' THEN 2
                    ELSE 3 END,
                e.date_schedule DESC
        `, [coachId]);

        // Get player requests for each team
        const playerRequests = {};
        const playerCounts = {}; // Add this object to store player counts
        
        for (const team of teams) {
            // Get pending player requests
            const [players] = await db.execute(`
                SELECT 
                    tp.*,
                    u.profile AS user_profile
                FROM team_players tp
                LEFT JOIN users u ON tp.user_id = u.id
                WHERE tp.team_id = ? AND tp.status = 'pending'
                ORDER BY tp.created_at DESC
            `, [team.team_id]);
            playerRequests[team.team_id] = players;

            // Get player counts for each sport in this team
            // Update the player counting logic
            if (team.event_sports || team.event_esports || team.event_other_activities) {
                const allActivities = [];
                
                // Add regular sports
                if (team.event_sports) {
                    allActivities.push(...team.event_sports.split(',').map(s => s.trim()));
                }
                
                // Add esports (both codes and display names)
                if (team.event_esports) {
                    const esports = team.event_esports.split(',').map(s => s.trim());
                    allActivities.push(...esports); // Add codes (ml, codm)
                    allActivities.push(...esports.map(code => {
                        const esportsMap = { 'ml': 'Mobile Legends', 'codm': 'CODM' };
                        return esportsMap[code] || code;
                    }));
                }
                
                // Add other activities (both codes and display names)
                if (team.event_other_activities) {
                    const activities = team.event_other_activities.split(',').map(s => s.trim());
                    allActivities.push(...activities); // Add codes
                    allActivities.push(...activities.map(code => {
                        const activitiesMap = {
                            'cheerdance': 'Cheerdance',
                            'dance_competition': 'Dance Competition',
                            'singing_contest': 'Singing Contest'
                        };
                        return activitiesMap[code] || code;
                    }));
                }
                
                playerCounts[team.team_id] = {};
                
                for (const activity of allActivities) {
                    const [countResult] = await db.execute(`
                        SELECT COUNT(*) as count 
                        FROM team_players 
                        WHERE team_id = ? 
                        AND (sports = ? OR sports = ?) 
                        AND status = 'confirmed'
                    `, [team.team_id, activity, 
                        // Also check for both code and display name variants
                        activity === 'Mobile Legends' ? 'ml' : 
                        activity === 'CODM' ? 'codm' :
                        activity === 'Cheerdance' ? 'cheerdance' :
                        activity === 'Dance Competition' ? 'dance_competition' :
                        activity === 'Singing Contest' ? 'singing_contest' : activity
                    ]);
                    
                    playerCounts[team.team_id][activity] = countResult[0].count;
                }
            }
        }

        // Get notifications
        const teamNotifs = await getTeamStatusNotifications(coachId);
        const statusNotif = await getCoachStatusNotification(coachId);

        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                req.flash('error', 'An error occurred');
                return res.redirect('/coach/homepage');
            }
            
            res.render('coach/coachMyTeam', {
                coach: req.session.coachOnly,
                coach: coach,
                teams: teams,
                playerRequests: playerRequests,
                playerCounts: playerCounts,
                notifications: [...teamNotifs, statusNotif].filter(n => n),
                formatDate: (dateString) => {
                    const options = { year: 'numeric', month: 'long', day: 'numeric' };
                    return new Date(dateString).toLocaleDateString(undefined, options);
                }
            });
        });

    } catch (error) {
        console.error('Error fetching team data:', error);
        req.flash('error', 'An error occurred while loading your organizations');
        res.redirect('/coach/homepage');
    }
};

//Get All Teams
exports.getCoachAllTeams = async (req, res) => {
    if (!req.session.coachOnly) {
        req.flash('error', 'You need to log in to access this page');
        return res.redirect('/coach/login');
    }
    const coach = await coachModel.findCoachById(req.session.coachOnly.id);

    try {
        // Get all confirmed teams with their event and coach details
        const [teams] = await db.execute(`
            SELECT 
                t.id AS team_id,
                t.teamName,
                t.teamProfile,
                t.organization,
                t.created_at AS team_created_at,
                e.id AS event_id,
                e.title AS event_title,
                e.sports AS event_sports,
                c.id AS coach_id,
                c.fullname AS coach_name
            FROM team t
            LEFT JOIN events e ON t.event_id = e.id
            LEFT JOIN coach c ON t.coach_id = c.id
            WHERE t.status = 'confirmed'
            ORDER BY t.created_at DESC
        `);

        res.render('coach/coachAllTeams', {
            coach: req.session.coachOnly,
            coach: coach,
            teams: teams,
            formatDate: (dateString) => {
                const options = { year: 'numeric', month: 'long', day: 'numeric' };
                return new Date(dateString).toLocaleDateString(undefined, options);
            }
        });
    } catch (error) {
        console.error('Error fetching all teams:', error);
        req.flash('error', 'An error occurred while loading teams');
        res.redirect('/coach/homepage');
    }
};

//Get team details
exports.getTeamDetails = async (req, res) => {
    try {
        const teamId = req.params.teamId;

        // Get team details with coach and event info
        const [teamResult] = await db.execute(`
            SELECT 
                t.*,
                e.title AS event_title,
                e.sports AS event_sports,
                e.description AS event_description,
                e.date_schedule,
                e.location,
                c.fullname AS coach_name,
                c.email AS coach_email,
                c.phone AS coach_phone
            FROM team t
            LEFT JOIN events e ON t.event_id = e.id
            LEFT JOIN coach c ON t.coach_id = c.id
            WHERE t.id = ?
        `, [teamId]);

        if (teamResult.length === 0) {
            return res.status(404).send('Team not found');
        }

        const team = teamResult[0];

        // Get all confirmed players for this team with user profiles
        const [players] = await db.execute(`
            SELECT 
                tp.*,
                u.profile AS user_profile
            FROM team_players tp
            LEFT JOIN users u ON tp.user_id = u.id
            WHERE tp.team_id = ? AND tp.status = 'confirmed'
            ORDER BY tp.player_name ASC
        `, [teamId]);

        res.render('partials/teamDetails', {
            team: team,
            players: players,
            formatDate: (dateString) => {
                const options = { year: 'numeric', month: 'long', day: 'numeric' };
                return new Date(dateString).toLocaleDateString(undefined, options);
            }
        });
    } catch (error) {
        console.error('Error fetching team details:', error);
        res.status(500).send('Error loading team details');
    }
};

// Approve or reject
exports.simpleApprovePlayer = async (req, res) => {
    if (!req.session.coachOnly) {
        req.flash('error', 'You need to log in');
        return res.redirect('/coach/login');
    }

    try {
        const { teamId, playerId, action } = req.body;
        const status = action === 'confirm' ? 'confirmed' : 'rejected';

        // Verify coach owns the team
        const [team] = await db.execute(
            'SELECT id FROM team WHERE id = ? AND coach_id = ?',
            [teamId, req.session.coachOnly.id]
        );

        if (!team.length) {
            req.flash('error', 'Permission denied');
            return res.redirect('/coach/my-team');
        }

        // Update status
        await db.execute(
            'UPDATE team_players SET status = ? WHERE id = ? AND team_id = ?',
            [status, playerId, teamId]
        );

        req.flash('success', `Player ${status} successfully`);
        res.redirect('/coach/my-team');
        
    } catch (error) {
        console.error('Approval error:', error);
        req.flash('error', 'Failed to update player status');
        res.redirect('/coach/my-team');
    }
};

// View player details
exports.viewPlayerDetails = async (req, res) => {
    if (!req.session.coachOnly) {
        req.flash('error', 'You need to log in to access this page');
        return res.redirect('/coach/login');
    }

    try {
        const { id } = req.params;
        
        // Get player details
        const [players] = await db.execute(`
            SELECT 
                tp.*,
                u.profile AS user_profile,
                tp.sports AS player_sports  // Add this line to get sports from team_players
            FROM team_players tp
            LEFT JOIN users u ON tp.user_id = u.id
            WHERE tp.team_id = ?
            ORDER BY 
                CASE WHEN tp.status = 'pending' THEN 1
                    WHEN tp.status = 'confirmed' THEN 2
                    ELSE 3 END,
                tp.created_at DESC
        `, [team.team_id]);

        if (player.length === 0) {
            req.flash('error', 'Player not found');
            return res.redirect('/coach/my-team');
        }

        // Verify the coach owns the team this player is associated with
        const [team] = await db.execute('SELECT id FROM team WHERE id = ? AND coach_id = ?', [player[0].team_id, req.session.coachOnly.id]);
        if (team.length === 0) {
            req.flash('error', 'You do not have permission to view this player');
            return res.redirect('/coach/my-team');
        }

        res.render('coach/playerDetails', {
            coach: req.session.coachOnly,
            player: player[0],
            formatDate: (dateString) => {
                const options = { year: 'numeric', month: 'long', day: 'numeric' };
                return new Date(dateString).toLocaleDateString(undefined, options);
            }
        });
    } catch (error) {
        console.error('Error fetching player details:', error);
        req.flash('error', 'An error occurred while loading player details');
        res.redirect('/coach/my-team');
    }
};

//get coachSportMyPlayers
exports.getCoachSportsMyPlayers = async (req, res) => {
    try {
        const { sport, teamId } = req.query;

        // Map display names to short codes
        const codeMap = {
            'Mobile Legends': 'ml',
            'CODM': 'codm',
            'Cheerdance': 'cheerdance',
            'Dance Competition': 'dance_competition',
            'Singing Contest': 'singing_contest'
        };

        // Get the short code if available, otherwise keep the original
        const sportCode = codeMap[sport] || sport;

        // 1. Verify coach has access to this team
        const [team] = await db.execute(`
            SELECT * FROM team 
            WHERE id = ? 
            AND coach_id = ? 
            AND status = 'confirmed'
        `, [teamId, req.session.coachOnly.id]);

        if (team.length === 0) {
            return res.status(403).send('You do not have access to this team or it is not confirmed');
        }

        // 2. Fetch players for this sport and team (check both display name and short code)
        const [players] = await db.execute(`
            SELECT 
                tp.*,
                u.profile AS user_profile
            FROM team_players tp
            LEFT JOIN users u ON tp.user_id = u.id
            WHERE tp.team_id = ? 
            AND (tp.sports = ? OR tp.sports = ?)
            AND tp.status = 'confirmed'
            ORDER BY tp.player_name ASC
        `, [teamId, sport, sportCode]);

        // 3. Format player data with profile picture and documents
        const playersWithProfile = players.map(player => {
            const documents = {
                PSA: player.PSA ? `${player.PSA}` : null,
                waiver: player.waiver ? `${player.waiver}` : null,
                med_cert: player.med_cert ? `${player.med_cert}` : null
            };

            return {
                ...player,
                profile_picture: player.user_profile ? `${player.user_profile}` : null,
                documents: documents,
                barangay: player.barangay
            };
        });

        // 4. Render the view with data
        res.render('coach/coachSportMyPlayers', {
            title: `${sport} Players`,
            sport: sport,
            team: team[0],
            players: playersWithProfile,
            helpers: {
                formatDate: function(date) {
                    return date ? new Date(date).toLocaleDateString() : 'N/A';
                }
            }
        });

    } catch (error) {
        console.error('Error in getCoachSportsMyPlayers:', error);
        res.status(500).send('An error occurred while fetching player data');
    }
};



// Format date function 
function formatDate(dateString) {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    let ampm = 'AM';

    if (hours >= 12) {
        ampm = 'PM';
        if (hours > 12) {
            hours -= 12;
        }
    } else if (hours === 0) {
        hours = 12;
    }

    const formattedDate = `${day}/${month}/${year}, ${hours}:${minutes} ${ampm}`;
    return formattedDate;
}




// Update player status (accept/reject)
exports.updatePlayerStatus = async (req, res) => {
    const { teamId, playerId } = req.params;
    const action = req.body.action; 

    if (!action || !['accept', 'reject'].includes(action)) {
        req.flash('error', 'Invalid action');
        return res.redirect(`/coach/team/${teamId}`);
    }

    try {
        const newStatus = action === 'accept' ? 'confirmed' : 'rejected';

        // Update the player's status in the database
        await db.execute(
            'UPDATE team_players SET status = ? WHERE team_id = ? AND id = ?',
            [newStatus, teamId, playerId]
        );

        req.flash('success', `Player has been ${newStatus}!`);
        res.redirect(`/coach/team/${teamId}`);
    } catch (error) {
        console.error('Error updating player status:', error);
        req.flash('error', 'An error occurred while updating the player status');
        res.redirect(`/coach/team/${teamId}`);
    }
};








