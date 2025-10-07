const express = require('express');
const flash = require('connect-flash');
const bcrypt = require('bcryptjs');
const Admin = require('../models/adminModel');
const { validationResult } = require('express-validator');
const path = require('path');
const db = require('../config/db');
const { getPendingCoachNotifications, getPendingTeamNotifications } = require("../utils/notificationHelper");





// GET: Admin login page
exports.getAdminLogin = async (req, res) => {
    if (req.session.admin && req.session.admin.id) {
        return res.redirect("/admin/home");
    }

    const successMessage = req.session.success || "";
    req.session.success = null;

    res.render("admin/adminLogin", {
        messages: { success: successMessage },
        oldUser: ""
    });
};

//Post Admin Login
exports.postAdminLogin = async (req, res) => {
    const { user, password } = req.body;

    try {
        const admin = await Admin.getAdminCredentials(user);

        if (!admin) {
            return res.render("admin/adminLogin", {
                messages: { error: "Admin credentials not found" },
                oldUser: user
            });
        }

        const passwordMatch = await bcrypt.compare(password, admin.password);
        if (passwordMatch) {
            req.session.admin = {
                id: admin.id,
                username: admin.username
            };

            req.session.success = "Successfully logged in✅";

            // ✅ Save session explicitly
            return req.session.save(err => {
                if (err) {
                    console.error("Session save error:", err);
                    return res.render("admin/adminLogin", {
                        messages: { error: "Failed to establish session." },
                        oldUser: user
                    });
                }

                return res.redirect("/admin/home");
            });
        }

        return res.render("admin/adminLogin", {
            messages: { error: "Invalid username or password" },
            oldUser: user
        });
    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).render("admin/adminLogin", {
            messages: { error: "An error occurred during login" },
            oldUser: user
        });
    }
};

//Get admin Home
exports.getAdminHome = async (req, res) => {
    if (!req.session.admin) {
        return res.redirect("/admin");
    }

    try {
        const adminId = req.session.admin.id;
        const [adminData] = await db.execute("SELECT * FROM admins WHERE id = ?", [adminId]);
        const admin = adminData[0];

        const [ongoingEvents] = await db.execute("SELECT * FROM events WHERE status = ?", ['ongoing']);
        const [expiredEvents] = await db.execute("SELECT * FROM events WHERE status = ?", ['expired']);

        const newCoachRequests = await getPendingCoachNotifications();
        const newTeamRequests = await getPendingTeamNotifications();

        return res.render("admin/adminHome", {
            admin,
            ongoingEvents,
            expiredEvents,
            success: res.locals.success || "",
            newCoachRequests,
            newTeamRequests
        });
    } catch (err) {
        console.error("Error loading admin home:", err);
        return res.render("admin/adminHome", {
            admin: {},
            ongoingEvents: [],
            expiredEvents: [],
            success: "",
            newCoachRequests: [],
            newTeamRequests: []
        });
    }
};



