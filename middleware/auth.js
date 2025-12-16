const requireRole = (role) => {
	return (req, res, next) => {
		if (!req.session.user) {
			return res.redirect("/auth/login");
		}

		// Admin has access to everything
		if (req.session.user.role === "admin") {
			return next();
		}

		// Allow if roles match exactly
		if (req.session.user.role === role) {
			return next();
		}

		// Specific hierarchy or access logic could go here
		// For now, strict role check unless admin
		return res.status(403).render("error", {
			message: "Access Denied: Insufficient Permissions",
			backUrl: "/",
		});
	};
};

const isAuthenticated = (req, res, next) => {
	if (req.session.user) {
		return next();
	}
	res.redirect("/auth/login");
};

module.exports = { requireRole, isAuthenticated };
