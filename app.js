const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const path = require('path');
const userRoutes = require('./routes/router');
const db = require('./config/db');
const flash = require('connect-flash');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('./models/userModel');
require('dotenv').config();
const { cloudinary } = require('./config/cloudinary');

const app = express();

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware>
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Set up session store
const sessionStore = new MySQLStore({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

app.set('trust proxy', 1);

app.use(session({
    secret: 'your-secret-key',
    resave: true,
    saveUninitialized: true,
    store: sessionStore,
    cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
}

}));

// Middleware to check the session
app.use((req, res, next) => {
    console.log('Session ID:', req.sessionID);
    next();
});

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Google OAuth 2.0 strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
    try {
        console.log('Google profile:', profile);
        
        // First try to find user by google_id
        let user = await User.findByGoogleId(profile.id);
        
        if (!user) {
            // If not found by google_id, try by email
            user = await User.findByEmail(profile.emails[0].value);
            
            if (user) {
                // Update existing user with google_id
                await User.updateUserWithGoogleId(user.id, profile.id);
                user.google_id = profile.id;
            } else {
                // Create new user
                const newUser = {
                    email: profile.emails[0].value,
                    google_id: profile.id,
                    created_at: new Date(),
                    updated_at: new Date(),
                };
                user = await User.createUser(newUser);
            }
        }
        
        console.log('User after Google auth:', user);
        return done(null, user);
    } catch (error) {
        console.error('Google auth error:', error);
        return done(error, null);
    }
}));

// Serialize user to store in the session
passport.serializeUser((user, done) => {
    console.log('Serializing user:', user);
    if (user && (user.id || user.google_id)) {
        done(null, {
            id: user.id,
            google_id: user.google_id
        });
    } else {
        done(new Error('User has no valid identifier'), null);
    }
});

// Deserialize user from the session
passport.deserializeUser(async (obj, done) => {
    console.log('Deserializing user with:', obj);
    try {
        let user;
        if (obj.google_id) {
            user = await User.findByGoogleId(obj.google_id);
        } else if (obj.id) {
            const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [obj.id]);
            user = rows[0];
        }
        
        if (!user) {
            console.error('No user found with:', obj);
            return done(null, false);
        }
        console.log('Deserialized user:', user);
        done(null, user);
    } catch (err) {
        console.error('Error deserializing user:', err);
        done(err, null);
    }
});

// Route to initiate the Google sign-in
app.get('/auth/google', passport.authenticate('google', {
    scope: ['email', 'profile'],
}));

// Google callback route - Modified to properly handle session
app.get('/auth/google/callback', passport.authenticate('google', {
    failureRedirect: '/login',
}), (req, res) => {
    console.log('User authenticated:', req.user);
    
    // Manually set the session user
    req.session.user = req.user;
    
    req.session.save(err => {
        if (err) {
            console.error('Error saving session:', err);
            req.flash('error', 'Failed to save session');
            return res.redirect('/login');
        }
        res.redirect('/homepage');
    });
});

// Make user available in all views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// Flash messages
app.use(flash());
app.use((req, res, next) => {
    res.locals.messages = req.flash();
    next();
});

// Routes
app.use('/', userRoutes);
app.get('/', (req, res) => {
    res.redirect('/login');
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Start server
app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');

});


