const express = require("express");
const session = require("express-session");
const morgan = require("morgan");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(morgan("dev"));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Session Config
app.use(
	session({
		secret: process.env.SESSION_SECRET || "supersecretkey",
		resave: false,
		saveUninitialized: false,
		cookie: {
			secure: process.env.NODE_ENV === "production", // true in production
			maxAge: 1000 * 60 * 60 * 24,
		},
	})
);

// Global user middleware for EJS
app.use((req, res, next) => {
	res.locals.user = req.session.user || null;
	next();
});

// View Engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Routes
app.use("/auth", require("./routes/auth"));

// Protect routes Example
const { requireRole, isAuthenticated } = require("./middleware/auth");

app.get("/", isAuthenticated, (req, res) => {
	// Redirect based on role if needed, or show a dashboard
	// For now, if admin go to admin dashboard, else show generic home
	if (req.session.user.role === "admin") return res.redirect("/admin");
	if (req.session.user.role === "employee") return res.redirect("/pos");
	if (req.session.user.role === "warehouse") return res.redirect("/warehouse");

	res.render("index", { title: "Inicio" }); // We need an index view or dashboard
});

app.use("/admin", requireRole("admin"), require("./routes/admin"));

// Placeholder routes for now to avoid 404 loops
// app.get('/admin', requireRole('admin'), (req, res) => {
//    res.send('Admin Dashboard (Coming Soon)');
// });
app.use("/pos", requireRole("employee"), require("./routes/pos"));

// app.get('/pos', requireRole('employee'), (req, res) => {
//     res.send('POS System (Coming Soon)');
// });
app.get("/warehouse", requireRole("warehouse"), (req, res) => {
	res.send("Warehouse Management (Coming Soon)");
});

const bcrypt = require("bcryptjs"); // Make sure to require bcrypt

// Auto-seed Admin User
const seedAdminIfEmpty = async () => {
	try {
		const supabase = require("./config/supabase");
		const { count, error } = await supabase
			.from("users")
			.select("*", { count: "exact", head: true });

		if (error) throw error;

		if (count === 0) {
			console.log("No users found. Creating default admin...");
			const hashedPassword = await bcrypt.hash("admin123", 10);
			const { error: insertError } = await supabase
				.from("users")
				.insert([
					{ username: "admin", password_hash: hashedPassword, role: "admin" },
				]);

			if (insertError) throw insertError;
			console.log("Default admin created: admin / admin123");
		}
	} catch (err) {
		console.error("Error seeding admin:", err.message);
	}
};

app.listen(port, async () => {
	await seedAdminIfEmpty();
	console.log(`Server running on http://localhost:${port}`);
});
