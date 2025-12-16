const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const supabase = require("../config/supabase");

router.get("/login", (req, res) => {
	if (req.session.user) return res.redirect("/");
	res.render("login", { title: "Iniciar Sesión" });
});

router.post("/login", async (req, res) => {
	const { username, password } = req.body;

	try {
		const { data: users, error } = await supabase
			.from("users")
			.select("*")
			.eq("username", username)
			.limit(1);

		if (error) throw error;

		const user = users[0];

		if (!user || !(await bcrypt.compare(password, user.password_hash))) {
			return res.render("login", {
				title: "Iniciar Sesión",
				error: "Credenciales inválidas",
			});
		}

		req.session.user = {
			id: user.id,
			username: user.username,
			role: user.role,
		};

		res.redirect("/");
	} catch (err) {
		console.error("Login Error:", err);
		res.render("login", {
			title: "Iniciar Sesión",
			error: "Ocurrió un error en el servidor",
		});
	}
});

router.get("/logout", (req, res) => {
	req.session.destroy();
	res.redirect("/auth/login");
});

module.exports = router;
