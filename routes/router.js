const express = require('express');
const userController = require('../controllers/userController'); 
const coachController = require('../controllers/coachController');
const adminController = require('../controllers/adminController');
const router = express.Router();
const { check } = require('express-validator');
const { authMiddleware, checkTermsAccepted } = require('../middleware/auth');
const adminAuthMiddleware = require('../middleware/adminAuth');
const coachAuthMiddleware = require('../middleware/coachAuth');
const coachModel = require('../models/coachModel');
const db = require('../config/db');
const { adminPostUpload,
        coachCertificateUpload,
        coachRegisterUpload,
        playerDocsUpload,
        userProfileUpload } = require('../config/cloudinary');
const uploadProfile = require('../config/adminProfileMulter');
const { combinedUpload } = require("../config/adminEventMulter");






//******USER ROUTES********//
router.get('/', userController.frontPage);
// Terms routes
router.get('/terms', authMiddleware, userController.termsPage);
router.post('/accept-terms', authMiddleware, userController.acceptTerms);
router.get('/homepage', authMiddleware, checkTermsAccepted, userController.homepage);
router.get('/gallery',  authMiddleware, checkTermsAccepted, userController.getGallery);
router.get('/posts',  authMiddleware, checkTermsAccepted, userController.getPosts);
router.post('/posts/:postId/react/:reactionType', userController.reactToPost);
router.get('/profile',  authMiddleware, checkTermsAccepted, userController.getProfile);
router.post(
  '/profile/upload',
  authMiddleware,
  checkTermsAccepted,
  userProfileUpload.single('profile'),   // ✅ Cloudinary upload
  userController.uploadProfilePicture
);
router.get('/login', userController.loginPage);
router.post('/login', userController.handleLogin);
router.get('/signup', userController.signupPage);
router.post('/signup', userController.handleSignup);
router.get('/logout', userController.handleLogout);
router.get('/event-details/:id',  authMiddleware, checkTermsAccepted, userController.getEventDetails);
router.get('/events',  authMiddleware, checkTermsAccepted, userController.getEvents);
router.get('/my-team',  authMiddleware, checkTermsAccepted, userController.getMyTeams);
router.get('/my-team/:id',  authMiddleware, checkTermsAccepted, userController.getTeamDetailsModal);
router.get('/join-team',  authMiddleware, checkTermsAccepted, userController.getJoinTeam);
router.get('/all-teams',  authMiddleware, checkTermsAccepted, userController.getAllTeams);
router.get('/teams/:id',  authMiddleware, checkTermsAccepted, userController.getTeamDetails);
router.get('/teams/:id/players',  authMiddleware, checkTermsAccepted, userController.getTeamPlayers);
router.get('/player-register',  authMiddleware, checkTermsAccepted, userController.getPlayerRegister);
router.post(
  '/player-register',
  authMiddleware,
  checkTermsAccepted,
  playerDocsUpload.fields([
    { name: 'PSA', maxCount: 1 },
    { name: 'waiver', maxCount: 1 },
    { name: 'med_cert', maxCount: 1 },
  ]),
  userController.registerPlayer
);
router.get('/posts/mark-viewed/:id', async (req, res) => {
    const postId = req.params.id;

    try {
        await db.execute(
            'UPDATE posts SET notification_viewed = 1 WHERE id = ?',
            [postId]
        );

        res.redirect('/posts');
    } catch (err) {
        console.error('Error updating notification_viewed:', err);
        res.redirect('/posts');
    }
});
router.get('/team/mark-viewed/:id', async (req, res) => {
    const teamId = req.params.id;
    const userId = req.session.user.id;

    try {
        await db.execute(
            'UPDATE team_players SET notification_viewed = 1 WHERE team_id = ? AND user_id = ?',
            [teamId, userId]
        );
        res.redirect('/my-team');
    } catch (err) {
        console.error('Error updating team notification_viewed:', err);
        res.redirect('/');
    }
});






