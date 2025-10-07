module.exports = function(req, res, next) {
    // First check if coach session exists
    if (!req.session.coachOnly) {
        req.flash('error', 'You need to log in as a coach to access this page.');
        return req.session.save(() => {
            res.redirect('/coach/login');
        });
    }
    
    // Move flash messages to res.locals
    if (req.session.flash) {
        res.locals.error = req.session.flash.error;
        res.locals.success = req.session.flash.success;
        delete req.session.flash;
    }
    
    // Ensure session is saved before proceeding
    req.session.save((err) => {
        if (err) {
            console.error('Session save error in middleware:', err);
            return res.redirect('/coach/login');
        }
        next();
    });
};