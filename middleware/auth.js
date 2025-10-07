// In middleware/auth.js
module.exports = function(req, res, next) {
    // Your existing auth middleware code
    if (!req.user && !req.session.user) {
        req.flash('error', 'You need to log in to access this page.');
        return res.redirect('/login');
    }

    if (!req.user && req.session.user) {
        req.user = req.session.user;
    }

    next();
};

module.exports.checkTermsAccepted = function(req, res, next) {
    // Your existing terms check code
    if (req.path === '/login' || req.path === '/accept-terms' || req.path === '/terms') {
        return next();
    }

    if (!req.user && !req.session.user) {
        return next();
    }

    if (!req.user && req.session.user) {
        req.user = req.session.user;
    }

    if (req.user && !req.user.terms_accepted) {
        return res.redirect('/terms');
    }

    next();
};

// Export both as named exports
module.exports.authMiddleware = module.exports;
module.exports.checkTermsAccepted = module.exports.checkTermsAccepted;