//***Coach Routes***//
router.get('/coach/signup', coachController.getCoachSignup);
router.post('/coach/signup', coachController.postCoachSignup);
router.get('/coach/login', coachController.getCoachLogin); 
router.post('/coach/login', coachController.postCoachLogin);
router.get('/coach/homepage',coachAuthMiddleware, coachController.getCoachHomepage);  
router.get('/coach/profile', coachAuthMiddleware, coachController.getCoachProfile);
router.post('/coach/profile', coachAuthMiddleware, coachController.updateCoachProfile);
router.get('/coach/posts',coachAuthMiddleware, coachController.getCoachPosts);  
router.post('/coach/posts/:postId/react/:reactionType', coachAuthMiddleware, coachController.reactToPost);
router.get('/coach/gallery',coachAuthMiddleware, coachController.getCoachGallery);  
router.get('/coach/logout', coachController.getCoachLogout);
router.get('/coach/events',coachAuthMiddleware, coachController.getCoachEvents);
router.get('/coach/events/:id', coachAuthMiddleware, coachController.getCoachEventDetails);
router.get('/coach/register/:eventId', coachAuthMiddleware, coachController.getCoachRegisterEvent);
router.post('/coach/register/:eventId', coachAuthMiddleware, coachController.postCoachRegisterTeam);
router.get('/coach/my-team', coachAuthMiddleware, coachController.getCoachMyTeam);
router.get('/coach/all-teams', coachAuthMiddleware,coachController.getCoachAllTeams);
router.get('/coach/team-details/:teamId', coachController.getTeamDetails);
router.post('/coach/team/approve-player', coachController.simpleApprovePlayer);
router.get('/coach/sport-players', coachAuthMiddleware, coachController.getCoachSportsMyPlayers);

// View player details
router.get('/player/:id', coachController.viewPlayerDetails);
router.post('/coach/team/:teamId/player/:playerId/update-status', coachController.updatePlayerStatus);
router.post('/coach/notification/viewed', async (req, res) => {
    const { coachId } = req.body;

    try {
        // Only mark coach-specific notifications as viewed
        await db.execute("UPDATE coach SET notification_viewed = 1 WHERE id = ?", [coachId]);
        await db.execute("UPDATE team SET notification_viewed = 1 WHERE coach_id = ?", [coachId]);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Notification update error:', err);
        res.status(500).json({ success: false });
    }
});
// Mark latest post as viewed by coach
router.get('/coach/posts/mark-viewed/:id', async (req, res) => {
    const postId = req.params.id;

    try {
        await db.execute(
            'UPDATE posts SET coach_notifViewed = 1 WHERE id = ?',
            [postId]
        );
        res.redirect('/coach/posts');
    } catch (err) {
        console.error('Error updating coach_notifViewed:', err);
        res.redirect('/coach/posts');
    }
});







//***Admin Routes***/
router.get("/admin", adminController.getAdminLogin);
router.post("/admin/login", adminController.postAdminLogin);
router.get("/admin/logout", adminController.logoutAdmin);
router.get("/admin/adminProfile", adminAuthMiddleware, adminController.getAdminProfile);
router.post("/admin/adminProfile", adminAuthMiddleware, uploadProfile.single('profilePic'), adminController.postAdminProfile);
router.get("/admin/changePassword", adminController.getChangePassword);
router.post("/admin/changePassword", adminController.postChangePassword);
router.get("/admin/home", adminAuthMiddleware, adminController.getAdminHome);
router.get("/admin/posts", adminAuthMiddleware, adminController.getAdminPosts);
router.post('/admin/posts/:postId/react/:reactionType', adminAuthMiddleware, adminController.reactToPost);
router.get("/admin/add-post", adminAuthMiddleware, adminController.getAdminAddPost);
router.post('/admin/posts/:postId/delete', adminAuthMiddleware, adminController.deletePost);
router.post(
  "/admin/add-post",
  adminAuthMiddleware,
  adminPostUpload.array('media', 10),   // ✅ Cloudinary upload
  adminController.postAdminAddPost
);

router.get("/admin/events", adminAuthMiddleware, adminController.getAdminEvents);
router.get("/admin/events/create", adminAuthMiddleware, adminController.getCreateEvent);
router.get("/admin/events/:id", adminAuthMiddleware, adminController.getEventDetails);
router.get("/admin/events/edit/:id", adminAuthMiddleware, adminController.getEditEvent);
router.post("/admin/events/update/:id", adminAuthMiddleware, combinedUpload, adminController.postUpdateEvent);
router.post(
  "/admin/events/create",
  adminAuthMiddleware,
  combinedUpload,
  adminController.postCreateEvent
);
router.get("/admin/coach", adminAuthMiddleware, adminController.getAdminCoach);
router.post("/admin/coach/updateStatus", adminAuthMiddleware, adminController.updateCoachStatus);
router.get("/admin/users", adminAuthMiddleware, adminController.getAdminUsers);
router.post('/admin/users/remove/:player_id', adminAuthMiddleware, adminController.removePlayer);
router.get("/admin/team-request", adminAuthMiddleware, adminController.getAdminTeamRequest);
router.post('/admin/handle-team-request', adminController.handleTeamRequest);
router.get("/admin/registered-team", adminAuthMiddleware, adminController.getAdminRegisteredTeam);




module.exports = router;