// GET: Admin profile
exports.getAdminProfile = async (req, res) => {
    if (!req.session.admin || !req.session.admin.id) {
        return res.redirect("/admin");
    }

    const adminId = req.session.admin.id;

    try {
        const [adminRows] = await db.execute("SELECT * FROM admins WHERE id = ?", [adminId]);
        const admin = adminRows[0];

        const success = req.query.success === "1"; // true if ?success=1

        res.render("admin/adminProfile", {
            admin,
            messages: {},
            success // pass to EJS
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error fetching admin profile.");
    }
};

//get adminChangePassword form
exports.getChangePassword = (req, res) => {
    if (!req.session.admin || !req.session.admin.id) {
        return res.redirect("/admin");
    }

    res.render("admin/adminChangePassword", {
        success: false,
        error: null
    });
};

//Change password 
exports.postChangePassword = async (req, res) => {
    const adminId = req.session.admin.id;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    try {
        const [rows] = await db.execute("SELECT password FROM admins WHERE id = ?", [adminId]);
        const hashedPassword = rows[0]?.password;

        const isMatch = await bcrypt.compare(currentPassword, hashedPassword);
        if (!isMatch) {
            return res.render("admin/adminChangePassword", {
                success: false,
                error: "Old password is incorrect."
            });
        }

        if (newPassword !== confirmPassword) {
            return res.render("admin/adminChangePassword", {
                success: false,
                error: "Password do not match."
            });
        }

        const newHashedPassword = await bcrypt.hash(newPassword, 10);
        await db.execute("UPDATE admins SET password = ? WHERE id = ?", [newHashedPassword, adminId]);

        return res.render("admin/adminChangePassword", {
            success: true,
            error: null
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
};


// POST: Handle admin profile picture update
exports.postAdminProfile = async (req, res) => {
    if (!req.session.admin || !req.session.admin.id) {
        return res.redirect("/admin");
    }

    const adminId = req.session.admin.id;
    const profilePic = req.file ? "/uploads/adminProfile/" + req.file.filename : null;

    if (!profilePic) {
        return res.redirect("/admin/adminProfile");
    }

    try {
        await db.execute("UPDATE admins SET profilePic = ? WHERE id = ?", [profilePic, adminId]);
        res.redirect("/admin/adminProfile?success=1"); // Add query param
    } catch (err) {
        console.error(err);
        res.status(500).send("Failed to update profile picture.");
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


//React to Post
exports.reactToPost = async (req, res) => {
    if (!req.session.admin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const adminId = req.session.admin.id;
    const { postId, reactionType } = req.params;

    try {
        // First check current reaction state
        const [currentReaction] = await db.execute(`
            SELECT reaction_type 
            FROM post_reactions 
            WHERE post_id = ? AND admin_id = ?
        `, [postId, adminId]);

        // Determine the action
        let shouldRemove = false;
        if (currentReaction.length > 0) {
            shouldRemove = currentReaction[0].reaction_type === reactionType;
        }

        // Perform the action
        if (shouldRemove) {
            await db.execute(`
                DELETE FROM post_reactions 
                WHERE post_id = ? AND admin_id = ?
            `, [postId, adminId]);
        } else {
            // Remove any existing reaction first
            await db.execute(`
                DELETE FROM post_reactions 
                WHERE post_id = ? AND admin_id = ?
            `, [postId, adminId]);
            
            // Add new reaction
            await db.execute(`
                INSERT INTO post_reactions 
                (post_id, admin_id, reaction_type) 
                VALUES (?, ?, ?)
            `, [postId, adminId, reactionType]);
        }

        // Get updated counts and status
        const [reactions] = await db.execute(`
            SELECT 
                SUM(reaction_type = 'like') AS likes,
                SUM(reaction_type = 'dislike') AS dislikes,
                EXISTS(SELECT 1 FROM post_reactions 
                       WHERE post_id = ? AND admin_id = ? 
                       AND reaction_type = 'like') AS has_liked,
                EXISTS(SELECT 1 FROM post_reactions 
                       WHERE post_id = ? AND admin_id = ? 
                       AND reaction_type = 'dislike') AS has_disliked
            FROM post_reactions
            WHERE post_id = ?
        `, [postId, adminId, postId, adminId, postId]);

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


// Get admin Posts page
exports.getAdminPosts = async (req, res) => {
    if (!req.session.admin) {
        return res.redirect("/admin");
    }
    const username = req.session.admin.username;
    const adminId = req.session.admin.id;

    // ✅ Retrieve and clear flash messages before rendering
    const success = req.session.success;
    const error = req.session.error;
    req.session.success = null;
    req.session.error = null;

    try {
        const [[adminData]] = await db.execute("SELECT * FROM admins WHERE username = ?", [username]);
        let [posts] = await db.execute("SELECT * FROM posts ORDER BY created_at DESC");

        if (!adminData) {
            return res.redirect("/admin");
        }

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

        if (postIds.length > 0) {
            const placeholders = postIds.map(() => '?').join(',');

            const [countResults] = await db.execute(`
                SELECT 
                    post_id,
                    SUM(reaction_type = 'like') AS likes,
                    SUM(reaction_type = 'dislike') AS dislikes
                FROM post_reactions
                WHERE post_id IN (${placeholders})
                GROUP BY post_id
            `, postIds);

            countResults.forEach(reaction => {
                reactionsData[reaction.post_id].likes = reaction.likes || 0;
                reactionsData[reaction.post_id].dislikes = reaction.dislikes || 0;
            });

            const [adminReactions] = await db.execute(`
                SELECT post_id, reaction_type 
                FROM post_reactions 
                WHERE post_id IN (${placeholders}) AND admin_id = ?
            `, [...postIds, adminId]);

            adminReactions.forEach(reaction => {
                reactionsData[reaction.post_id].hasLiked = reaction.reaction_type === 'like';
                reactionsData[reaction.post_id].hasDisliked = reaction.reaction_type === 'dislike';
            });
        }

        posts = posts.map(post => {
            const reactions = reactionsData[post.id];
            return {
                ...post,
                images: post.images ? JSON.parse(post.images) : [],
                videos: post.videos ? JSON.parse(post.videos) : [],
                likes: reactions.likes,
                dislikes: reactions.dislikes,
                hasLiked: reactions.hasLiked,
                hasDisliked: reactions.hasDisliked
            };
        });

        res.render("admin/adminPosts", {
            admin: adminData,
            posts,
            formatTimeAgo: formatTimeAgo,
            success: res.locals.success || "",
            error
        });
    } catch (err) {
        console.error("Error fetching admin data or posts:", err);
        res.redirect("/admin");
    }
};





//Get Add post page
exports.getAdminAddPost = (req, res) => {
    if (!req.session.admin) {
        return res.redirect("/admin");
    }
    res.render("admin/adminAddPost", { messages: {} });
};



// POST Add Post
exports.postAdminAddPost = async (req, res) => {
  try {
    const caption = req.body.caption || '';
    const mediaFiles = req.files || [];
    console.log("Uploaded files:", mediaFiles);

    const images = mediaFiles
      .filter(file => file.mimetype.startsWith('image'))
      .map(file => ({
        url: file.path,         // ✅ Cloudinary URL
        public_id: file.filename // ✅ Cloudinary public_id
      }));

    const videos = mediaFiles
      .filter(file => file.mimetype.startsWith('video'))
      .map(file => ({
        url: file.path,
        public_id: file.filename
      }));

    // Save to DB (store JSON with URLs + public_ids)
    await db.execute(
      "INSERT INTO posts (images, videos, caption) VALUES (?, ?, ?)",
      [JSON.stringify(images), JSON.stringify(videos), caption]
    );

    res.redirect("/admin/posts");
  } catch (error) {
    console.error("Error uploading post:", error);
    res.status(500).send("Error saving the post.");
  }
};

//Delete posts
exports.deletePost = async (req, res) => {
    const postId = req.params.postId;

    try {
        await db.execute("DELETE FROM posts WHERE id = ?", [postId]);
        req.session.success = "Post deleted successfully!";
        res.redirect("/admin/posts");
    } catch (err) {
        console.error("Error deleting post:", err);
        req.session.error = "Error deleting post. Please try again.";
        res.redirect("/admin/posts");
    }
};



// Logout admin
exports.logoutAdmin = (req, res) => {
    req.session.destroy(() => {
        res.redirect("/admin");
    });
};



// Get Admin Events
exports.getAdminEvents = async (req, res) => {
    if (!req.session.admin) {
        return res.redirect("/admin");
    }
    const username = req.session.admin.username;
    try {
        const [events] = await db.execute('SELECT * FROM events');
        const [rows] = await db.execute("SELECT * FROM admins WHERE username = ?", [username]);
        if (rows.length === 0) {
            return res.redirect("/admin");
        }
        const adminData = rows[0];
        if (adminData.profilePic) {
            adminData.profilePic = adminData.profilePic; 
        }
        res.render("admin/adminEvents", {
            events: events,
            messages: {},
            admin: adminData
        });
    } catch (error) {
        console.error("Error fetching events or admin data:", error);
        res.render("admin/adminEvents", {
            events: [],
            messages: { error: "There was an error fetching events." },
            admin: null
        });
    }
};

// Get Event Details
exports.getEventDetails = async (req, res) => {
    if (!req.session.admin) {
        return res.redirect("/admin");
    }
    
    const eventId = req.params.id;
    const username = req.session.admin.username;

    try {
        // Get event details
        const [eventRows] = await db.execute('SELECT * FROM events WHERE id = ?', [eventId]);
        
        if (eventRows.length === 0) {
            return res.redirect('/admin/events');
        }

        const event = eventRows[0];
        
        // Format date for display
        event.formattedDate = new Date(event.date_schedule).toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Get admin data for profile
        const [adminRows] = await db.execute("SELECT * FROM admins WHERE username = ?", [username]);
        const admin = adminRows[0];

        res.render("admin/adminEventDetails", {
            event: event,
            admin: admin,
            messages: {}
        });
    } catch (error) {
        console.error("Error fetching event details:", error);
        res.redirect('/admin/event-details');
    }
};

// Get Edit Event page
exports.getEditEvent = async (req, res) => {
    if (!req.session.admin) {
        return res.redirect("/admin");
    }

    const eventId = req.params.id;
    
    try {
        const [eventRows] = await db.execute('SELECT * FROM events WHERE id = ?', [eventId]);
        
        if (eventRows.length === 0) {
            return res.redirect('/admin/events');
        }

        const event = eventRows[0];
        
        // Format date for datetime-local input
        event.formattedDate = new Date(event.date_schedule).toISOString().slice(0, 16);
        
        res.render("admin/editEventDetails", {
            event: event,
            messages: {}
        });
    } catch (error) {
        console.error("Error fetching event:", error);
        res.redirect('/admin/events');
    }
};

// Update Event
exports.postUpdateEvent = async (req, res) => {
    if (!req.session.admin) {
        return res.redirect("/admin");
    }

    const eventId = req.params.id;
    
    try {
        console.log("Raw form data:", req.body);
        console.log("Uploaded files:", req.files);

        // Get all data from req.body
        const { title, description, date_schedule, location } = req.body;
        
        // Get sports array
        const sports = req.body.sports || req.body['sports[]'] || [];
        
        // Get file names (keep existing if no new file uploaded)
        let image, appointmentForm;
        
        // First get the current event to maintain existing files if not updated
        const [currentEvent] = await db.execute('SELECT image, appointmentForm, status FROM events WHERE id = ?', [eventId]);
        
        if (req.files?.image?.[0]) {
            image = req.files.image[0].filename;
        } else {
            image = currentEvent[0].image;
        }
        
        if (req.files?.appointmentForm?.[0]) {
            appointmentForm = req.files.appointmentForm[0].filename;
        } else {
            appointmentForm = currentEvent[0].appointmentForm;
        }

        // Use existing status if not provided in form
        const status = req.body.status || currentEvent[0].status || null;

        console.log("Processed data:", {
            title,
            description,
            sports,
            image,
            appointmentForm,
            date_schedule,
            location,
            status
        });

        // Validate at least one sport is selected
        if (!sports || sports.length === 0) {
            console.log("Validation failed: No sports selected");
            
            // Re-fetch event data to render the form again
            const [eventRows] = await db.execute('SELECT * FROM events WHERE id = ?', [eventId]);
            const event = eventRows[0];
            event.formattedDate = new Date(event.date_schedule).toISOString().slice(0, 16);
            
            return res.render("admin/editEventDetails", {
                messages: { error: "Please select at least one sport" },
                event: event
            });
        }

        // Convert array to comma-separated string
        const sportsString = Array.isArray(sports) ? sports.join(',') : sports;
        
        console.log("Final data for update:", {
            title,
            description,
            sportsString,
            image,
            appointmentForm,
            date_schedule,
            location,
            status
        });

        const [result] = await db.execute(
            'UPDATE events SET title = ?, description = ?, sports = ?, image = ?, appointmentForm = ?, date_schedule = ?, location = ?, status = ?, updated_at = NOW() WHERE id = ?',
            [title, description, sportsString, image, appointmentForm, date_schedule, location, status, eventId]
        );
        
        console.log("Update successful, result:", result);
        res.redirect(`/admin/events/${eventId}`);
    } catch (error) {
        console.error("Error:", error);
        
        // Re-fetch event data to render the form again
        const [eventRows] = await db.execute('SELECT * FROM events WHERE id = ?', [eventId]);
        const event = eventRows[0];
        event.formattedDate = new Date(event.date_schedule).toISOString().slice(0, 16);
        
        res.render("admin/editEventDetails", {
            messages: { 
                error: "There was an error while updating the event. Please try again.",
                details: error.message
            },
            event: event
        });
    }
};


// Get Create Event page
exports.getCreateEvent = (req, res) => {
    if (!req.session.admin) {
        return res.redirect("/admin");
    }
    res.render("admin/createEvents", { messages: {} });
};



// Post Create Event (updated for badminton split & athletics disciplines)
exports.postCreateEvent = async (req, res) => {
    if (!req.session.admin) {
        return res.redirect("/admin");
    }

    try {
        console.log("Raw form data:", req.body);
        console.log("Uploaded files:", req.files);

        const { title, description, date_schedule, location } = req.body;

        // Ensure arrays are always arrays, even if only one checkbox is selected
        const sports = [].concat(req.body.sports || req.body['sports[]'] || []);
        const esports = [].concat(req.body.esports || req.body['esports[]'] || []);
        const otherActivities = [].concat(req.body.other_activities || req.body['other_activities[]'] || []);

        // These arrays now directly contain values like:
        // badminton_single, badminton_double, athletics_100m, athletics_200m, etc.

       // Uploaded files
        const image = req.files?.image ? req.files.image[0].path : null;
        const appointmentForm = req.files?.appointmentForm ? req.files.appointmentForm[0].path : null;


        console.log("Processed data:", {
            title,
            description,
            sports,
            esports,
            otherActivities,
            image,
            appointmentForm,
            date_schedule,
            location
        });

        // Validation
        if (sports.length === 0 && esports.length === 0 && otherActivities.length === 0) {
            return res.render("admin/createEvents", {
                messages: { error: "Please select at least one category (Sports, Esports, or Other Activities)" },
                formData: req.body
            });
        }

        // Convert arrays to comma-separated strings for DB
        const sportsString = sports.join(",");
        const esportsString = esports.join(",");
        const otherActivitiesString = otherActivities.join(",");

        console.log("Final data for insertion:", {
            title,
            description,
            sportsString,
            esportsString,
            otherActivitiesString,
            image,
            appointmentForm,
            date_schedule,
            location
        });

        // Insert into DB
        const [result] = await db.execute(
            `INSERT INTO events 
             (title, description, sports, esports, other_activities, image, appointmentForm, date_schedule, location) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [title, description, sportsString, esportsString, otherActivitiesString, image, appointmentForm, date_schedule, location]
        );

        console.log("Insert successful:", result);
        res.redirect('/admin/events');
    } catch (error) {
        console.error("Error:", error);
        res.render("admin/createEvents", {
            messages: { 
                error: "There was an error while creating the event. Please try again.",
                details: error.message
            },
            formData: req.body
        });
    }
};



// Get Admin Coach
exports.getAdminCoach = async (req, res) => {
    try {
        const username = req.session.admin?.username;

        const [adminRows] = await db.execute("SELECT * FROM admins WHERE username = ?", [username]);
        const adminData = adminRows[0];

        if (adminData.profilePic) {
            adminData.profilePic = adminData.profilePic;
        }

        const coaches = await Admin.getPendingCoaches(); 
        
        res.render('admin/adminCoach', {
            coaches: coaches,
            admin: adminData
        });

    } catch (error) {
        console.error('Error fetching coaches:', error);
        req.flash('error', 'Error fetching coaches'); 
        res.redirect('/admin/dashboard');
    }
};



// Handle accepting or rejecting a coach's account
exports.updateCoachStatus = async (req, res) => {
    const { coachId, status } = req.body; 

    try {
        await Admin.updateCoachStatus(coachId, status);  
        res.redirect('/admin/coach');
    } catch (error) {
        console.error('Error updating coach status:', error);
        req.flash('error', 'Error updating coach status'); 
        res.redirect('/admin/coach');
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
};

// New helper function for date-only formatting
function formatDateOnly(dateString) {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    
    return `${day}/${month}/${year}`;
}


// Render the users page with all users
exports.getAdminUsers = async (req, res) => {
    try {
        const username = req.session.admin?.username;

        // Get admin profile data
        const [adminRows] = await db.execute("SELECT * FROM admins WHERE username = ?", [username]);
        const adminData = adminRows[0];

        if (adminData.profilePic) {
            adminData.profilePic = adminData.profilePic;
        }

        // Fetch users with all required data
        const [users] = await db.execute(`
            SELECT 
                u.id,
                u.email,
                u.profile,
                tp.id AS team_player_id, 
                tp.player_name,
                tp.sports,
                tp.age,
                tp.sex,
                tp.birthdate,
                tp.PSA,
                tp.waiver,
                tp.med_cert,
                tp.contact_number,
                t.teamName,
                e.title AS event_title,
                tp.created_at
            FROM users u
            INNER JOIN team_players tp ON u.id = tp.user_id AND tp.status = 'confirmed'
            LEFT JOIN team t ON tp.team_id = t.id
            LEFT JOIN events e ON t.event_id = e.id
            ORDER BY tp.created_at DESC
        `);

        const formattedUsers = users.map(user => {
            return {
                ...user,
                team_player_id: user.team_player_id,
                created_at: formatDate(user.created_at),
                birthdate: user.birthdate ? formatDateOnly(user.birthdate) : 'N/A', // Changed to use formatDateOnly
                PSA: user.PSA ? `/uploads/player_PSA/${user.PSA.split('/').pop()}` : null,
                waiver: user.waiver ? `/uploads/player_waiver/${user.waiver.split('/').pop()}` : null,
                med_cert: user.med_cert ? `/uploads/player_medCert/${user.med_cert.split('/').pop()}` : null
            };
        });

        // Render with admin data
        res.render('admin/adminUsers', { 
            users: formattedUsers,
            admin: adminData
        });
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).send("Error fetching users");
    }
};

// Remove player
exports.removePlayer = async (req, res) => {
    try {
        const { player_id } = req.params;
        
        // First check if player exists in team_players table
        const [player] = await db.execute('SELECT * FROM team_players WHERE id = ?', [player_id]);
        if (!player.length) {
            return res.status(404).json({ success: false, message: 'Player not found in team roster' });
        }

        await db.execute('DELETE FROM team_players WHERE id = ?', [player_id]);
        
        res.json({ success: true, message: 'Player removed from team successfully' });
    } catch (error) {
        console.error("Error removing player:", error);
        res.status(500).json({ success: false, message: 'Failed to remove player' });
    }
};




// Get adminTeamRequest Page
exports.getAdminTeamRequest = async (req, res) => {
    if (!req.session.admin) {
        return res.redirect("/admin");
    }

    try {
        const username = req.session.admin.username;
        const [adminRows] = await db.execute("SELECT * FROM admins WHERE username = ?", [username]);
        const adminData = adminRows[0];

        if (adminData.profilePic) {
            adminData.profilePic = adminData.profilePic;
        }

        // Get pending teams with coach info
        const [pendingTeams] = await db.execute(`
            SELECT t.*, c.fullname AS coach_name, c.email, c.phone, c.position
            FROM team t
            LEFT JOIN coach c ON t.coach_id = c.id
            WHERE t.status = "pending"
        `);

        const formattedTeams = pendingTeams.map(team => {
            team.created_at = formatDate(team.created_at); 
            return team;
        });

        res.render('admin/adminTeamRequest', {
            teams: formattedTeams,
            messages: {},
            admin: adminData
        });
    } catch (error) {
        console.error("Error fetching pending teams:", error);
        res.render('admin/adminTeamRequest', { messages: { error: "There was an error fetching team requests." } });
    }
};

// Handle team request Process
exports.handleTeamRequest = async (req, res) => {
    const { teamId, action } = req.body;

    try {
        let status = action === "accept" ? "confirmed" : "rejected";
        await db.execute('UPDATE team SET status = ? WHERE id = ?', [status, teamId]);
        
        // If accepting, also update coach status if needed
        if (action === "accept") {
            await db.execute(`
                UPDATE coach c
                JOIN team t ON c.id = t.coach_id
                SET c.status = 'confirmed'
                WHERE t.id = ? AND c.status = 'pending'
            `, [teamId]);
        }
        
        res.redirect('/admin/team-request');
    } catch (error) {
        console.error("Error updating team request status:", error);
        res.render('admin/adminTeamRequest', { messages: { error: "There was an error processing the request." } });
    }
};






// Admin Get the registered teams
exports.getAdminRegisteredTeam = async (req, res) => {
    if (!req.session.admin) {
        return res.redirect("/admin");
    }

    try {
        const username = req.session.admin.username;
        
        // Get admin data
        const [adminRows] = await db.execute("SELECT * FROM admins WHERE username = ?", [username]);
        const adminData = adminRows[0];

        // Process profile picture if exists
        if (adminData.profilePic) {
            adminData.profilePic = `${adminData.profilePic}`;
        }

        // Get all events for the filter dropdown (ordered by newest first)
        const [events] = await db.execute(`
            SELECT id, title 
            FROM events 
            ORDER BY created_at DESC
        `);

        // Get teams with their event information
        const [confirmedTeams] = await db.execute(`
            SELECT 
                t.id,
                t.teamName,
                t.teamProfile,
                t.created_at,
                t.status,
                e.title AS event_title,
                e.id AS event_id
            FROM team t
            LEFT JOIN events e ON t.event_id = e.id
            WHERE t.status = "confirmed"
            ORDER BY t.created_at DESC
        `);

        // Format team data for the view
        const teams = confirmedTeams.map(team => {
            return {
                ...team,
                created_at: formatDate(team.created_at),
                teamProfile: team.teamProfile ? `${team.teamProfile}` : null,
                event_title: team.event_title || 'No event'
            };
        });

        res.render('admin/adminRegisteredTeam', {
            teams: teams,
            events: events, // Pass events to the view
            admin: adminData,
            messages: req.flash() || {}
        });

    } catch (error) {
        console.error("Error fetching confirmed teams:", error);
        req.flash('error', 'There was an error fetching registered teams. Please try again later.');
        res.render('admin/adminRegisteredTeam', {
            teams: [],
            events: [],
            admin: req.session.admin || null,
            messages: { error: "There was an error fetching registered teams." }
        });
    }
};

























